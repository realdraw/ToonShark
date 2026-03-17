import {BrowserWindow, dialog, ipcMain, shell} from 'electron'
import {normalize, relative, resolve, sep} from 'path'
import type {SettingsService} from '../services/settings.service'
import type {PreviewService} from '../services/preview.service'
import type {JobRepository} from '../services/job-repository'
import type {JobExecutionService} from '../services/job-execution.service'
import type {ExportService} from '../services/export.service'
import type {PdfService} from '../services/pdf.service'
import type {Logger} from '../services/logger.service'
import type {
  AppSettings,
  CaptureThumbnailPayload,
  DevicePreset,
  ExportJobPayload,
  JobProgress,
  RunSliceJobPayload
} from '@shared/types'
import {DEFAULT_SETTINGS, PDF_SCALE_MAX, PDF_SCALE_MIN} from '@shared/constants'
import {toErrorMessage} from '@shared/utils'

type Services = {
  settingsService: SettingsService
  previewService: PreviewService
  jobRepository: JobRepository
  jobExecutionService: JobExecutionService
  exportService: ExportService
  pdfService: PdfService
  logger: Logger
  getMainWindow: () => BrowserWindow | null
}

function sendProgress(win: BrowserWindow | null, progress: JobProgress) {
  if (win && !win.isDestroyed()) {
    try {
      win.webContents.send('job-progress', progress)
    } catch {
      // Window destroyed between check and send
    }
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function validateSettings(settings: unknown): AppSettings {
  if (!settings || typeof settings !== 'object') throw new Error('Invalid settings')
  const s = settings as AppSettings
  if (typeof s.baseDir !== 'string') throw new Error('Invalid baseDir')
  if (typeof s.defaultSliceHeight !== 'number') throw new Error('Invalid defaultSliceHeight')
  if (typeof s.pdfScale !== 'number') throw new Error('Invalid pdfScale')
  if (typeof s.locale !== 'string') throw new Error('Invalid locale')

  return {
    ...DEFAULT_SETTINGS,
    ...s,
    defaultSliceHeight: clamp(s.defaultSliceHeight ?? DEFAULT_SETTINGS.defaultSliceHeight, 100, 100000),
    pdfScale: clamp(s.pdfScale ?? DEFAULT_SETTINGS.pdfScale, PDF_SCALE_MIN, PDF_SCALE_MAX),
    naming: {
      ...DEFAULT_SETTINGS.naming,
      ...s.naming,
      filenamePadding: clamp(s.naming?.filenamePadding ?? DEFAULT_SETTINGS.naming.filenamePadding, 1, 10)
    },
    autoSlice: {
      ...DEFAULT_SETTINGS.autoSlice,
      ...s.autoSlice,
      whiteThreshold: clamp(s.autoSlice?.whiteThreshold ?? DEFAULT_SETTINGS.autoSlice.whiteThreshold, 0, 255),
      minWhiteRun: Math.max(0, s.autoSlice?.minWhiteRun ?? DEFAULT_SETTINGS.autoSlice.minWhiteRun),
      minSliceHeight: Math.max(1, s.autoSlice?.minSliceHeight ?? DEFAULT_SETTINGS.autoSlice.minSliceHeight)
    },
    export: {
      ...DEFAULT_SETTINGS.export,
      ...s.export,
      jpgQuality: clamp(s.export?.jpgQuality ?? DEFAULT_SETTINGS.export.jpgQuality, 60, 100)
    },
    preview: {
      ...DEFAULT_SETTINGS.preview,
      ...s.preview,
      imageGap: Math.max(0, s.preview?.imageGap ?? DEFAULT_SETTINGS.preview.imageGap)
    }
  }
}

function validatePayload(payload: unknown): RunSliceJobPayload {
  if (!payload || typeof payload !== 'object') throw new Error('Invalid payload')
  const p = payload as RunSliceJobPayload
  if (!p.sourcePdfPath || typeof p.sourcePdfPath !== 'string') throw new Error('Missing sourcePdfPath')
  if (!p.prefix || typeof p.prefix !== 'string') throw new Error('Missing prefix')
  if (!['fixed', 'auto'].includes(p.mode)) throw new Error('Invalid mode')

  const result: RunSliceJobPayload = {
    ...p,
    pdfScale: p.pdfScale !== undefined ? clamp(p.pdfScale, PDF_SCALE_MIN, PDF_SCALE_MAX) : undefined
  }

  // options가 없으면 빈 객체로 초기화 — pipeline에서 settings 기본값으로 fallback됨
  const opts = (p.options && typeof p.options === 'object') ? p.options : {}
  result.options = {
    ...opts,
    sliceHeight: opts.sliceHeight !== undefined ? clamp(opts.sliceHeight, 1, 20000) : undefined,
    startOffset: opts.startOffset !== undefined ? clamp(opts.startOffset, 0, 50000) : undefined,
    whiteThreshold: opts.whiteThreshold !== undefined ? clamp(opts.whiteThreshold, 0, 255) : undefined,
    minWhiteRun: opts.minWhiteRun !== undefined ? clamp(opts.minWhiteRun, 0, 10000) : undefined,
    minSliceHeight: opts.minSliceHeight !== undefined ? clamp(opts.minSliceHeight, 1, 20000) : undefined
  }

  return result
}

function validateDevicePresets(devices: unknown): DevicePreset[] {
  if (!Array.isArray(devices)) throw new Error('Invalid devices: not an array')
  return devices.map((d, i) => {
    if (!d || typeof d !== 'object') throw new Error(`Invalid device at index ${i}`)
    const { id, name, cssViewportWidth, cssViewportHeight } = d as Record<string, unknown>
    if (typeof id !== 'string' || !id) throw new Error(`Invalid device id at index ${i}`)
    if (typeof name !== 'string' || !name) throw new Error(`Invalid device name at index ${i}`)
    if (typeof cssViewportWidth !== 'number' || cssViewportWidth <= 0) throw new Error(`Invalid cssViewportWidth at index ${i}`)
    if (typeof cssViewportHeight !== 'number' || cssViewportHeight <= 0) throw new Error(`Invalid cssViewportHeight at index ${i}`)
    return { id, name, cssViewportWidth, cssViewportHeight }
  })
}

function isPathWithinBaseDir(targetPath: string, baseDir: string): boolean {
  const normalizedTarget = normalize(resolve(targetPath))
  const normalizedBase = normalize(resolve(baseDir))
  if (normalizedTarget === normalizedBase) return true
  const rel = relative(normalizedBase, normalizedTarget)
  // Reject if relative path escapes baseDir (starts with '..' or is absolute)
  return !!rel && !rel.startsWith('..') && !rel.startsWith(sep) && rel !== normalizedTarget
}

function registerDialogHandlers(services: Services) {
  const { settingsService } = services

  ipcMain.handle('select-source-pdf', async () => {
    const result = await dialog.showOpenDialog({
      filters: [{ name: 'PDF Files', extensions: ['pdf'] }],
      properties: ['openFile']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle('select-base-dir', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle('open-path', async (_event, path: string) => {
    if (typeof path !== 'string' || !path) throw new Error('Invalid path')
    const baseDir = settingsService.load().baseDir
    if (!isPathWithinBaseDir(path, baseDir)) {
      throw new Error('Path is outside allowed directory')
    }
    await shell.openPath(path)
  })
}

function registerSettingsHandlers(services: Services) {
  const { settingsService, jobRepository, logger } = services

  ipcMain.handle('load-settings', () => {
    return settingsService.load()
  })

  ipcMain.handle('save-settings', (_event, settings: AppSettings) => {
    try {
      const validated = validateSettings(settings)
      const migration = settingsService.saveAndMigrateBaseDir(validated)

      // baseDir가 변경되면 다른 서비스들도 동기화
      if (migration.baseDirChanged) {
        jobRepository.updateBaseDir(migration.currentBaseDir)
        logger.updateBaseDir(migration.currentBaseDir)
        logger.info('baseDir changed', { from: migration.previousBaseDir, to: migration.currentBaseDir })
      }

      logger.info('Settings saved')
    } catch (err) {
      logger.error('Failed to save settings', err)
      throw new Error(`Failed to save settings: ${toErrorMessage(err)}`)
    }
  })

  ipcMain.handle('get-device-presets', () => {
    return settingsService.getDevicePresets()
  })

  ipcMain.handle('save-device-presets', (_event, devices: unknown) => {
    try {
      const validated = validateDevicePresets(devices)
      settingsService.saveDevicePresets(validated)
      logger.info('Device presets saved')
    } catch (err) {
      logger.error('Failed to save device presets', err)
      throw new Error(`Failed to save device presets: ${toErrorMessage(err)}`)
    }
  })

  ipcMain.handle('get-default-device-presets', () => {
    return settingsService.getDefaultDevicePresets()
  })

  ipcMain.handle('get-default-settings', () => {
    return { ...DEFAULT_SETTINGS, baseDir: settingsService.getDefaultBaseDir() }
  })

  ipcMain.handle('get-country-presets', () => {
    return settingsService.getCountryPresets()
  })
}

function registerPresetImportExportHandlers(services: Services) {
  const { settingsService, logger } = services

  ipcMain.handle('export-presets', async () => {
    const result = await dialog.showSaveDialog({
      defaultPath: 'toonshark-device-presets.json',
      filters: [{ name: 'JSON', extensions: ['json'] }]
    })
    if (result.canceled || !result.filePath) return false

    try {
      const { writeFile } = await import('fs/promises')
      const data = {
        version: 1,
        devices: settingsService.getDevicePresets()
      }
      await writeFile(result.filePath, JSON.stringify(data, null, 2))
      logger.info('Device presets exported', { path: result.filePath })
      return true
    } catch (err) {
      logger.error('Failed to export presets', err)
      throw new Error(`Failed to export presets: ${toErrorMessage(err)}`)
    }
  })

  ipcMain.handle('import-presets', async () => {
    const result = await dialog.showOpenDialog({
      filters: [{ name: 'JSON', extensions: ['json'] }],
      properties: ['openFile']
    })
    if (result.canceled || result.filePaths.length === 0) return null

    try {
      const { readFile } = await import('fs/promises')
      const raw = await readFile(result.filePaths[0], 'utf-8')
      const data = JSON.parse(raw)

      if (!data || typeof data !== 'object' || data.version !== 1) {
        throw new Error('Invalid preset file format')
      }

      const devices = validateDevicePresets(data.devices)
      settingsService.saveDevicePresets(devices)
      logger.info('Device presets imported', { path: result.filePaths[0], devices: devices.length })

      return { devices }
    } catch (err) {
      logger.error('Failed to import presets', err)
      throw new Error(`Failed to import presets: ${toErrorMessage(err)}`)
    }
  })
}

function registerExportHandlers(services: Services) {
  const { exportService, jobRepository, settingsService, logger } = services

  ipcMain.handle('get-export-history', async (_event, jobId: string) => {
    const meta = await jobRepository.getJobDetail(jobId)
    if (!meta) return []
    return exportService.getExportHistory(meta.versionPath)
  })

  ipcMain.handle('run-export', async (_event, payload: ExportJobPayload) => {
    if (!payload || !payload.jobId || !Array.isArray(payload.entries) || payload.entries.length === 0) {
      throw new Error('Invalid export payload')
    }
    logger.info('Export started', { jobId: payload.jobId, entries: payload.entries.map(e => `${e.countryId}/${e.platform.id}`) })
    const win = services.getMainWindow()
    const jpgQuality = settingsService.load().export.jpgQuality
    try {
      const result = await exportService.exportJob(payload, (progress) => sendProgress(win, { ...progress, operation: 'export' }), jpgQuality)
      logger.info('Export completed', { jobId: result.jobId, totalFiles: result.totalFiles, warnings: result.totalWarnings })
      return result
    } catch (err) {
      logger.error('Export failed', err)
      throw err
    }
  })

  ipcMain.handle('get-thumbnail-dir', async (_event, jobId: string) => {
    const meta = await jobRepository.getJobDetail(jobId)
    if (!meta) return null
    return exportService.getThumbnailDir(meta.versionPath)
  })

  ipcMain.handle('capture-thumbnail', async (_event, payload: CaptureThumbnailPayload) => {
    if (!payload || !payload.jobId || !payload.platformId || !payload.countryId || !payload.crop) {
      throw new Error('Invalid capture thumbnail payload')
    }
    logger.info('Capture thumbnail', { jobId: payload.jobId, slice: payload.sliceIndex, platform: `${payload.countryId}/${payload.platformId}` })
    const thumbJpgQuality = settingsService.load().export.jpgQuality
    try {
      const countries = settingsService.getCountryPresets()
      const result = await exportService.captureThumbnail(payload, countries, thumbJpgQuality)
      logger.info('Thumbnail captured', { outputPath: result.outputPath })
      return result
    } catch (err) {
      logger.error('Capture thumbnail failed', err)
      throw err
    }
  })
}

function registerJobHandlers(services: Services) {
  const { jobRepository, jobExecutionService, previewService, settingsService, logger } = services
  const state = { isSliceRunning: false }

  ipcMain.handle('get-recent-jobs', () => {
    return jobRepository.getRecentJobs()
  })

  ipcMain.handle('get-job-detail', (_event, jobId: string) => {
    return jobRepository.getJobDetail(jobId)
  })

  ipcMain.handle('get-storage-info', () => {
    return jobRepository.getStorageInfo()
  })

  ipcMain.handle('run-slice-job', async (_event, payload: RunSliceJobPayload) => {
    if (state.isSliceRunning) throw new Error('A slice job is already running')
    state.isSliceRunning = true
    const validated = validatePayload(payload)
    logger.info('Slice job started', { source: validated.sourcePdfPath, mode: validated.mode })
    const win = services.getMainWindow()
    try {
      const meta = await jobExecutionService.execute(validated, (progress) => sendProgress(win, { ...progress, operation: 'slice' }))
      logger.info('Slice job completed', { jobId: meta.id, slices: meta.sliceCount, pages: meta.pageCount })
      return meta
    } catch (err) {
      logger.error('Slice job failed', err)
      throw err
    } finally {
      state.isSliceRunning = false
    }
  })

  ipcMain.handle('generate-preview', async (_event, jobId: string) => {
    try {
      const meta = await jobRepository.getJobDetail(jobId)
      if (!meta) throw new Error(`Job ${jobId} not found`)

      const settings = settingsService.load()
      const devices = settingsService.getDevicePresets()
      previewService.writePreviewFiles(meta.versionPath, meta.files, devices, {
        imageGap: settings.preview.imageGap,
        defaultDeviceId: settings.preview.defaultDeviceId
      })
      logger.info('Preview generated', { jobId })
    } catch (err) {
      logger.error('Failed to generate preview', err)
      throw new Error(`Failed to generate preview: ${toErrorMessage(err)}`)
    }
  })

  ipcMain.handle('open-source-pdf', async (_event, jobId: string) => {
    const meta = await jobRepository.getJobDetail(jobId)
    if (!meta) throw new Error(`Job ${jobId} not found`)

    const pdfPath = meta.copiedPdfPath || meta.sourcePdfPath
    const baseDir = settingsService.load().baseDir
    if (!isPathWithinBaseDir(pdfPath, baseDir)) {
      throw new Error('Path is outside allowed directory')
    }
    await shell.openPath(pdfPath)
  })

  ipcMain.handle('delete-job', async (_event, jobId: string) => {
    const result = await jobRepository.deleteJob(jobId)
    logger.info('Job deleted', { jobId, success: result })
    return result
  })

  ipcMain.handle('delete-jobs-by-pdf', async (_event, sourcePdfPath: string) => {
    const count = await jobRepository.deleteJobsByPdf(sourcePdfPath)
    logger.info('Jobs deleted by PDF', { sourcePdfPath, count })
    return count
  })

  ipcMain.handle('delete-all-jobs', async () => {
    const count = await jobRepository.deleteAllJobs()
    logger.info('All jobs deleted', { count })
    return count
  })

  return state
}

function registerPdfHandlers(services: Services) {
  const { pdfService, logger } = services

  ipcMain.handle('get-pdf-page-dimensions', async (_event, pdfPath: string) => {
    if (typeof pdfPath !== 'string' || !pdfPath) throw new Error('Invalid path')
    if (!pdfPath.toLowerCase().endsWith('.pdf')) throw new Error('Not a PDF file')
    try {
      return await pdfService.getPageDimensions(pdfPath)
    } catch (err) {
      logger.error('Failed to get PDF page dimensions', err)
      throw new Error(`Failed to get PDF page dimensions: ${toErrorMessage(err)}`)
    }
  })
}

function registerRendererLogHandler(services: Services) {
  const { logger } = services
  ipcMain.on('renderer-log', (_event, data: { level: string; message: string; extra?: unknown }) => {
    const msg = `[renderer] ${data.message}`
    if (data.level === 'error') logger.error(msg, data.extra)
    else if (data.level === 'warn') logger.warn(msg, data.extra)
    else logger.info(msg, data.extra)
  })
}

export type IpcState = {
  isJobRunning: () => boolean
}

export function registerIpcHandlers(services: Services): IpcState {
  registerDialogHandlers(services)
  registerSettingsHandlers(services)
  registerPresetImportExportHandlers(services)
  const jobState = registerJobHandlers(services)
  registerExportHandlers(services)
  registerPdfHandlers(services)
  registerRendererLogHandler(services)
  return { isJobRunning: () => jobState.isSliceRunning }
}
