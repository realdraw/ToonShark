import {afterEach, beforeEach, describe, expect, it} from 'vitest'
import {ExportService} from './export.service'
import {SettingsService} from './settings.service'
import {Logger} from './logger.service'
import {existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync} from 'fs'
import {join, resolve} from 'path'
import {tmpdir} from 'os'
import sharp from 'sharp'
import type {ExportPlatformEntry, JobMeta, JobProgress, Platform} from '@shared/types'

const DEFAULTS_DIR = resolve(__dirname, '..', '..', '..', 'resources', 'defaults')

/** Create a solid-color PNG image buffer */
async function createTestImage(width: number, height: number, color = { r: 128, g: 0, b: 0 }): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: color }
  }).png().toBuffer()
}

/** Create a large image that produces a heavy file (random-ish data via noise pattern) */
async function createLargeTestImage(width: number, height: number): Promise<Buffer> {
  // Create a noise-like image that won't compress well
  const rawData = Buffer.alloc(width * height * 3)
  for (let i = 0; i < rawData.length; i++) {
    rawData[i] = (i * 37 + 113) % 256 // pseudo-random pattern
  }
  return sharp(rawData, { raw: { width, height, channels: 3 } }).png().toBuffer()
}

/** Helper to create entries from platforms with a default countryId */
function toEntries(platforms: Platform[], countryId = 'kr'): ExportPlatformEntry[] {
  return platforms.map((platform) => ({ countryId, platform }))
}

describe('ExportService', () => {
  let testDir: string
  let settingsService: SettingsService
  let logger: Logger
  let service: ExportService
  let jobVersionPath: string
  let slicesDir: string

  // Fake JobRepository that returns a fixed JobMeta
  function createFakeJobRepository(meta: JobMeta | null) {
    return {
      getJobDetail: () => meta,
      getRecentJobs: () => [],
      getStorageInfo: () => ({ totalSize: 0, pdfs: [] }),
      deleteJob: () => true,
      deleteJobsByPdf: () => 0,
      deleteAllJobs: () => 0
    } as any
  }

  function collectProgress(fn: (cb: (p: JobProgress) => void) => Promise<any>): Promise<{ result: any; progresses: JobProgress[] }> {
    const progresses: JobProgress[] = []
    return fn((p) => progresses.push(p)).then((result) => ({ result, progresses }))
  }

  beforeEach(() => {
    testDir = join(tmpdir(), `export_test_${Date.now()}`)
    mkdirSync(join(testDir, 'jobs'), { recursive: true })
    mkdirSync(join(testDir, 'settings'), { recursive: true })
    mkdirSync(join(testDir, 'logs'), { recursive: true })

    jobVersionPath = join(testDir, 'jobs', 'test_prefix', '20260101_120000')
    slicesDir = join(jobVersionPath, 'slices')
    mkdirSync(slicesDir, { recursive: true })

    settingsService = new SettingsService(testDir, DEFAULTS_DIR)
    logger = new Logger(testDir)
  })

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true })
  })

  function buildMeta(files: { name: string; path: string; width: number; height: number; index: number }[]): JobMeta {
    return {
      id: 'test-job-id',
      title: 'Test Job',
      prefix: 'test',
      sourcePdfPath: '/fake/source.pdf',
      copiedPdfPath: join(testDir, 'jobs', 'test_prefix', 'source', 'source.pdf'),
      createdAt: '2026-01-01T12:00:00Z',
      mode: 'auto',
      pageCount: 1,
      sliceCount: files.length,
      versionPath: jobVersionPath,
      options: {},
      files
    }
  }

  describe('resize — width별 export', () => {
    it('should resize images to the target platform width', async () => {
      // Source: 1000px wide PNG slice
      const srcWidth = 1000
      const srcHeight = 2000
      const buf = await createTestImage(srcWidth, srcHeight)
      const slicePath = join(slicesDir, 'test_0001.png')
      await sharp(buf).toFile(slicePath)

      const meta = buildMeta([
        { name: 'test_0001.png', path: slicePath, width: srcWidth, height: srcHeight, index: 1 }
      ])

      const platform: Platform = {
        id: 'naver',
        episode: { width: 800, format: 'jpg' }
      }

      service = new ExportService(settingsService, createFakeJobRepository(meta), logger)

      const result = await service.exportJob(
        { jobId: meta.id, entries: toEntries([platform]) },
        () => {}
      )

      expect(result.totalFiles).toBe(1)
      expect(result.platforms).toHaveLength(1)
      expect(result.platforms[0].warnings).toHaveLength(0)

      // Verify the exported file dimensions (now under countryId/platformId)
      const exportedPath = join(jobVersionPath, 'export', 'kr', 'naver', 'test_0001.jpg')
      expect(existsSync(exportedPath)).toBe(true)

      const exportedMeta = await sharp(exportedPath).metadata()
      expect(exportedMeta.width).toBe(800)
      // Height should be proportionally scaled: 2000 * (800/1000) = 1600
      expect(exportedMeta.height).toBe(1600)
      expect(exportedMeta.format).toBe('jpeg')
    })

    it('should resize to different widths for different platforms', async () => {
      const srcWidth = 1000
      const srcHeight = 2000
      const buf = await createTestImage(srcWidth, srcHeight)
      const slicePath = join(slicesDir, 'test_0001.png')
      await sharp(buf).toFile(slicePath)

      const meta = buildMeta([
        { name: 'test_0001.png', path: slicePath, width: srcWidth, height: srcHeight, index: 1 }
      ])

      const entries: ExportPlatformEntry[] = [
        { countryId: 'kr', platform: { id: 'platform_800', episode: { width: 800, format: 'jpg' } } },
        { countryId: 'kr', platform: { id: 'platform_720', episode: { width: 720, format: 'jpg' } } },
        { countryId: 'jp', platform: { id: 'platform_940', episode: { width: 940, format: 'png' } } }
      ]

      service = new ExportService(settingsService, createFakeJobRepository(meta), logger)

      const result = await service.exportJob(
        { jobId: meta.id, entries },
        () => {}
      )

      expect(result.totalFiles).toBe(3)
      expect(result.platforms).toHaveLength(3)

      // Check each platform's output dimensions (now under countryId/platformId)
      const exported800 = await sharp(join(jobVersionPath, 'export', 'kr', 'platform_800', 'test_0001.jpg')).metadata()
      expect(exported800.width).toBe(800)
      expect(exported800.height).toBe(1600)
      expect(exported800.format).toBe('jpeg')

      const exported720 = await sharp(join(jobVersionPath, 'export', 'kr', 'platform_720', 'test_0001.jpg')).metadata()
      expect(exported720.width).toBe(720)
      expect(exported720.height).toBe(1440)
      expect(exported720.format).toBe('jpeg')

      const exported940 = await sharp(join(jobVersionPath, 'export', 'jp', 'platform_940', 'test_0001.png')).metadata()
      expect(exported940.width).toBe(940)
      expect(exported940.height).toBe(1880)
      expect(exported940.format).toBe('png')
    })

    it('should upscale with warning if source is narrower than target width', async () => {
      const srcWidth = 600
      const srcHeight = 1200
      const buf = await createTestImage(srcWidth, srcHeight)
      const slicePath = join(slicesDir, 'test_0001.png')
      await sharp(buf).toFile(slicePath)

      const meta = buildMeta([
        { name: 'test_0001.png', path: slicePath, width: srcWidth, height: srcHeight, index: 1 }
      ])

      const platform: Platform = {
        id: 'wide_platform',
        episode: { width: 800, format: 'jpg' }
      }

      service = new ExportService(settingsService, createFakeJobRepository(meta), logger)

      const result = await service.exportJob(
        { jobId: meta.id, entries: toEntries([platform]) },
        () => {}
      )

      expect(result.totalFiles).toBe(1)

      const exportedMeta = await sharp(join(jobVersionPath, 'export', 'kr', 'wide_platform', 'test_0001.jpg')).metadata()
      // Source is 600px, target is 800px → should upscale to 800px with warning
      expect(exportedMeta.width).toBe(800)

      // Should produce an upscale warning
      expect(result.platforms[0].warnings).toEqual([
        expect.objectContaining({
          message: expect.stringContaining('upscaled')
        })
      ])
    })
  })

  describe('format conversion', () => {
    it('should convert PNG source to JPG output', async () => {
      const buf = await createTestImage(800, 1600)
      const slicePath = join(slicesDir, 'test_0001.png')
      await sharp(buf).toFile(slicePath)

      const meta = buildMeta([
        { name: 'test_0001.png', path: slicePath, width: 800, height: 1600, index: 1 }
      ])

      const platform: Platform = { id: 'jpg_platform', episode: { width: 800, format: 'jpg' } }

      service = new ExportService(settingsService, createFakeJobRepository(meta), logger)
      await service.exportJob({ jobId: meta.id, entries: toEntries([platform]) }, () => {})

      const exportedPath = join(jobVersionPath, 'export', 'kr', 'jpg_platform', 'test_0001.jpg')
      expect(existsSync(exportedPath)).toBe(true)
      const exportedMeta = await sharp(exportedPath).metadata()
      expect(exportedMeta.format).toBe('jpeg')
    })

    it('should keep PNG format when platform requests PNG', async () => {
      const buf = await createTestImage(800, 1600)
      const slicePath = join(slicesDir, 'test_0001.png')
      await sharp(buf).toFile(slicePath)

      const meta = buildMeta([
        { name: 'test_0001.png', path: slicePath, width: 800, height: 1600, index: 1 }
      ])

      const platform: Platform = { id: 'png_platform', episode: { width: 800, format: 'png' } }

      service = new ExportService(settingsService, createFakeJobRepository(meta), logger)
      await service.exportJob({ jobId: meta.id, entries: toEntries([platform]) }, () => {})

      const exportedPath = join(jobVersionPath, 'export', 'kr', 'png_platform', 'test_0001.png')
      expect(existsSync(exportedPath)).toBe(true)
      const exportedMeta = await sharp(exportedPath).metadata()
      expect(exportedMeta.format).toBe('png')
    })
  })

  describe('multiple slices', () => {
    it('should export all slices for each platform', async () => {
      const sliceFiles: { name: string; path: string; width: number; height: number; index: number }[] = []

      for (let i = 1; i <= 5; i++) {
        const buf = await createTestImage(1000, 1280)
        const name = `test_${String(i).padStart(4, '0')}.png`
        const path = join(slicesDir, name)
        await sharp(buf).toFile(path)
        sliceFiles.push({ name, path, width: 1000, height: 1280, index: i })
      }

      const meta = buildMeta(sliceFiles)

      const entries: ExportPlatformEntry[] = [
        { countryId: 'kr', platform: { id: 'p1', episode: { width: 800, format: 'jpg' } } },
        { countryId: 'kr', platform: { id: 'p2', episode: { width: 720, format: 'png' } } }
      ]

      service = new ExportService(settingsService, createFakeJobRepository(meta), logger)
      const result = await service.exportJob({ jobId: meta.id, entries }, () => {})

      expect(result.totalFiles).toBe(10) // 5 slices × 2 platforms
      expect(result.platforms[0].fileCount).toBe(5)
      expect(result.platforms[1].fileCount).toBe(5)

      // Verify all files exist (now under countryId/platformId)
      const p1Files = readdirSync(join(jobVersionPath, 'export', 'kr', 'p1'))
      expect(p1Files).toHaveLength(5)
      expect(p1Files.every((f) => f.endsWith('.jpg'))).toBe(true)

      const p2Files = readdirSync(join(jobVersionPath, 'export', 'kr', 'p2'))
      expect(p2Files).toHaveLength(5)
      expect(p2Files.every((f) => f.endsWith('.png'))).toBe(true)
    })
  })

  describe('maxFileSizeMB — JPG fixed quality + size warning', () => {
    it('should export JPG at the given quality without warnings when under size limit', async () => {
      const buf = await createLargeTestImage(1000, 2000)
      const slicePath = join(slicesDir, 'test_0001.png')
      await sharp(buf).toFile(slicePath)

      const meta = buildMeta([
        { name: 'test_0001.png', path: slicePath, width: 1000, height: 2000, index: 1 }
      ])

      const platform: Platform = {
        id: 'limited',
        episode: { width: 800, format: 'jpg', maxFileSizeMB: 5 }
      }

      service = new ExportService(settingsService, createFakeJobRepository(meta), logger)
      const result = await service.exportJob({ jobId: meta.id, entries: toEntries([platform]) }, () => {}, 85)

      expect(result.totalFiles).toBe(1)
      expect(result.platforms[0].warnings).toHaveLength(0)

      const exportedPath = join(jobVersionPath, 'export', 'kr', 'limited', 'test_0001.jpg')
      expect(existsSync(exportedPath)).toBe(true)
    })

    it('should warn when JPG file exceeds limit at the given quality', async () => {
      const buf = await createLargeTestImage(2000, 4000)
      const slicePath = join(slicesDir, 'test_0001.png')
      await sharp(buf).toFile(slicePath)

      const meta = buildMeta([
        { name: 'test_0001.png', path: slicePath, width: 2000, height: 4000, index: 1 }
      ])

      const platform: Platform = {
        id: 'tiny_limit',
        episode: { width: 2000, format: 'jpg', maxFileSizeMB: 0.001 }
      }

      service = new ExportService(settingsService, createFakeJobRepository(meta), logger)
      const result = await service.exportJob({ jobId: meta.id, entries: toEntries([platform]) }, () => {}, 90)

      expect(result.totalFiles).toBe(1)
      expect(result.totalWarnings).toBeGreaterThan(0)
      expect(result.platforms[0].warnings).toHaveLength(1)
      expect(result.platforms[0].warnings[0].message).toContain('exceeds limit')
      expect(result.platforms[0].warnings[0].message).toContain('quality: 90')
    })

    it('should use the provided jpgQuality value (not auto-reduce)', async () => {
      const buf = await createLargeTestImage(1000, 2000)
      const slicePath = join(slicesDir, 'test_0001.png')
      await sharp(buf).toFile(slicePath)

      const meta = buildMeta([
        { name: 'test_0001.png', path: slicePath, width: 1000, height: 2000, index: 1 }
      ])

      const platform: Platform = {
        id: 'quality_test',
        episode: { width: 800, format: 'jpg' }
      }

      service = new ExportService(settingsService, createFakeJobRepository(meta), logger)

      // Export at quality 70 and 100 — file sizes should differ
      const result70 = await service.exportJob({ jobId: meta.id, entries: toEntries([platform]) }, () => {}, 70)
      const path70 = join(jobVersionPath, 'export', 'kr', 'quality_test', 'test_0001.jpg')
      const size70 = statSync(path70).size

      // Clean up and re-export at quality 100
      rmSync(join(jobVersionPath, 'export'), { recursive: true, force: true })

      const result100 = await service.exportJob({ jobId: meta.id, entries: toEntries([platform]) }, () => {}, 100)
      const path100 = join(jobVersionPath, 'export', 'kr', 'quality_test', 'test_0001.jpg')
      const size100 = statSync(path100).size

      expect(result70.totalFiles).toBe(1)
      expect(result100.totalFiles).toBe(1)
      // Higher quality should produce a larger file
      expect(size100).toBeGreaterThan(size70)
    })

    it('should warn when PNG file exceeds size limit', async () => {
      const buf = await createLargeTestImage(1000, 2000)
      const slicePath = join(slicesDir, 'test_0001.png')
      await sharp(buf).toFile(slicePath)

      const meta = buildMeta([
        { name: 'test_0001.png', path: slicePath, width: 1000, height: 2000, index: 1 }
      ])

      const platform: Platform = {
        id: 'png_limited',
        episode: { width: 1000, format: 'png', maxFileSizeMB: 0.001 }
      }

      service = new ExportService(settingsService, createFakeJobRepository(meta), logger)
      const result = await service.exportJob({ jobId: meta.id, entries: toEntries([platform]) }, () => {})

      expect(result.totalFiles).toBe(1)
      expect(result.totalWarnings).toBe(1)
      expect(result.platforms[0].warnings[0].message).toContain('exceeds limit')
    })

    it('should skip size check when maxFileSizeMB is not set', async () => {
      const buf = await createLargeTestImage(1000, 2000)
      const slicePath = join(slicesDir, 'test_0001.png')
      await sharp(buf).toFile(slicePath)

      const meta = buildMeta([
        { name: 'test_0001.png', path: slicePath, width: 1000, height: 2000, index: 1 }
      ])

      const platform: Platform = {
        id: 'no_limit',
        episode: { width: 800, format: 'jpg' }
      }

      service = new ExportService(settingsService, createFakeJobRepository(meta), logger)
      const result = await service.exportJob({ jobId: meta.id, entries: toEntries([platform]) }, () => {})

      expect(result.totalFiles).toBe(1)
      expect(result.totalWarnings).toBe(0)
    })
  })

  describe('output directory structure', () => {
    it('should create separate directories per country/platform under export/', async () => {
      const buf = await createTestImage(800, 1600)
      const slicePath = join(slicesDir, 'test_0001.png')
      await sharp(buf).toFile(slicePath)

      const meta = buildMeta([
        { name: 'test_0001.png', path: slicePath, width: 800, height: 1600, index: 1 }
      ])

      const entries: ExportPlatformEntry[] = [
        { countryId: 'kr', platform: { id: 'naver_webtoon', episode: { width: 800, format: 'jpg' } } },
        { countryId: 'kr', platform: { id: 'kakao_webtoon', episode: { width: 720, format: 'jpg' } } }
      ]

      service = new ExportService(settingsService, createFakeJobRepository(meta), logger)
      await service.exportJob({ jobId: meta.id, entries }, () => {})

      const exportDir = join(jobVersionPath, 'export')
      expect(existsSync(exportDir)).toBe(true)
      expect(existsSync(join(exportDir, 'kr', 'naver_webtoon'))).toBe(true)
      expect(existsSync(join(exportDir, 'kr', 'kakao_webtoon'))).toBe(true)
    })

    it('should separate same platform ID under different countries', async () => {
      const buf = await createTestImage(800, 1600)
      const slicePath = join(slicesDir, 'test_0001.png')
      await sharp(buf).toFile(slicePath)

      const meta = buildMeta([
        { name: 'test_0001.png', path: slicePath, width: 800, height: 1600, index: 1 }
      ])

      const entries: ExportPlatformEntry[] = [
        { countryId: 'kr', platform: { id: 'line_manga', episode: { width: 800, format: 'jpg' } } },
        { countryId: 'jp', platform: { id: 'line_manga', episode: { width: 800, format: 'jpg' } } }
      ]

      service = new ExportService(settingsService, createFakeJobRepository(meta), logger)
      const result = await service.exportJob({ jobId: meta.id, entries }, () => {})

      expect(result.totalFiles).toBe(2)
      expect(existsSync(join(jobVersionPath, 'export', 'kr', 'line_manga', 'test_0001.jpg'))).toBe(true)
      expect(existsSync(join(jobVersionPath, 'export', 'jp', 'line_manga', 'test_0001.jpg'))).toBe(true)
    })

    it('should sanitize countryId and platformId for folder names', async () => {
      const buf = await createTestImage(800, 1600)
      const slicePath = join(slicesDir, 'test_0001.png')
      await sharp(buf).toFile(slicePath)

      const meta = buildMeta([
        { name: 'test_0001.png', path: slicePath, width: 800, height: 1600, index: 1 }
      ])

      const entries: ExportPlatformEntry[] = [
        { countryId: '한국/Korea', platform: { id: 'naver webtoon!', episode: { width: 800, format: 'jpg' } } }
      ]

      service = new ExportService(settingsService, createFakeJobRepository(meta), logger)
      await service.exportJob({ jobId: meta.id, entries }, () => {})

      // Sanitized: '한국/Korea' → '_Korea', 'naver webtoon!' → 'naver_webtoon'
      expect(existsSync(join(jobVersionPath, 'export', 'Korea', 'naver_webtoon', 'test_0001.jpg'))).toBe(true)
    })
  })

  describe('progress callback', () => {
    it('should report progress for each platform and finish with done', async () => {
      const buf = await createTestImage(800, 1600)
      const slicePath = join(slicesDir, 'test_0001.png')
      await sharp(buf).toFile(slicePath)

      const meta = buildMeta([
        { name: 'test_0001.png', path: slicePath, width: 800, height: 1600, index: 1 }
      ])

      const entries: ExportPlatformEntry[] = [
        { countryId: 'kr', platform: { id: 'p1', episode: { width: 800, format: 'jpg' } } },
        { countryId: 'kr', platform: { id: 'p2', episode: { width: 720, format: 'jpg' } } }
      ]

      service = new ExportService(settingsService, createFakeJobRepository(meta), logger)

      const { result, progresses } = await collectProgress((cb) =>
        service.exportJob({ jobId: meta.id, entries }, cb)
      )

      // Should have progress for each platform + final done
      expect(progresses.length).toBe(3) // 2 exporting + 1 done
      expect(progresses[0].stepKey).toBe('progressExporting')
      expect(progresses[0].current).toBe(1)
      expect(progresses[1].stepKey).toBe('progressExporting')
      expect(progresses[1].current).toBe(2)
      expect(progresses[2].stepKey).toBe('progressDone')
      expect(progresses[2].percent).toBe(100)
    })
  })

  describe('error handling', () => {
    it('should throw when job is not found', async () => {
      service = new ExportService(settingsService, createFakeJobRepository(null), logger)

      await expect(
        service.exportJob({ jobId: 'nonexistent', entries: [] }, () => {})
      ).rejects.toThrow('Job nonexistent not found')
    })

    it('should continue exporting other files when one file fails', async () => {
      const buf = await createTestImage(800, 1600)
      const slicePath = join(slicesDir, 'test_0002.png')
      await sharp(buf).toFile(slicePath)

      // First file points to non-existent path
      const meta = buildMeta([
        { name: 'test_0001.png', path: join(slicesDir, 'nonexistent.png'), width: 800, height: 1600, index: 1 },
        { name: 'test_0002.png', path: slicePath, width: 800, height: 1600, index: 2 }
      ])

      const platform: Platform = { id: 'p1', episode: { width: 800, format: 'jpg' } }

      service = new ExportService(settingsService, createFakeJobRepository(meta), logger)
      const result = await service.exportJob({ jobId: meta.id, entries: toEntries([platform]) }, () => {})

      // First file fails, second succeeds
      expect(result.totalFiles).toBe(1)
      expect(result.totalWarnings).toBe(1)
      expect(result.platforms[0].warnings[0].message).toContain('Export failed')
    })
  })

  describe('filename extension', () => {
    it('should change file extension from .png to .jpg when exporting as JPG', async () => {
      const buf = await createTestImage(800, 1600)
      const slicePath = join(slicesDir, 'slice_0001.png')
      await sharp(buf).toFile(slicePath)

      const meta = buildMeta([
        { name: 'slice_0001.png', path: slicePath, width: 800, height: 1600, index: 1 }
      ])

      const platform: Platform = { id: 'test', episode: { width: 800, format: 'jpg' } }

      service = new ExportService(settingsService, createFakeJobRepository(meta), logger)
      await service.exportJob({ jobId: meta.id, entries: toEntries([platform]) }, () => {})

      const files = readdirSync(join(jobVersionPath, 'export', 'kr', 'test'))
      expect(files).toEqual(['slice_0001.jpg'])
    })

    it('should keep .png extension when exporting as PNG', async () => {
      const buf = await createTestImage(800, 1600)
      const slicePath = join(slicesDir, 'slice_0001.png')
      await sharp(buf).toFile(slicePath)

      const meta = buildMeta([
        { name: 'slice_0001.png', path: slicePath, width: 800, height: 1600, index: 1 }
      ])

      const platform: Platform = { id: 'test', episode: { width: 800, format: 'png' } }

      service = new ExportService(settingsService, createFakeJobRepository(meta), logger)
      await service.exportJob({ jobId: meta.id, entries: toEntries([platform]) }, () => {})

      const files = readdirSync(join(jobVersionPath, 'export', 'kr', 'test'))
      expect(files).toEqual(['slice_0001.png'])
    })
  })

  describe('export history', () => {
    async function setupSlice() {
      const buf = await createTestImage(800, 1600)
      const slicePath = join(slicesDir, 'test_0001.png')
      await sharp(buf).toFile(slicePath)
      return buildMeta([
        { name: 'test_0001.png', path: slicePath, width: 800, height: 1600, index: 1 }
      ])
    }

    const historyPath = () => join(jobVersionPath, 'export', 'export-history.json')

    // S1. 내보내기 이력 저장
    it('S1: should save export history after export', async () => {
      const meta = await setupSlice()
      const platform: Platform = { id: 'naver', episode: { width: 800, format: 'jpg' } }

      service = new ExportService(settingsService, createFakeJobRepository(meta), logger)
      await service.exportJob({ jobId: meta.id, entries: toEntries([platform]) }, () => {})

      expect(existsSync(historyPath())).toBe(true)
      const history = JSON.parse(readFileSync(historyPath(), 'utf-8'))
      expect(history.exports).toHaveLength(1)
      expect(history.exports[0].countryId).toBe('kr')
      expect(history.exports[0].platformId).toBe('naver')
      expect(history.exports[0].fileCount).toBe(1)
      expect(history.exports[0].exportedAt).toBeTruthy()
    })

    // S2. 이력 조회
    it('S2: should return export history via getExportHistory', async () => {
      const meta = await setupSlice()
      const platform: Platform = { id: 'naver', episode: { width: 800, format: 'jpg' } }
      const repo = createFakeJobRepository(meta)

      service = new ExportService(settingsService, repo, logger)
      await service.exportJob({ jobId: meta.id, entries: toEntries([platform]) }, () => {})

      const history = service.getExportHistory(meta.versionPath)
      expect(history).toHaveLength(1)
      expect(history[0].countryId).toBe('kr')
      expect(history[0].platformId).toBe('naver')
    })

    // S3. 이력 없을 때 빈 배열 반환
    it('S3: should return empty array when no history exists', () => {
      service = new ExportService(settingsService, createFakeJobRepository(null), logger)
      const history = service.getExportHistory(jobVersionPath)
      expect(history).toEqual([])
    })

    // S4. 여러 플랫폼 순차 내보내기
    it('S4: should accumulate history across multiple exports', async () => {
      const meta = await setupSlice()
      const repo = createFakeJobRepository(meta)
      service = new ExportService(settingsService, repo, logger)

      // First export: platform A
      await service.exportJob(
        { jobId: meta.id, entries: [{ countryId: 'kr', platform: { id: 'naver', episode: { width: 800, format: 'jpg' } } }] },
        () => {}
      )

      // Second export: platform B
      await service.exportJob(
        { jobId: meta.id, entries: [{ countryId: 'kr', platform: { id: 'kakao', episode: { width: 720, format: 'jpg' } } }] },
        () => {}
      )

      const history = service.getExportHistory(meta.versionPath)
      expect(history).toHaveLength(2)
      expect(history.map((h) => h.platformId).sort()).toEqual(['kakao', 'naver'])
    })

    // S5. 동일 플랫폼 재내보내기 시 이력 갱신
    it('S5: should update existing entry when re-exporting same platform', async () => {
      const meta = await setupSlice()
      const repo = createFakeJobRepository(meta)
      service = new ExportService(settingsService, repo, logger)

      // First export
      await service.exportJob(
        { jobId: meta.id, entries: [{ countryId: 'kr', platform: { id: 'naver', episode: { width: 800, format: 'jpg' } } }] },
        () => {}
      )

      const firstHistory = service.getExportHistory(meta.versionPath)
      const firstDate = firstHistory[0].exportedAt

      // Wait a tiny bit to ensure timestamp differs
      await new Promise((r) => setTimeout(r, 10))

      // Re-export same platform
      await service.exportJob(
        { jobId: meta.id, entries: [{ countryId: 'kr', platform: { id: 'naver', episode: { width: 800, format: 'jpg' } } }] },
        () => {}
      )

      const history = service.getExportHistory(meta.versionPath)
      expect(history).toHaveLength(1) // no duplicate
      expect(history[0].exportedAt).not.toBe(firstDate) // updated timestamp
    })

    // E1. export-history.json이 깨진 경우
    it('E1: should return empty array when history file is corrupted', async () => {
      mkdirSync(join(jobVersionPath, 'export'), { recursive: true })
      writeFileSync(historyPath(), 'not valid json')

      service = new ExportService(settingsService, createFakeJobRepository(null), logger)
      const history = service.getExportHistory(jobVersionPath)
      expect(history).toEqual([])
    })

    // E2. 한 번에 여러 플랫폼 내보내기
    it('E2: should record all platforms when exporting multiple at once', async () => {
      const meta = await setupSlice()
      service = new ExportService(settingsService, createFakeJobRepository(meta), logger)

      await service.exportJob(
        {
          jobId: meta.id,
          entries: [
            { countryId: 'kr', platform: { id: 'naver', episode: { width: 800, format: 'jpg' } } },
            { countryId: 'kr', platform: { id: 'kakao', episode: { width: 720, format: 'jpg' } } }
          ]
        },
        () => {}
      )

      const history = service.getExportHistory(meta.versionPath)
      expect(history).toHaveLength(2)
    })

    // E3. 같은 platformId, 다른 countryId는 별도 이력
    it('E3: should keep separate history for same platform in different countries', async () => {
      const meta = await setupSlice()
      service = new ExportService(settingsService, createFakeJobRepository(meta), logger)

      await service.exportJob(
        {
          jobId: meta.id,
          entries: [
            { countryId: 'kr', platform: { id: 'line_manga', episode: { width: 800, format: 'jpg' } } },
            { countryId: 'jp', platform: { id: 'line_manga', episode: { width: 800, format: 'jpg' } } }
          ]
        },
        () => {}
      )

      const history = service.getExportHistory(meta.versionPath)
      expect(history).toHaveLength(2)
      expect(history.map((h) => h.countryId).sort()).toEqual(['jp', 'kr'])
    })
  })

  describe('getThumbnailDir', () => {
    it('should return null when no export directory exists', () => {
      const meta = buildMeta([])
      service = new ExportService(settingsService, createFakeJobRepository(meta), logger)

      expect(service.getThumbnailDir(meta.versionPath)).toBeNull()
    })

    it('should return thumbnail directory when thumbnails exist', async () => {
      const buf = await createTestImage(1000, 2000)
      const slicePath = join(slicesDir, 'test_0001.png')
      await sharp(buf).toFile(slicePath)

      const meta = buildMeta([
        { name: 'test_0001.png', path: slicePath, width: 1000, height: 2000, index: 1 }
      ])

      const countries = [{
        id: 'kr',
        platforms: [{
          id: 'naver',
          episode: { width: 690, format: 'png' as const },
          thumbnail: { width: 1200, height: 630, format: 'jpg' as const }
        }]
      }]

      service = new ExportService(settingsService, createFakeJobRepository(meta), logger)

      await service.captureThumbnail({
        jobId: meta.id,
        sliceIndex: 1,
        countryId: 'kr',
        platformId: 'naver',
        crop: { x: 0, y: 0, width: 1000, height: 525 }
      }, countries)

      const dir = service.getThumbnailDir(meta.versionPath)
      expect(dir).not.toBeNull()
      expect(dir).toContain(join('export', 'kr', 'naver', 'thumbnail'))
    })

    it('should return null when export dir exists but has no thumbnails', () => {
      const meta = buildMeta([])
      mkdirSync(join(meta.versionPath, 'export', 'kr', 'naver'), { recursive: true })
      service = new ExportService(settingsService, createFakeJobRepository(meta), logger)

      expect(service.getThumbnailDir(meta.versionPath)).toBeNull()
    })
  })

  describe('captureThumbnail', () => {
    const countries = [
      {
        id: 'kr',
        platforms: [
          {
            id: 'naver',
            episode: { width: 690, format: 'png' as const },
            thumbnail: { width: 1200, height: 630, format: 'jpg' as const, maxFileSizeMB: 5 }
          },
          {
            id: 'ridi',
            episode: { width: 580, format: 'png' as const }
            // no thumbnail
          }
        ]
      }
    ]

    it('should crop and resize slice to thumbnail spec', async () => {
      const srcWidth = 1000
      const srcHeight = 3000
      const buf = await createTestImage(srcWidth, srcHeight)
      const slicePath = join(slicesDir, 'test_0001.png')
      await sharp(buf).toFile(slicePath)

      const meta = buildMeta([
        { name: 'test_0001.png', path: slicePath, width: srcWidth, height: srcHeight, index: 1 }
      ])

      service = new ExportService(settingsService, createFakeJobRepository(meta), logger)

      const result = await service.captureThumbnail(
        {
          jobId: meta.id,
          sliceIndex: 1,
          countryId: 'kr',
          platformId: 'naver',
          crop: { x: 0, y: 0, width: 1000, height: 525 } // 1200:630 ratio ≈ 1.905
        },
        countries
      )

      expect(result.width).toBe(1200)
      expect(result.height).toBe(630)
      expect(result.upscaled).toBe(true)
      expect(result.sourceSize).toEqual({ width: 1000, height: 525 })
      expect(existsSync(result.outputPath)).toBe(true)

      const outputMeta = await sharp(result.outputPath).metadata()
      expect(outputMeta.width).toBe(1200)
      expect(outputMeta.height).toBe(630)
      expect(outputMeta.format).toBe('jpeg')
    })

    it('should not flag upscale when crop region is larger than thumbnail spec', async () => {
      const buf = await createTestImage(2000, 4000)
      const slicePath = join(slicesDir, 'test_0001.png')
      await sharp(buf).toFile(slicePath)

      const meta = buildMeta([
        { name: 'test_0001.png', path: slicePath, width: 2000, height: 4000, index: 1 }
      ])

      service = new ExportService(settingsService, createFakeJobRepository(meta), logger)

      const result = await service.captureThumbnail(
        {
          jobId: meta.id,
          sliceIndex: 1,
          countryId: 'kr',
          platformId: 'naver',
          crop: { x: 0, y: 0, width: 1500, height: 788 }
        },
        countries
      )

      expect(result.upscaled).toBe(false)
      expect(result.sourceSize).toBeUndefined()
    })

    it('should save thumbnail in correct directory structure', async () => {
      const buf = await createTestImage(1000, 2000)
      const slicePath = join(slicesDir, 'test_0001.png')
      await sharp(buf).toFile(slicePath)

      const meta = buildMeta([
        { name: 'test_0001.png', path: slicePath, width: 1000, height: 2000, index: 1 }
      ])

      service = new ExportService(settingsService, createFakeJobRepository(meta), logger)

      const result = await service.captureThumbnail(
        {
          jobId: meta.id,
          sliceIndex: 1,
          countryId: 'kr',
          platformId: 'naver',
          crop: { x: 0, y: 0, width: 1000, height: 525 }
        },
        countries
      )

      // Should be under export/kr/naver/thumbnail/ with platform and sequence number
      expect(result.outputPath).toContain(join('export', 'kr', 'naver', 'thumbnail', 'test_0001_naver_00001.jpg'))
    })

    it('should throw when platform has no thumbnail spec', async () => {
      const buf = await createTestImage(1000, 2000)
      const slicePath = join(slicesDir, 'test_0001.png')
      await sharp(buf).toFile(slicePath)

      const meta = buildMeta([
        { name: 'test_0001.png', path: slicePath, width: 1000, height: 2000, index: 1 }
      ])

      service = new ExportService(settingsService, createFakeJobRepository(meta), logger)

      await expect(
        service.captureThumbnail(
          {
            jobId: meta.id,
            sliceIndex: 1,
            countryId: 'kr',
            platformId: 'ridi', // no thumbnail spec
            crop: { x: 0, y: 0, width: 500, height: 500 }
          },
          countries
        )
      ).rejects.toThrow('No thumbnail spec')
    })

    it('should throw when job is not found', async () => {
      service = new ExportService(settingsService, createFakeJobRepository(null), logger)

      await expect(
        service.captureThumbnail(
          {
            jobId: 'nonexistent',
            sliceIndex: 1,
            countryId: 'kr',
            platformId: 'naver',
            crop: { x: 0, y: 0, width: 100, height: 50 }
          },
          countries
        )
      ).rejects.toThrow('Job nonexistent not found')
    })

    it('should throw when slice index is not found', async () => {
      const buf = await createTestImage(1000, 2000)
      const slicePath = join(slicesDir, 'test_0001.png')
      await sharp(buf).toFile(slicePath)

      const meta = buildMeta([
        { name: 'test_0001.png', path: slicePath, width: 1000, height: 2000, index: 1 }
      ])

      service = new ExportService(settingsService, createFakeJobRepository(meta), logger)

      await expect(
        service.captureThumbnail(
          {
            jobId: meta.id,
            sliceIndex: 99, // doesn't exist
            countryId: 'kr',
            platformId: 'naver',
            crop: { x: 0, y: 0, width: 100, height: 50 }
          },
          countries
        )
      ).rejects.toThrow('Slice 99 not found')
    })

    it('should include platform ID in thumbnail filename', async () => {
      const buf = await createTestImage(1000, 2000)
      const slicePath = join(slicesDir, 'test_0001.png')
      await sharp(buf).toFile(slicePath)

      const meta = buildMeta([
        { name: 'test_0001.png', path: slicePath, width: 1000, height: 2000, index: 1 }
      ])

      service = new ExportService(settingsService, createFakeJobRepository(meta), logger)

      const result = await service.captureThumbnail(
        {
          jobId: meta.id,
          sliceIndex: 1,
          countryId: 'kr',
          platformId: 'naver',
          crop: { x: 0, y: 0, width: 1000, height: 525 }
        },
        countries
      )

      expect(result.outputPath).toMatch(/test_0001_naver_00001\.jpg$/)
    })

    it('should create new file instead of overwriting on repeated capture', async () => {
      const buf = await createTestImage(1000, 2000)
      const slicePath = join(slicesDir, 'test_0001.png')
      await sharp(buf).toFile(slicePath)

      const meta = buildMeta([
        { name: 'test_0001.png', path: slicePath, width: 1000, height: 2000, index: 1 }
      ])

      service = new ExportService(settingsService, createFakeJobRepository(meta), logger)

      const payload = {
        jobId: meta.id,
        sliceIndex: 1,
        countryId: 'kr',
        platformId: 'naver',
        crop: { x: 0, y: 0, width: 1000, height: 525 }
      }

      const result1 = await service.captureThumbnail(payload, countries)
      const result2 = await service.captureThumbnail(payload, countries)
      const result3 = await service.captureThumbnail(payload, countries)

      expect(result1.outputPath).toMatch(/test_0001_naver_00001\.jpg$/)
      expect(result2.outputPath).toMatch(/test_0001_naver_00002\.jpg$/)
      expect(result3.outputPath).toMatch(/test_0001_naver_00003\.jpg$/)

      // All three files should exist
      expect(existsSync(result1.outputPath)).toBe(true)
      expect(existsSync(result2.outputPath)).toBe(true)
      expect(existsSync(result3.outputPath)).toBe(true)
    })

    it('should produce PNG when thumbnail spec requests PNG', async () => {
      const pngCountries = [
        {
          id: 'kr',
          platforms: [
            {
              id: 'png_platform',
              episode: { width: 690, format: 'png' as const },
              thumbnail: { width: 800, height: 400, format: 'png' as const }
            }
          ]
        }
      ]

      const buf = await createTestImage(1000, 2000)
      const slicePath = join(slicesDir, 'test_0001.png')
      await sharp(buf).toFile(slicePath)

      const meta = buildMeta([
        { name: 'test_0001.png', path: slicePath, width: 1000, height: 2000, index: 1 }
      ])

      service = new ExportService(settingsService, createFakeJobRepository(meta), logger)

      const result = await service.captureThumbnail(
        {
          jobId: meta.id,
          sliceIndex: 1,
          countryId: 'kr',
          platformId: 'png_platform',
          crop: { x: 0, y: 0, width: 1000, height: 500 }
        },
        pngCountries
      )

      const outputMeta = await sharp(result.outputPath).metadata()
      expect(outputMeta.format).toBe('png')
      expect(outputMeta.width).toBe(800)
      expect(outputMeta.height).toBe(400)
    })
  })
})
