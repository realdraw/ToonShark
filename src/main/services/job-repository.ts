import {existsSync} from 'fs'
import {readdir, readFile, rm, stat, writeFile} from 'fs/promises'
import {basename, dirname, join} from 'path'
import type {JobMeta, StorageInfo, StorageJobInfo, StoragePdfInfo} from '@shared/types'
import {toErrorMessage} from '@shared/utils'
import type {FileService} from './file.service'
import type {Logger} from './logger.service'

export class JobRepository {
  private baseDir: string
  private fileService: FileService
  private logger: Logger | null = null
  private indexCache: Map<string, string> | null = null

  constructor(baseDir: string, fileService: FileService, logger?: Logger) {
    this.baseDir = baseDir
    this.fileService = fileService
    this.logger = logger ?? null
  }

  updateBaseDir(baseDir: string): void {
    this.baseDir = baseDir
    this.invalidateCache()
  }

  private get jobsDir(): string {
    return join(this.baseDir, 'jobs')
  }

  private async buildIndex(): Promise<Map<string, string>> {
    const index = new Map<string, string>()
    if (!existsSync(this.jobsDir)) return index

    try {
      const jobFolders = await readdir(this.jobsDir)
      for (const jobFolder of jobFolders) {
        const jobPath = join(this.jobsDir, jobFolder)
        if (!(await stat(jobPath)).isDirectory()) continue

        const versions = await readdir(jobPath)
        for (const version of versions) {
          const versionPath = join(jobPath, version)
          if (!(await stat(versionPath)).isDirectory()) continue

          const metaPath = join(versionPath, 'meta.json')
          if (!existsSync(metaPath)) continue

          try {
            const raw = await readFile(metaPath, 'utf-8')
            const meta = JSON.parse(raw) as JobMeta
            index.set(meta.id, metaPath)
          } catch (err) {
            this.logger?.warn('Skipping invalid meta file', { metaPath, error: toErrorMessage(err) })
          }
        }
      }
    } catch (err) {
      this.logger?.warn('Failed to scan jobs directory', { error: toErrorMessage(err) })
    }

    return index
  }

  private async getIndex(): Promise<Map<string, string>> {
    if (!this.indexCache) {
      this.indexCache = await this.buildIndex()
    }
    return this.indexCache
  }

  private invalidateCache(): void {
    this.indexCache = null
  }

  private async cleanEmptyParent(versionPath: string): Promise<void> {
    try {
      const parentDir = dirname(versionPath)
      if (!existsSync(parentDir)) return
      const remaining = await readdir(parentDir)
      // If only 'source' folder remains (no more versions), remove the entire job folder
      const hasVersions = remaining.some((name) => name !== 'source')
      if (!hasVersions) {
        await rm(parentDir, { recursive: true, force: true })
      }
    } catch (err) {
      this.logger?.warn('Failed to clean empty parent dir', { versionPath, error: toErrorMessage(err) })
    }
  }

  private async readMeta(metaPath: string): Promise<JobMeta | null> {
    if (!existsSync(metaPath)) return null
    try {
      const raw = await readFile(metaPath, 'utf-8')
      return JSON.parse(raw) as JobMeta
    } catch {
      return null
    }
  }

  private async getAllMetas(): Promise<JobMeta[]> {
    const index = await this.getIndex()
    const metas: JobMeta[] = []
    for (const [, metaPath] of index) {
      const meta = await this.readMeta(metaPath)
      if (meta) metas.push(meta)
    }
    return metas
  }

  private async listJobFolderPaths(): Promise<string[]> {
    if (!existsSync(this.jobsDir)) return []
    try {
      const entries = await readdir(this.jobsDir)
      const result: string[] = []
      for (const entry of entries) {
        const fullPath = join(this.jobsDir, entry)
        if ((await stat(fullPath)).isDirectory()) {
          result.push(fullPath)
        }
      }
      return result
    } catch (err) {
      this.logger?.warn('Failed to list job folders', { error: toErrorMessage(err) })
      return []
    }
  }

  private async hasMetaDescendant(jobPath: string): Promise<boolean> {
    try {
      const entries = await readdir(jobPath)
      for (const entry of entries) {
        if (entry === 'source') continue
        const versionPath = join(jobPath, entry)
        if (!(await stat(versionPath)).isDirectory()) continue
        if (existsSync(join(versionPath, 'meta.json'))) return true
      }
    } catch (err) {
      this.logger?.warn('Failed to inspect job folder', { jobPath, error: toErrorMessage(err) })
    }
    return false
  }

  private async getSourceOnlyJobFolders(): Promise<string[]> {
    const jobFolders = await this.listJobFolderPaths()
    const sourceOnly: string[] = []
    for (const jobPath of jobFolders) {
      if (!(await this.hasMetaDescendant(jobPath))) {
        sourceOnly.push(jobPath)
      }
    }
    return sourceOnly
  }

  private async getSourceOnlyPdfInfo(jobPath: string): Promise<StoragePdfInfo | null> {
    const sourceDir = join(jobPath, 'source')
    if (!existsSync(sourceDir)) return null

    try {
      const entries = await readdir(sourceDir)
      const pdfName = entries.find((entry) => entry.toLowerCase().endsWith('.pdf'))
      if (!pdfName) return null

      const sourcePdfPath = join(sourceDir, pdfName)
      const size = await this.fileService.getDirSize(jobPath)
      return {
        sourcePdfPath,
        name: basename(pdfName).replace(/\.pdf$/i, '') || 'untitled',
        size,
        jobs: []
      }
    } catch (err) {
      this.logger?.warn('Failed to read source-only cache info', { jobPath, error: toErrorMessage(err) })
      return null
    }
  }

  async getRecentJobs(limit: number = 50): Promise<JobMeta[]> {
    const allMetas = await this.getAllMetas()
    allMetas.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
    return allMetas.slice(0, limit)
  }

  async getJobDetail(jobId: string): Promise<JobMeta | null> {
    const index = await this.getIndex()
    const metaPath = index.get(jobId)

    if (metaPath) {
      const meta = await this.readMeta(metaPath)
      if (meta) return meta
    }

    // Fallback: full scan (index may be stale)
    if (!existsSync(this.jobsDir)) return null

    try {
      const jobFolders = await readdir(this.jobsDir)

      for (const jobFolder of jobFolders) {
        const jobPath = join(this.jobsDir, jobFolder)
        if (!(await stat(jobPath)).isDirectory()) continue

        const versions = await readdir(jobPath)
        for (const version of versions) {
          const mp = join(jobPath, version, 'meta.json')
          const meta = await this.readMeta(mp)
          if (meta?.id === jobId) {
            (await this.getIndex()).set(jobId, mp)
            return meta
          }
        }
      }
    } catch {
      return null
    }

    return null
  }

  async resolveFolderForPdf(sanitizedPdfName: string, sourcePdfPath: string): Promise<string> {
    let candidate = sanitizedPdfName
    let suffix = 1

    while (true) {
      const candidateDir = join(this.jobsDir, candidate)
      if (!existsSync(candidateDir)) {
        return candidate
      }

      // Check source/ for existing PDF
      const sourceDir = join(candidateDir, 'source')
      if (!existsSync(sourceDir)) {
        return candidate
      }

      // Find existing PDF in source/
      let existingPdfPath: string | null = null
      try {
        const sourceFiles = await readdir(sourceDir)
        const pdfFile = sourceFiles.find((f) => f.toLowerCase().endsWith('.pdf'))
        if (pdfFile) {
          existingPdfPath = join(sourceDir, pdfFile)
        }
      } catch {
        return candidate
      }

      if (!existingPdfPath) {
        // source/ exists but no PDF (manually deleted) — reuse folder
        return candidate
      }

      // Compare files
      const isSame = await this.fileService.comparePdfFiles(existingPdfPath, sourcePdfPath)
      if (isSame) {
        return candidate
      }

      // Different PDF — try next suffix
      suffix++
      candidate = `${sanitizedPdfName}_${suffix}`
    }
  }

  async saveJobMeta(meta: JobMeta): Promise<void> {
    const metaPath = join(meta.versionPath, 'meta.json')
    await writeFile(metaPath, JSON.stringify(meta, null, 2))
    this.invalidateCache()
  }

  async getStorageInfo(): Promise<StorageInfo> {
    const jobs = await this.getAllMetas()
    const pdfMap = new Map<string, StoragePdfInfo>()
    let totalSize = 0

    for (const job of jobs) {
      const jobSize = await this.fileService.getDirSize(job.versionPath)
      totalSize += jobSize

      const jobInfo: StorageJobInfo = {
        jobId: job.id,
        title: job.title,
        createdAt: job.createdAt,
        size: jobSize
      }

      const key = job.sourcePdfPath
      if (!pdfMap.has(key)) {
        const name = basename(key).replace(/\.pdf$/i, '') || 'untitled'
        pdfMap.set(key, { sourcePdfPath: key, name, size: 0, jobs: [] })
      }
      const pdf = pdfMap.get(key)!
      pdf.size += jobSize
      pdf.jobs.push(jobInfo)
    }

    const sourceOnlyFolders = await this.getSourceOnlyJobFolders()
    for (const jobPath of sourceOnlyFolders) {
      const info = await this.getSourceOnlyPdfInfo(jobPath)
      if (!info) continue

      totalSize += info.size
      const existing = pdfMap.get(info.sourcePdfPath)
      if (existing) {
        existing.size += info.size
      } else {
        pdfMap.set(info.sourcePdfPath, info)
      }
    }

    const pdfs = Array.from(pdfMap.values()).sort((a, b) => b.size - a.size)
    return { totalSize, pdfs }
  }

  private async removeVersions(jobs: JobMeta[]): Promise<number> {
    let deleted = 0
    for (const job of jobs) {
      try {
        await rm(job.versionPath, { recursive: true, force: true })
        await this.cleanEmptyParent(job.versionPath)
        deleted++
      } catch (err) {
        this.logger?.error('Failed to delete job version', { jobId: job.id, error: toErrorMessage(err) })
      }
    }
    this.invalidateCache()
    return deleted
  }

  async deleteJob(jobId: string): Promise<boolean> {
    const meta = await this.getJobDetail(jobId)
    if (!meta) return false
    return (await this.removeVersions([meta])) > 0
  }

  async deleteJobsByPdf(sourcePdfPath: string): Promise<number> {
    const jobs = (await this.getAllMetas()).filter((j) => j.sourcePdfPath === sourcePdfPath)
    const deletedVersions = await this.removeVersions(jobs)

    // Clean up source-only orphan folders that match the given PDF by filename
    const pdfFileName = basename(sourcePdfPath)
    const sourceOnlyFolders = await this.getSourceOnlyJobFolders()
    let deletedSourceCaches = 0
    for (const jobPath of sourceOnlyFolders) {
      const sourceDir = join(jobPath, 'source')
      if (existsSync(join(sourceDir, pdfFileName))) {
        try {
          await rm(jobPath, { recursive: true, force: true })
          deletedSourceCaches++
        } catch (err) {
          this.logger?.error('Failed to delete source-only cache', { jobPath, error: toErrorMessage(err) })
        }
      }
    }

    if (deletedSourceCaches > 0) this.invalidateCache()
    return deletedVersions + deletedSourceCaches
  }

  async deleteAllJobs(): Promise<number> {
    const jobs = await this.getAllMetas()
    const sourceOnlyFolders = await this.getSourceOnlyJobFolders()
    const deletedVersions = await this.removeVersions(jobs)

    let deletedSourceCaches = 0
    for (const jobPath of sourceOnlyFolders) {
      try {
        await rm(jobPath, { recursive: true, force: true })
        deletedSourceCaches++
      } catch (err) {
        this.logger?.error('Failed to delete source-only cache', { jobPath, error: toErrorMessage(err) })
      }
    }

    this.invalidateCache()
    return deletedVersions + deletedSourceCaches
  }
}
