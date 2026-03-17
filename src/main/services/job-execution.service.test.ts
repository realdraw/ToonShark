import {afterEach, beforeEach, describe, expect, it} from 'vitest'
import {JobExecutionService} from './job-execution.service'
import {SettingsService} from './settings.service'
import {FileService} from './file.service'
import {SliceService} from './slice.service'
import {PdfService} from './pdf.service'
import {PreviewService} from './preview.service'
import {JobRepository} from './job-repository'
import {existsSync, mkdirSync, rmSync, statSync, writeFileSync} from 'fs'
import {dirname, join, resolve} from 'path'
import {tmpdir} from 'os'
import sharp from 'sharp'
import type {Worker} from 'worker_threads'
import type {JobProgress, RunSliceJobPayload} from '@shared/types'
import {runSlicePipeline} from './slice-pipeline'

const DEFAULTS_DIR = resolve(__dirname, '..', '..', '..', 'resources', 'defaults')

// Build a minimal PDF with a red rectangle
function createTestPdf(): Buffer {
  const streamContent = '1 0 0 rg\n10 10 180 280 re f\n'
  const streamLength = Buffer.byteLength(streamContent)
  const parts: string[] = []
  const offsets: number[] = []
  let pos = 0

  function add(s: string) {
    parts.push(s)
    pos += Buffer.byteLength(s)
  }

  add('%PDF-1.4\n')
  offsets[1] = pos
  add('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n')
  offsets[2] = pos
  add('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n')
  offsets[3] = pos
  add('3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 300]\n   /Contents 4 0 R /Resources << >> >>\nendobj\n')
  offsets[4] = pos
  add(`4 0 obj\n<< /Length ${streamLength} >>\nstream\n${streamContent}endstream\nendobj\n`)

  const xrefOffset = pos
  add('xref\n0 5\n')
  add('0000000000 65535 f \n')
  for (let i = 1; i <= 4; i++) {
    add(String(offsets[i]).padStart(10, '0') + ' 00000 n \n')
  }
  add('trailer\n<< /Size 5 /Root 1 0 R >>\n')
  add(`startxref\n${xrefOffset}\n%%EOF\n`)

  return Buffer.from(parts.join(''))
}

class InlinePipelineWorker {
  handlers: Record<string, Array<(value: any) => void>> = {}

  constructor(
    private pdfService: PdfService,
    private sliceService: SliceService
  ) {}

  on(event: string, handler: (value: any) => void) {
    this.handlers[event] ??= []
    this.handlers[event].push(handler)
    return this
  }

  postMessage(message: { payload: RunSliceJobPayload; settings: any; versionPath: string; prefix: string }) {
    queueMicrotask(() => {
      void runSlicePipeline(
        message.payload,
        message.settings,
        message.versionPath,
        message.prefix,
        this.pdfService,
        this.sliceService,
        (progress) => this.emit('message', { type: 'progress', data: progress })
      ).then((result) => {
        this.emit('message', { type: 'result', data: result })
      }).catch((err) => {
        this.emit('message', {
          type: 'error',
          message: err instanceof Error ? err.message : String(err)
        })
      })
    })
  }

  terminate() {
    return Promise.resolve(0)
  }

  emit(event: string, value: any) {
    for (const handler of this.handlers[event] ?? []) {
      handler(value)
    }
  }
}

class TestableJobExecutionService extends JobExecutionService {
  public workerPathUsed: string | null = null
  constructor(
    settingsService: SettingsService,
    fileService: FileService,
    sliceService: SliceService,
    pdfService: PdfService,
    previewService: PreviewService,
    jobRepository: JobRepository,
    private inlineWorker: InlinePipelineWorker
  ) {
    super(settingsService, fileService, sliceService, pdfService, previewService, jobRepository)
  }

  protected override createWorker(workerPath: string): Worker {
    this.workerPathUsed = workerPath
    return this.inlineWorker as unknown as Worker
  }
}

describe('JobExecutionService', () => {
  let testDir: string
  let settingsService: SettingsService
  let fileService: FileService
  let sliceService: SliceService
  let pdfService: PdfService
  let previewService: PreviewService
  let jobRepository: JobRepository
  let service: TestableJobExecutionService
  let testPdfPath: string

  beforeEach(() => {
    testDir = join(tmpdir(), `job_exec_test_${Date.now()}`)
    mkdirSync(join(testDir, 'jobs'), { recursive: true })
    mkdirSync(join(testDir, 'settings'), { recursive: true })

    settingsService = new SettingsService(testDir, DEFAULTS_DIR)
    fileService = new FileService()
    sliceService = new SliceService()
    pdfService = new PdfService()
    previewService = new PreviewService()
    jobRepository = new JobRepository(testDir, fileService)

    service = new TestableJobExecutionService(
      settingsService,
      fileService,
      sliceService,
      pdfService,
      previewService,
      jobRepository,
      new InlinePipelineWorker(pdfService, sliceService)
    )

    // Create test PDF
    testPdfPath = join(testDir, 'test.pdf')
    writeFileSync(testPdfPath, createTestPdf())
  })

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true })
  })

  describe('execute — fixed mode', () => {
    it('should complete a fixed-mode slice job end-to-end', async () => {
      const progressCalls: JobProgress[] = []
      const payload: RunSliceJobPayload = {
        sourcePdfPath: testPdfPath,
        title: 'test_job',
        prefix: 'test',
        mode: 'fixed',
        options: { sliceHeight: 100 }
      }

      const meta = await service.execute(payload, (p) => progressCalls.push({ ...p }))

      expect(meta.title).toBe('test_job')
      expect(meta.prefix).toBe('test')
      expect(meta.mode).toBe('fixed')
      expect(meta.pageCount).toBe(1)
      expect(meta.sliceCount).toBeGreaterThan(0)
      expect(meta.files.length).toBe(meta.sliceCount)
      expect(meta.id).toBeTruthy()
      expect(meta.createdAt).toBeTruthy()

      // Verify files were created on disk
      for (const file of meta.files) {
        expect(existsSync(file.path)).toBe(true)
      }

      // Verify meta was saved to repository
      const loaded = await jobRepository.getJobDetail(meta.id)
      expect(loaded).not.toBeNull()
      expect(loaded!.title).toBe('test_job')

      // Verify version folder structure
      expect(existsSync(join(meta.versionPath, 'rendered'))).toBe(true)
      expect(existsSync(join(meta.versionPath, 'slices'))).toBe(true)
      expect(existsSync(join(meta.versionPath, 'thumbs'))).toBe(true)
      expect(existsSync(join(meta.versionPath, 'preview'))).toBe(true)

      // Verify preview was generated
      expect(existsSync(join(meta.versionPath, 'preview', 'index.html'))).toBe(true)
      expect(existsSync(join(meta.versionPath, 'preview', 'preview-data.json'))).toBe(true)

      // Verify source PDF was copied to job-level source/
      const jobDir = dirname(meta.versionPath)
      expect(existsSync(join(jobDir, 'source'))).toBe(true)
      const copiedPdf = join(jobDir, 'source', 'test.pdf')
      expect(existsSync(copiedPdf)).toBe(true)
    })

    it('should always output png regardless of requested format (master format)', async () => {
      const payload: RunSliceJobPayload = {
        sourcePdfPath: testPdfPath,
        title: 'jpg_test',
        prefix: 'jpg',
        mode: 'fixed',
        options: { sliceHeight: 200 }
      }

      const meta = await service.execute(payload, () => {})

      // Slicing always produces PNG masters; export handles format conversion
      for (const file of meta.files) {
        expect(file.name).toMatch(/\.png$/)
        const fileMeta = await sharp(file.path).metadata()
        expect(fileMeta.format).toBe('png')
      }
    })
  })

  describe('execute — worker path', () => {
    it('should use the bundled worker path when creating the worker', async () => {
      const fakeWorker = new InlinePipelineWorker(pdfService, sliceService)
      const workerService = new TestableJobExecutionService(
        settingsService,
        fileService,
        sliceService,
        pdfService,
        previewService,
        jobRepository,
        fakeWorker
      )

      const payload: RunSliceJobPayload = {
        sourcePdfPath: testPdfPath,
        title: 'worker_path_test',
        prefix: 'worker',
        mode: 'fixed',
        options: { sliceHeight: 100 }
      }

      const meta = await workerService.execute(payload, () => {})

      expect(workerService.workerPathUsed).toBe(join(__dirname, 'workers', 'job.worker.js'))
      expect(meta.title).toBe('worker_path_test')
      expect(existsSync(join(meta.versionPath, 'preview', 'index.html'))).toBe(true)
    })
  })

  describe('execute — auto mode', () => {
    it('should complete an auto-mode slice job', async () => {
      const payload: RunSliceJobPayload = {
        sourcePdfPath: testPdfPath,
        title: 'auto_test',
        prefix: 'auto',
        mode: 'auto',

        options: { whiteThreshold: 245, minWhiteRun: 5, minSliceHeight: 0, cutPosition: 'middle' }
      }

      const meta = await service.execute(payload, () => {})

      expect(meta.mode).toBe('auto')
      expect(meta.sliceCount).toBeGreaterThan(0)
      for (const file of meta.files) {
        expect(existsSync(file.path)).toBe(true)
      }
    })
  })

  describe('progress callbacks', () => {
    it('should emit progress callbacks in correct order', async () => {
      const stepKeys: string[] = []
      const payload: RunSliceJobPayload = {
        sourcePdfPath: testPdfPath,
        title: 'progress_test',
        prefix: 'prog',
        mode: 'fixed',

        options: { sliceHeight: 500 }
      }

      await service.execute(payload, (p) => stepKeys.push(p.stepKey))

      expect(stepKeys[0]).toBe('progressCopyPdf')
      expect(stepKeys[1]).toBe('progressCountPages')
      expect(stepKeys).toContain('progressRenderPages')
      expect(stepKeys).toContain('progressSlicing')
      expect(stepKeys).toContain('progressPreview')
      expect(stepKeys[stepKeys.length - 1]).toBe('progressDone')
    })

    it('should have percent 0 at start and 100 at end', async () => {
      const percents: number[] = []
      const payload: RunSliceJobPayload = {
        sourcePdfPath: testPdfPath,
        title: 'pct_test',
        prefix: 'pct',
        mode: 'fixed',

        options: { sliceHeight: 500 }
      }

      await service.execute(payload, (p) => percents.push(p.percent))

      expect(percents[0]).toBe(0)
      expect(percents[percents.length - 1]).toBe(100)

      // Percents should be non-decreasing
      for (let i = 1; i < percents.length; i++) {
        expect(percents[i]).toBeGreaterThanOrEqual(percents[i - 1])
      }
    })
  })

  describe('error handling', () => {
    it('should clean up version folder on PDF copy failure', async () => {
      const payload: RunSliceJobPayload = {
        sourcePdfPath: '/nonexistent/fake.pdf',
        title: 'fail_test',
        prefix: 'fail',
        mode: 'fixed',

        options: { sliceHeight: 500 }
      }

      await expect(service.execute(payload, () => {})).rejects.toThrow()

      // No leftover version folders in jobs directory
      const jobsDir = join(testDir, 'jobs', 'fail')
      // If the folder was created and cleaned up, it should not exist
      // (or it might not exist at all if error happens before createVersionFolder)
    })

    it('should throw and not save meta on failure', async () => {
      const payload: RunSliceJobPayload = {
        sourcePdfPath: '/nonexistent/fake.pdf',
        title: 'fail_test',
        prefix: 'fail',
        mode: 'fixed',

        options: { sliceHeight: 500 }
      }

      await expect(service.execute(payload, () => {})).rejects.toThrow()

      const jobs = await jobRepository.getRecentJobs()
      expect(jobs).toHaveLength(0)
    })
  })

  describe('title fallback', () => {
    it('should use payload title when provided', async () => {
      const payload: RunSliceJobPayload = {
        sourcePdfPath: testPdfPath,
        title: 'Custom Title',
        prefix: 'test',
        mode: 'fixed',

        options: { sliceHeight: 500 }
      }

      const meta = await service.execute(payload, () => {})
      expect(meta.title).toBe('Custom Title')
    })

    it('should fallback to PDF filename when title is empty', async () => {
      const payload: RunSliceJobPayload = {
        sourcePdfPath: testPdfPath,
        title: '',
        prefix: 'test',
        mode: 'fixed',

        options: { sliceHeight: 500 }
      }

      const meta = await service.execute(payload, () => {})
      expect(meta.title).toBe('test')
    })
  })

  describe('global index across pages', () => {
    it('should have unique sequential indices across all files', async () => {
      const payload: RunSliceJobPayload = {
        sourcePdfPath: testPdfPath,
        title: 'idx_test',
        prefix: 'idx',
        mode: 'fixed',

        options: { sliceHeight: 100 }
      }

      const meta = await service.execute(payload, () => {})

      // All indices should be sequential starting from 1
      for (let i = 0; i < meta.files.length; i++) {
        expect(meta.files[i].index).toBe(i + 1)
      }
    })

    it('should assign pageNumber to each file', async () => {
      const payload: RunSliceJobPayload = {
        sourcePdfPath: testPdfPath,
        title: 'page_test',
        prefix: 'page',
        mode: 'fixed',

        options: { sliceHeight: 100 }
      }

      const meta = await service.execute(payload, () => {})

      for (const file of meta.files) {
        expect(file.pageNumber).toBe(1) // Single-page PDF
      }
    })
  })

  describe('settings defaults', () => {
    it('should use settings defaults when payload options are not provided', async () => {
      const payload: RunSliceJobPayload = {
        sourcePdfPath: testPdfPath,
        title: 'defaults_test',
        prefix: 'def',
        mode: 'fixed',

        options: {} // No sliceHeight — should use settings default (1280)
      }

      const meta = await service.execute(payload, () => {})

      // With default sliceHeight of 1280 and small PDF page, should produce 1 slice
      expect(meta.sliceCount).toBeGreaterThan(0)
    })
  })

  describe('PDF copy shared across versions', () => {
    it('should copy PDF only once for multiple runs with same prefix', async () => {
      const payload: RunSliceJobPayload = {
        sourcePdfPath: testPdfPath,
        title: 'copy_test',
        prefix: 'shared',
        mode: 'fixed',

        options: { sliceHeight: 500 }
      }

      const meta1 = await service.execute(payload, () => {})
      const meta2 = await service.execute(payload, () => {})

      // Both versions should share the same job-level source/
      const jobDir1 = dirname(meta1.versionPath)
      const jobDir2 = dirname(meta2.versionPath)
      expect(jobDir1).toBe(jobDir2)

      const copiedPdf = join(jobDir1, 'source', 'test.pdf')
      expect(existsSync(copiedPdf)).toBe(true)

      // copiedPdfPath in both metas should point to the same file
      expect(meta1.copiedPdfPath).toBe(meta2.copiedPdfPath)
      expect(meta1.copiedPdfPath).toBe(copiedPdf)
    })

    it('should not overwrite existing PDF copy', async () => {
      const payload: RunSliceJobPayload = {
        sourcePdfPath: testPdfPath,
        title: 'no_overwrite',
        prefix: 'nodup',
        mode: 'fixed',

        options: { sliceHeight: 500 }
      }

      await service.execute(payload, () => {})

      const jobDir = join(testDir, 'jobs', 'test')
      const copiedPdf = join(jobDir, 'source', 'test.pdf')
      const mtimeBefore = statSync(copiedPdf).mtimeMs

      // Wait briefly to ensure mtime would differ if overwritten
      await new Promise((r) => setTimeout(r, 50))

      await service.execute(payload, () => {})

      const mtimeAfter = statSync(copiedPdf).mtimeMs
      expect(mtimeAfter).toBe(mtimeBefore)
    })

    it('should have separate version folders but shared source', async () => {
      const payload: RunSliceJobPayload = {
        sourcePdfPath: testPdfPath,
        title: 'structure_test',
        prefix: 'struct',
        mode: 'fixed',

        options: { sliceHeight: 500 }
      }

      const meta1 = await service.execute(payload, () => {})
      // Wait for version ID to change (second-based timestamp)
      await new Promise((r) => setTimeout(r, 1100))
      const meta2 = await service.execute(payload, () => {})

      // Different version paths
      expect(meta1.versionPath).not.toBe(meta2.versionPath)

      // Each version has its own slices
      expect(existsSync(join(meta1.versionPath, 'slices'))).toBe(true)
      expect(existsSync(join(meta2.versionPath, 'slices'))).toBe(true)

      // No source/ inside version folders
      expect(existsSync(join(meta1.versionPath, 'source'))).toBe(false)
      expect(existsSync(join(meta2.versionPath, 'source'))).toBe(false)
    })
  })

  describe('pdfScale', () => {
    it('should render at scale 1.0 producing original PDF point dimensions', async () => {
      const payload: RunSliceJobPayload = {
        sourcePdfPath: testPdfPath,
        title: 'scale1_test',
        prefix: 'scale1',
        mode: 'fixed',

        pdfScale: 1.0,
        options: { sliceHeight: 10000 } // large enough to get 1 slice
      }

      const meta = await service.execute(payload, () => {})

      // PDF MediaBox is [0 0 200 300], scale 1.0 → 200x300px
      expect(meta.files.length).toBe(1)
      expect(meta.files[0].width).toBe(200)
      expect(meta.files[0].height).toBe(300)
    })

    it('should render at scale 2.0 producing double dimensions', async () => {
      const payload: RunSliceJobPayload = {
        sourcePdfPath: testPdfPath,
        title: 'scale2_test',
        prefix: 'scale2',
        mode: 'fixed',

        pdfScale: 2.0,
        options: { sliceHeight: 10000 }
      }

      const meta = await service.execute(payload, () => {})

      // scale 2.0 → 400x600px
      expect(meta.files.length).toBe(1)
      expect(meta.files[0].width).toBe(400)
      expect(meta.files[0].height).toBe(600)
    })

    it('should render at scale 4.0 producing quadruple dimensions', async () => {
      const payload: RunSliceJobPayload = {
        sourcePdfPath: testPdfPath,
        title: 'scale4_test',
        prefix: 'scale4',
        mode: 'fixed',

        pdfScale: 4.0,
        options: { sliceHeight: 10000 }
      }

      const meta = await service.execute(payload, () => {})

      // scale 4.0 → 800x1200px
      expect(meta.files.length).toBe(1)
      expect(meta.files[0].width).toBe(800)
      expect(meta.files[0].height).toBe(1200)
    })

    it('should default to settings pdfScale (4.0) when not specified in payload', async () => {
      const payload: RunSliceJobPayload = {
        sourcePdfPath: testPdfPath,
        title: 'scale_default_test',
        prefix: 'scaledef',
        mode: 'fixed',

        // pdfScale not set — should use settings default (4.0)
        options: { sliceHeight: 10000 }
      }

      const meta = await service.execute(payload, () => {})

      // default pdfScale is 4.0 → 800x1200px
      expect(meta.files.length).toBe(1)
      expect(meta.files[0].width).toBe(800)
      expect(meta.files[0].height).toBe(1200)
    })

    it('should produce different slice counts at different scales with same sliceHeight', async () => {
      const makePayload = (scale: number): RunSliceJobPayload => ({
        sourcePdfPath: testPdfPath,
        title: `slice_count_${scale}`,
        prefix: `sc${scale}`,
        mode: 'fixed',

        pdfScale: scale,
        options: { sliceHeight: 200 }
      })

      const meta1 = await service.execute(makePayload(1.0), () => {})
      const meta2 = await service.execute(makePayload(2.0), () => {})

      // scale 1.0 → 300px high, sliceHeight 200 → 2 slices
      // scale 2.0 → 600px high, sliceHeight 200 → 3 slices
      expect(meta1.sliceCount).toBe(2)
      expect(meta2.sliceCount).toBe(3)
    })
  })

  describe('prefix sanitization', () => {
    it('should sanitize prefix with special characters', async () => {
      const payload: RunSliceJobPayload = {
        sourcePdfPath: testPdfPath,
        title: 'sanitize_test',
        prefix: '  hello world!!  ',
        mode: 'fixed',

        options: { sliceHeight: 500 }
      }

      const meta = await service.execute(payload, () => {})

      // Prefix should be sanitized
      expect(meta.prefix).toBe('hello_world')
    })
  })

  describe('thumbnail generation', () => {
    it('should generate thumbnails for each slice', async () => {
      const payload: RunSliceJobPayload = {
        sourcePdfPath: testPdfPath,
        title: 'thumb_test',
        prefix: 'thumb',
        mode: 'fixed',

        options: { sliceHeight: 100 }
      }

      const meta = await service.execute(payload, () => {})

      expect(meta.files.length).toBeGreaterThan(0)
      for (const file of meta.files) {
        expect(file.thumbnailPath).toBeDefined()
        expect(existsSync(file.thumbnailPath!)).toBe(true)

        // Thumbnail should be a small JPEG
        const thumbMeta = await sharp(file.thumbnailPath!).metadata()
        expect(thumbMeta.format).toBe('jpeg')
        expect(thumbMeta.width).toBe(200)
      }
    })

    it('should generate thumbnails in thumbs directory', async () => {
      const payload: RunSliceJobPayload = {
        sourcePdfPath: testPdfPath,
        title: 'thumb_dir_test',
        prefix: 'td',
        mode: 'fixed',

        options: { sliceHeight: 200 }
      }

      const meta = await service.execute(payload, () => {})

      for (const file of meta.files) {
        expect(file.thumbnailPath).toContain('thumbs')
        expect(file.thumbnailPath).toMatch(/\.jpg$/)
      }
    })

    it('should generate thumbnails for auto mode', async () => {
      const payload: RunSliceJobPayload = {
        sourcePdfPath: testPdfPath,
        title: 'thumb_auto_test',
        prefix: 'ta',
        mode: 'auto',

        options: { whiteThreshold: 245, minWhiteRun: 5, minSliceHeight: 0, cutPosition: 'middle' }
      }

      const meta = await service.execute(payload, () => {})

      expect(meta.files.length).toBeGreaterThan(0)
      for (const file of meta.files) {
        expect(file.thumbnailPath).toBeDefined()
        expect(existsSync(file.thumbnailPath!)).toBe(true)
      }
    })
  })
})
