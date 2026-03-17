import sharp from 'sharp'
import {join} from 'path'
import {existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync} from 'fs'
import type {
  CaptureThumbnailPayload,
  CaptureThumbnailResult,
  ExportHistory,
  ExportHistoryEntry,
  ExportJobPayload,
  ExportPlatformResult,
  ExportResult,
  ExportWarning,
  JobMeta,
  JobProgress,
  Platform,
  ThumbnailSpec
} from '@shared/types'
import {sanitizeFolderId} from '@shared/utils'
import type {JobRepository} from './job-repository'
import type {Logger} from './logger.service'
import type {SettingsService} from './settings.service'

export class ExportService {
  constructor(
    private settingsService: SettingsService,
    private jobRepository: JobRepository,
    private logger: Logger
  ) {}

  private historyPath(versionPath: string): string {
    return join(versionPath, 'export', 'export-history.json')
  }

  getExportHistory(versionPath: string): ExportHistoryEntry[] {
    const path = this.historyPath(versionPath)
    if (!existsSync(path)) return []
    try {
      const raw = readFileSync(path, 'utf-8')
      const data = JSON.parse(raw) as ExportHistory
      return data.exports ?? []
    } catch {
      return []
    }
  }

  private saveExportHistory(versionPath: string, results: ExportPlatformResult[]): void {
    const existing = this.getExportHistory(versionPath)
    const now = new Date().toISOString()

    for (const r of results) {
      const key = `${r.countryId}/${r.platformId}`
      const idx = existing.findIndex((e) => `${e.countryId}/${e.platformId}` === key)
      const entry: ExportHistoryEntry = {
        countryId: r.countryId,
        platformId: r.platformId,
        exportedAt: now,
        fileCount: r.fileCount,
        outputDir: r.outputDir
      }
      if (idx >= 0) {
        existing[idx] = entry
      } else {
        existing.push(entry)
      }
    }

    const histPath = this.historyPath(versionPath)
    mkdirSync(join(versionPath, 'export'), { recursive: true })
    writeFileSync(histPath, JSON.stringify({ exports: existing }, null, 2))
  }

  async exportJob(
    payload: ExportJobPayload,
    onProgress: (progress: JobProgress) => void,
    jpgQuality: number = 90
  ): Promise<ExportResult> {
    const meta = await this.jobRepository.getJobDetail(payload.jobId)
    if (!meta) throw new Error(`Job ${payload.jobId} not found`)

    const platformResults: ExportPlatformResult[] = []
    let totalFiles = 0
    let totalWarnings = 0

    for (let pi = 0; pi < payload.entries.length; pi++) {
      const entry = payload.entries[pi]

      onProgress({
        stepKey: 'progressExporting',
        current: pi + 1,
        total: payload.entries.length,
        percent: Math.round(((pi + 1) / payload.entries.length) * 100)
      })

      const result = await this.exportForPlatform(meta, entry.countryId, entry.platform, jpgQuality)
      platformResults.push(result)
      totalFiles += result.fileCount
      totalWarnings += result.warnings.length
    }

    this.saveExportHistory(meta.versionPath, platformResults)

    onProgress({
      stepKey: 'progressDone',
      current: payload.entries.length,
      total: payload.entries.length,
      percent: 100
    })

    return {
      jobId: payload.jobId,
      platforms: platformResults,
      totalFiles,
      totalWarnings
    }
  }

  private async exportForPlatform(
    meta: JobMeta,
    countryId: string,
    platform: Platform,
    jpgQuality: number = 90
  ): Promise<ExportPlatformResult> {
    const exportBaseDir = join(meta.versionPath, 'export')
    const safeCountryId = sanitizeFolderId(countryId)
    const safePlatformId = sanitizeFolderId(platform.id)
    const outputDir = join(exportBaseDir, safeCountryId, safePlatformId)
    mkdirSync(outputDir, { recursive: true })

    const warnings: ExportWarning[] = []
    let fileCount = 0

    const spec = platform.episode

    for (const file of meta.files) {
      const ext = spec.format
      const dotIdx = file.name.lastIndexOf('.')
      const baseName = dotIdx > 0 ? file.name.slice(0, dotIdx) : file.name
      const outputName = `${baseName}.${ext}`
      const outputPath = join(outputDir, outputName)

      try {
        const source = sharp(file.path)
        const imgMeta = await source.metadata()
        const srcWidth = imgMeta.width ?? spec.width

        let pipeline = source.clone()

        const upscaled = srcWidth < spec.width
        if (upscaled) {
          warnings.push({
            file: outputName,
            platformId: platform.id,
            message: `Source width ${srcWidth}px is smaller than target ${spec.width}px (upscaled)`
          })
        }

        // Resize to target width
        if (srcWidth !== spec.width) {
          pipeline = pipeline.resize({ width: spec.width })
        }

        const { buffer, oversized } = await this.writeWithFormat(pipeline, outputPath, spec.format, spec.maxFileSizeMB, jpgQuality)
        if (oversized) {
          const sizeMB = buffer.length / (1024 * 1024)
          warnings.push({
            file: outputName,
            platformId: platform.id,
            message: `File size ${sizeMB.toFixed(2)}MB exceeds limit ${spec.maxFileSizeMB}MB (quality: ${jpgQuality})`
          })
        }

        fileCount++
      } catch (err) {
        this.logger.error(`Export failed for ${file.name} → ${platform.id}`, err)
        warnings.push({
          file: outputName,
          platformId: platform.id,
          message: `Export failed: ${err instanceof Error ? err.message : String(err)}`
        })
      }
    }

    return {
      countryId,
      platformId: platform.id,
      outputDir,
      fileCount,
      warnings
    }
  }

  getThumbnailDir(versionPath: string): string | null {
    const exportDir = join(versionPath, 'export')
    if (!existsSync(exportDir)) return null

    try {
      for (const country of readdirSync(exportDir)) {
        const countryPath = join(exportDir, country)
        if (!existsSync(countryPath) || !statSync(countryPath).isDirectory()) continue
        for (const platform of readdirSync(countryPath)) {
          const thumbDir = join(countryPath, platform, 'thumbnail')
          if (existsSync(thumbDir) && readdirSync(thumbDir).length > 0) {
            return thumbDir
          }
        }
      }
    } catch {
      return null
    }
    return null
  }

  async captureThumbnail(
    payload: CaptureThumbnailPayload,
    countries: { id: string; platforms: Platform[] }[],
    jpgQuality: number = 90
  ): Promise<CaptureThumbnailResult> {
    const meta = await this.jobRepository.getJobDetail(payload.jobId)
    if (!meta) throw new Error(`Job ${payload.jobId} not found`)

    const file = meta.files.find((f) => f.index === payload.sliceIndex)
    if (!file) throw new Error(`Slice ${payload.sliceIndex} not found`)

    // Find the platform's thumbnail spec
    let thumbnailSpec: ThumbnailSpec | undefined
    for (const country of countries) {
      if (country.id !== payload.countryId) continue
      const platform = country.platforms.find((p) => p.id === payload.platformId)
      if (platform?.thumbnail) {
        thumbnailSpec = platform.thumbnail
        break
      }
    }
    if (!thumbnailSpec) throw new Error(`No thumbnail spec for ${payload.countryId}/${payload.platformId}`)

    const { crop } = payload
    const source = sharp(file.path)

    // 1. Crop
    const cropW = Math.round(crop.width)
    const cropH = Math.round(crop.height)
    let pipeline = source.extract({
      left: Math.round(crop.x),
      top: Math.round(crop.y),
      width: cropW,
      height: cropH
    })

    // 2. Detect upscale (crop region smaller than target)
    const upscaled = cropW < thumbnailSpec.width || cropH < thumbnailSpec.height

    // 3. Resize to thumbnail spec
    pipeline = pipeline.resize({ width: thumbnailSpec.width, height: thumbnailSpec.height, fit: 'fill' })

    // 3. Format conversion + size check
    const ext = thumbnailSpec.format
    const dotIdx = file.name.lastIndexOf('.')
      const baseName = dotIdx > 0 ? file.name.slice(0, dotIdx) : file.name

    const safeCountryId = sanitizeFolderId(payload.countryId)
    const safePlatformId = sanitizeFolderId(payload.platformId)
    const outputDir = join(meta.versionPath, 'export', safeCountryId, safePlatformId, 'thumbnail')
    mkdirSync(outputDir, { recursive: true })

    // Generate unique filename: {baseName}_{platformId}.{ext}, {baseName}_{platformId}_2.{ext}, ...
    const outputName = this.nextThumbnailName(outputDir, baseName, safePlatformId, ext)
    const outputPath = join(outputDir, outputName)

    const { oversized } = await this.writeWithFormat(pipeline, outputPath, ext, thumbnailSpec.maxFileSizeMB, jpgQuality)
    if (oversized) {
      this.logger.warn(`Thumbnail ${outputName} exceeds size limit (quality: ${jpgQuality})`)
    }

    return {
      outputPath,
      width: thumbnailSpec.width,
      height: thumbnailSpec.height,
      upscaled,
      ...(upscaled ? { sourceSize: { width: cropW, height: cropH } } : {})
    }
  }

  private async writeWithFormat(
    pipeline: sharp.Sharp,
    outputPath: string,
    format: 'jpg' | 'png',
    maxFileSizeMB?: number,
    jpgQuality: number = 90
  ): Promise<{ buffer: Buffer; oversized: boolean }> {
    if (format === 'jpg') {
      const buffer = await pipeline.jpeg({ quality: jpgQuality }).toBuffer()
      writeFileSync(outputPath, buffer)
      const oversized = !!maxFileSizeMB && buffer.length / (1024 * 1024) > maxFileSizeMB
      return { buffer, oversized }
    } else {
      const buffer = await pipeline.png().toBuffer()
      writeFileSync(outputPath, buffer)
      const oversized = !!maxFileSizeMB && buffer.length / (1024 * 1024) > maxFileSizeMB
      return { buffer, oversized }
    }
  }

  private nextThumbnailName(dir: string, baseName: string, platformId: string, ext: string): string {
    const prefix = `${baseName}_${platformId}_`
    let max = 1
    if (existsSync(dir)) {
      for (const name of readdirSync(dir)) {
        if (!name.startsWith(prefix) || !name.endsWith(`.${ext}`)) continue
        const numStr = name.slice(prefix.length, -(ext.length + 1))
        const n = parseInt(numStr, 10)
        if (!isNaN(n) && n >= max) max = n + 1
      }
    }
    return `${prefix}${String(max).padStart(5, '0')}.${ext}`
  }
}
