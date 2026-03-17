import {afterEach, beforeEach, describe, expect, it} from 'vitest'
import {JobRepository} from './job-repository'
import {FileService} from './file.service'
import {existsSync, mkdirSync, rmSync, writeFileSync} from 'fs'
import {join} from 'path'
import {tmpdir} from 'os'
import type {JobMeta} from '@shared/types'

function createTestJob(
  baseDir: string,
  title: string,
  versionId: string,
  createdAt: string
): JobMeta {
  const versionPath = join(baseDir, 'jobs', title, versionId)
  mkdirSync(join(versionPath, 'slices'), { recursive: true })
  mkdirSync(join(versionPath, 'preview'), { recursive: true })

  const meta: JobMeta = {
    id: `${title}_${versionId}`,
    title,
    prefix: title,
    sourcePdfPath: '/tmp/test.pdf',
    copiedPdfPath: join(versionPath, 'source', 'test.pdf'),
    createdAt,
    mode: 'fixed',

    pageCount: 1,
    sliceCount: 3,
    versionPath,
    options: { sliceHeight: 1000 },
    files: [
      { name: `${title}_0001.png`, path: join(versionPath, 'slices', `${title}_0001.png`), width: 720, height: 1000, index: 1 }
    ]
  }

  writeFileSync(join(versionPath, 'meta.json'), JSON.stringify(meta, null, 2))
  return meta
}

function createSourceOnlyCache(baseDir: string, folderName: string, pdfName: string, size: number = 1024): string {
  const jobPath = join(baseDir, 'jobs', folderName)
  const sourceDir = join(jobPath, 'source')
  mkdirSync(sourceDir, { recursive: true })
  writeFileSync(join(sourceDir, pdfName), Buffer.alloc(size))
  return jobPath
}

describe('JobRepository', () => {
  let repo: JobRepository
  let testDir: string

  beforeEach(() => {
    testDir = join(tmpdir(), `jobs_test_${Date.now()}`)
    mkdirSync(join(testDir, 'jobs'), { recursive: true })
    repo = new JobRepository(testDir, new FileService())
  })

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true })
  })

  describe('getRecentJobs', () => {
    it('should return empty array when no jobs exist', async () => {
      const jobs = await repo.getRecentJobs()
      expect(jobs).toEqual([])
    })

    it('should return jobs sorted by createdAt desc', async () => {
      createTestJob(testDir, 'job_a', 'v20260312_100000', '2026-03-12T10:00:00Z')
      createTestJob(testDir, 'job_b', 'v20260312_120000', '2026-03-12T12:00:00Z')
      createTestJob(testDir, 'job_c', 'v20260312_110000', '2026-03-12T11:00:00Z')

      const jobs = await repo.getRecentJobs()
      expect(jobs).toHaveLength(3)
      expect(jobs[0].title).toBe('job_b')
      expect(jobs[1].title).toBe('job_c')
      expect(jobs[2].title).toBe('job_a')
    })

    it('should respect limit parameter', async () => {
      createTestJob(testDir, 'job_a', 'v20260312_100000', '2026-03-12T10:00:00Z')
      createTestJob(testDir, 'job_b', 'v20260312_120000', '2026-03-12T12:00:00Z')
      createTestJob(testDir, 'job_c', 'v20260312_110000', '2026-03-12T11:00:00Z')

      const jobs = await repo.getRecentJobs(2)
      expect(jobs).toHaveLength(2)
    })
  })

  describe('getJobDetail', () => {
    it('should return job meta by id', async () => {
      const created = createTestJob(testDir, 'my_job', 'v20260312_100000', '2026-03-12T10:00:00Z')

      const job = await repo.getJobDetail(created.id)
      expect(job).not.toBeNull()
      expect(job!.title).toBe('my_job')
      expect(job!.sliceCount).toBe(3)
    })

    it('should return null for non-existent job', async () => {
      const job = await repo.getJobDetail('nonexistent')
      expect(job).toBeNull()
    })
  })

  describe('deleteJob', () => {
    it('should delete the version folder and return true', async () => {
      const created = createTestJob(testDir, 'del_job', 'v20260312_100000', '2026-03-12T10:00:00Z')
      expect(existsSync(created.versionPath)).toBe(true)

      const result = await repo.deleteJob(created.id)
      expect(result).toBe(true)
      expect(existsSync(created.versionPath)).toBe(false)
    })

    it('should return false for non-existent job', async () => {
      const result = await repo.deleteJob('nonexistent')
      expect(result).toBe(false)
    })
  })

  describe('saveJobMeta', () => {
    it('should save meta.json to version path', async () => {
      const versionPath = join(testDir, 'jobs', 'save_test', 'v20260312_100000')
      mkdirSync(versionPath, { recursive: true })

      const meta: JobMeta = {
        id: 'test_id',
        title: 'save_test',
        prefix: 'save_test',
        sourcePdfPath: '/tmp/test.pdf',
        copiedPdfPath: join(versionPath, 'source', 'test.pdf'),
        createdAt: '2026-03-12T10:00:00Z',
        mode: 'fixed',

        pageCount: 1,
        sliceCount: 2,
        versionPath,
        options: {},
        files: []
      }

      await repo.saveJobMeta(meta)

      const loaded = await repo.getJobDetail('test_id')
      expect(loaded).not.toBeNull()
      expect(loaded!.title).toBe('save_test')
    })
  })

  describe('deleteJobsByPdf', () => {
    it('should delete all jobs for a given source PDF', async () => {
      const v1 = join(testDir, 'jobs', 'comic_a', 'v1')
      mkdirSync(join(v1, 'slices'), { recursive: true })
      mkdirSync(join(v1, 'preview'), { recursive: true })
      writeFileSync(join(v1, 'meta.json'), JSON.stringify({
        id: 'a1', title: 'comic_a', prefix: 'comic_a',
        sourcePdfPath: '/tmp/a.pdf', copiedPdfPath: '', createdAt: '2026-03-12T10:00:00Z',
        mode: 'fixed', pageCount: 1, sliceCount: 1,
        versionPath: v1, options: {}, files: []
      }))

      const v2 = join(testDir, 'jobs', 'comic_a', 'v2')
      mkdirSync(join(v2, 'slices'), { recursive: true })
      mkdirSync(join(v2, 'preview'), { recursive: true })
      writeFileSync(join(v2, 'meta.json'), JSON.stringify({
        id: 'a2', title: 'comic_a', prefix: 'comic_a',
        sourcePdfPath: '/tmp/a.pdf', copiedPdfPath: '', createdAt: '2026-03-12T11:00:00Z',
        mode: 'fixed', pageCount: 1, sliceCount: 1,
        versionPath: v2, options: {}, files: []
      }))

      createTestJob(testDir, 'comic_b', 'v1', '2026-03-12T12:00:00Z')

      const deleted = await repo.deleteJobsByPdf('/tmp/a.pdf')
      expect(deleted).toBe(2)
      expect(existsSync(v1)).toBe(false)
      expect(existsSync(v2)).toBe(false)

      // comic_b should still exist
      const remaining = await repo.getRecentJobs()
      expect(remaining).toHaveLength(1)
      expect(remaining[0].title).toBe('comic_b')
    })

    it('should return 0 when no jobs match', async () => {
      const deleted = await repo.deleteJobsByPdf('/tmp/nonexistent.pdf')
      expect(deleted).toBe(0)
    })

    it('should also delete source-only orphan folders matching the PDF', async () => {
      // Create a source-only orphan folder (no version/meta.json, only source/)
      const orphanPath = createSourceOnlyCache(testDir, 'orphan_comic', 'a.pdf')
      expect(existsSync(orphanPath)).toBe(true)

      // Create an unrelated source-only folder that should NOT be deleted
      const unrelatedPath = createSourceOnlyCache(testDir, 'other_comic', 'b.pdf')

      const deleted = await repo.deleteJobsByPdf('/tmp/a.pdf')
      expect(deleted).toBe(1)
      expect(existsSync(orphanPath)).toBe(false)
      expect(existsSync(unrelatedPath)).toBe(true)
    })
  })

  describe('deleteAllJobs', () => {
    it('should delete all jobs and return count', async () => {
      createTestJob(testDir, 'job_a', 'v1', '2026-03-12T10:00:00Z')
      createTestJob(testDir, 'job_b', 'v1', '2026-03-12T11:00:00Z')
      createTestJob(testDir, 'job_c', 'v1', '2026-03-12T12:00:00Z')

      const deleted = await repo.deleteAllJobs()
      expect(deleted).toBe(3)

      const remaining = await repo.getRecentJobs()
      expect(remaining).toHaveLength(0)
    })

    it('should return 0 when no jobs exist', async () => {
      const deleted = await repo.deleteAllJobs()
      expect(deleted).toBe(0)
    })

    it('should delete source-only cache folders as well', async () => {
      createTestJob(testDir, 'job_a', 'v1', '2026-03-12T10:00:00Z')
      const sourceOnly = createSourceOnlyCache(testDir, 'orphan_cache', 'orphan.pdf', 2048)

      const deleted = await repo.deleteAllJobs()

      expect(deleted).toBe(2)
      expect(existsSync(sourceOnly)).toBe(false)
      expect(await repo.getRecentJobs()).toEqual([])
    })
  })

  describe('cache behavior', () => {
    it('should invalidate cache after saveJobMeta', async () => {
      const versionPath = join(testDir, 'jobs', 'cache_test', 'v1')
      mkdirSync(versionPath, { recursive: true })

      // Pre-warm cache
      expect(await repo.getJobDetail('cache_test_v1')).toBeNull()

      // Save meta (should invalidate cache)
      const meta: JobMeta = {
        id: 'cache_test_v1', title: 'cache_test', prefix: 'cache_test',
        sourcePdfPath: '/tmp/test.pdf', copiedPdfPath: '',
        createdAt: '2026-03-12T10:00:00Z',
        mode: 'fixed', pageCount: 1, sliceCount: 1,
        versionPath, options: {}, files: []
      }
      await repo.saveJobMeta(meta)

      // Should find job after cache invalidation
      const found = await repo.getJobDetail('cache_test_v1')
      expect(found).not.toBeNull()
      expect(found!.title).toBe('cache_test')
    })

    it('should invalidate cache after deleteJob', async () => {
      const created = createTestJob(testDir, 'del_cache', 'v1', '2026-03-12T10:00:00Z')

      // Warm cache
      expect(await repo.getJobDetail(created.id)).not.toBeNull()

      // Delete
      await repo.deleteJob(created.id)

      // Should not find after cache invalidation
      expect(await repo.getJobDetail(created.id)).toBeNull()
    })
  })

  describe('corrupted meta.json', () => {
    it('should skip jobs with invalid JSON in meta.json', async () => {
      const v1 = join(testDir, 'jobs', 'good_job', 'v1')
      mkdirSync(v1, { recursive: true })
      writeFileSync(join(v1, 'meta.json'), JSON.stringify({
        id: 'good1', title: 'good_job', prefix: 'good_job',
        sourcePdfPath: '/tmp/test.pdf', copiedPdfPath: '',
        createdAt: '2026-03-12T10:00:00Z',
        mode: 'fixed', pageCount: 1, sliceCount: 1,
        versionPath: v1, options: {}, files: []
      }))

      // Create corrupted meta
      const v2 = join(testDir, 'jobs', 'bad_job', 'v1')
      mkdirSync(v2, { recursive: true })
      writeFileSync(join(v2, 'meta.json'), '{ broken json here')

      const jobs = await repo.getRecentJobs()
      expect(jobs).toHaveLength(1)
      expect(jobs[0].title).toBe('good_job')
    })

    it('should skip directories without meta.json', async () => {
      createTestJob(testDir, 'has_meta', 'v1', '2026-03-12T10:00:00Z')

      // Create orphan directory (no meta.json)
      const orphan = join(testDir, 'jobs', 'orphan', 'v1')
      mkdirSync(orphan, { recursive: true })

      const jobs = await repo.getRecentJobs()
      expect(jobs).toHaveLength(1)
      expect(jobs[0].title).toBe('has_meta')
    })
  })

  describe('cleanEmptyParent', () => {
    it('should remove empty parent after deleting last version', async () => {
      const created = createTestJob(testDir, 'single_ver', 'v1', '2026-03-12T10:00:00Z')
      const parentDir = join(testDir, 'jobs', 'single_ver')

      expect(existsSync(parentDir)).toBe(true)

      await repo.deleteJob(created.id)

      // Parent should be cleaned up since it's now empty
      expect(existsSync(parentDir)).toBe(false)
    })

    it('should preserve parent when other versions remain', async () => {
      const job1 = createTestJob(testDir, 'multi_ver', 'v1', '2026-03-12T10:00:00Z')
      createTestJob(testDir, 'multi_ver', 'v2', '2026-03-12T11:00:00Z')
      const parentDir = join(testDir, 'jobs', 'multi_ver')

      await repo.deleteJob(job1.id)

      // Parent should still exist because v2 remains
      expect(existsSync(parentDir)).toBe(true)
    })
  })

  describe('getStorageInfo', () => {
    it('should return empty when no jobs exist', async () => {
      const info = await repo.getStorageInfo()
      expect(info.totalSize).toBe(0)
      expect(info.pdfs).toEqual([])
    })

    it('should return size info grouped by PDF', async () => {
      // Create jobs with actual file content to have measurable size
      const job1 = createTestJob(testDir, 'comic_a', 'v20260312_100000', '2026-03-12T10:00:00Z')
      writeFileSync(join(job1.versionPath, 'slices', 'data.bin'), Buffer.alloc(1024))

      const job2 = createTestJob(testDir, 'comic_a', 'v20260312_110000', '2026-03-12T11:00:00Z')
      writeFileSync(join(job2.versionPath, 'slices', 'data.bin'), Buffer.alloc(2048))

      const job3 = createTestJob(testDir, 'comic_b', 'v20260312_120000', '2026-03-12T12:00:00Z')
      writeFileSync(join(job3.versionPath, 'slices', 'data.bin'), Buffer.alloc(512))

      const info = await repo.getStorageInfo()

      expect(info.totalSize).toBeGreaterThan(0)
      expect(info.pdfs).toHaveLength(1) // all share same sourcePdfPath '/tmp/test.pdf'
      expect(info.pdfs[0].jobs).toHaveLength(3)

      // Each job size should include meta.json + dummy file
      for (const job of info.pdfs[0].jobs) {
        expect(job.size).toBeGreaterThan(0)
      }
    })

    it('should group by different source PDFs', async () => {
      const v1 = join(testDir, 'jobs', 'pdf_x', 'v1')
      mkdirSync(join(v1, 'slices'), { recursive: true })
      mkdirSync(join(v1, 'preview'), { recursive: true })
      const meta1: JobMeta = {
        id: 'x1', title: 'pdf_x', prefix: 'pdf_x',
        sourcePdfPath: '/tmp/x.pdf', copiedPdfPath: '', createdAt: '2026-03-12T10:00:00Z',
        mode: 'fixed', pageCount: 1, sliceCount: 1,
        versionPath: v1, options: {}, files: []
      }
      writeFileSync(join(v1, 'meta.json'), JSON.stringify(meta1))

      const v2 = join(testDir, 'jobs', 'pdf_y', 'v1')
      mkdirSync(join(v2, 'slices'), { recursive: true })
      mkdirSync(join(v2, 'preview'), { recursive: true })
      const meta2: JobMeta = {
        id: 'y1', title: 'pdf_y', prefix: 'pdf_y',
        sourcePdfPath: '/tmp/y.pdf', copiedPdfPath: '', createdAt: '2026-03-12T11:00:00Z',
        mode: 'fixed', pageCount: 1, sliceCount: 1,
        versionPath: v2, options: {}, files: []
      }
      writeFileSync(join(v2, 'meta.json'), JSON.stringify(meta2))

      const info = await repo.getStorageInfo()
      expect(info.pdfs).toHaveLength(2)
      const names = info.pdfs.map((p) => p.name).sort()
      expect(names).toEqual(['x', 'y'])
    })

    it('should include source-only cache folders in total size', async () => {
      const sourceOnly = createSourceOnlyCache(testDir, 'cached_only', 'cached.pdf', 4096)

      const info = await repo.getStorageInfo()

      expect(info.totalSize).toBeGreaterThanOrEqual(4096)
      expect(info.pdfs).toHaveLength(1)
      expect(info.pdfs[0].name).toBe('cached')
      expect(info.pdfs[0].jobs).toEqual([])
      expect(info.pdfs[0].sourcePdfPath).toBe(join(sourceOnly, 'source', 'cached.pdf'))
    })
  })
})
