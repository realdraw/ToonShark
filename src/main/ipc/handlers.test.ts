import {beforeEach, describe, expect, it, vi} from 'vitest'
import type {AppSettings, DevicePreset, JobMeta, JobProgress, RunSliceJobPayload} from '@shared/types'
import {DEFAULT_SETTINGS} from '@shared/constants'

const handleMap = new Map<string, Function>()
const onMap = new Map<string, Function>()

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: Function) => {
      handleMap.set(channel, handler)
    }),
    on: vi.fn((channel: string, handler: Function) => {
      onMap.set(channel, handler)
    })
  },
  dialog: {
    showOpenDialog: vi.fn(),
    showSaveDialog: vi.fn()
  },
  shell: {
    openPath: vi.fn()
  },
  BrowserWindow: class {}
}))

type MockedServices = Parameters<typeof import('./handlers').registerIpcHandlers>[0]

function createServices(): MockedServices {
  const settings: AppSettings = {
    ...DEFAULT_SETTINGS,
    baseDir: '/allowed/base'
  }

  return {
    settingsService: {
      load: vi.fn(() => settings),
      saveAndMigrateBaseDir: vi.fn(() => ({
        previousBaseDir: '/allowed/base',
        currentBaseDir: '/new/base',
        baseDirChanged: true
      })),
      getDevicePresets: vi.fn((): DevicePreset[] => []),
      saveDevicePresets: vi.fn(),
      getDefaultDevicePresets: vi.fn((): DevicePreset[] => []),
      getDefaultBaseDir: vi.fn(() => '/default/base'),
      getCountryPresets: vi.fn(() => []),
      ensureBaseStructure: vi.fn()
    } as any,
    previewService: {
      writePreviewFiles: vi.fn()
    } as any,
    jobRepository: {
      updateBaseDir: vi.fn(),
      getRecentJobs: vi.fn(async () => []),
      getJobDetail: vi.fn(async () => null as JobMeta | null),
      getStorageInfo: vi.fn(async () => ({ totalSize: 0, pdfs: [] })),
      deleteJob: vi.fn(async () => false),
      deleteJobsByPdf: vi.fn(async () => 0),
      deleteAllJobs: vi.fn(async () => 0)
    } as any,
    jobExecutionService: {
      execute: vi.fn(async (_payload: RunSliceJobPayload, onProgress: (progress: JobProgress) => void) => {
        onProgress({ stepKey: 'progressDone', current: 1, total: 1, percent: 100 })
        return {
          id: 'job-1',
          title: 'test',
          prefix: 'test',
          sourcePdfPath: '/allowed/base/source.pdf',
          copiedPdfPath: '/allowed/base/jobs/test/source/source.pdf',
          createdAt: new Date().toISOString(),
          mode: 'fixed',
          pageCount: 1,
          sliceCount: 1,
          versionPath: '/allowed/base/jobs/test/v1',
          options: {},
          files: []
        }
      })
    } as any,
    exportService: {
      exportJob: vi.fn(async () => ({ jobId: 'job-1', platforms: [], totalFiles: 0, totalWarnings: 0 })),
      getExportHistory: vi.fn(() => []),
      getThumbnailDir: vi.fn(() => '/allowed/base/jobs/test/v1/export/kr/naver/thumbnail'),
      captureThumbnail: vi.fn(async () => ({ outputPath: '/allowed/base/jobs/test/v1/export/kr/naver/thumbnail/test.jpg', width: 1200, height: 630 }))
    } as any,
    pdfService: {
      getPageDimensions: vi.fn(async () => ({ width: 100, height: 200 }))
    } as any,
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      updateBaseDir: vi.fn()
    } as any,
    getMainWindow: () => ({
      isDestroyed: () => false,
      webContents: { send: vi.fn() }
    } as any)
  }
}

describe('registerIpcHandlers', () => {
  beforeEach(() => {
    handleMap.clear()
    onMap.clear()
    vi.resetModules()
  })

  it('registers get-default-settings with default baseDir injected', async () => {
    const { registerIpcHandlers } = await import('./handlers')
    const services = createServices()

    registerIpcHandlers(services)
    const handler = handleMap.get('get-default-settings')

    expect(handler).toBeTypeOf('function')
    expect(await handler?.()).toEqual({
      ...DEFAULT_SETTINGS,
      baseDir: '/default/base'
    })
  })

  it('blocks open-path outside baseDir', async () => {
    const { registerIpcHandlers } = await import('./handlers')
    const services = createServices()

    registerIpcHandlers(services)
    const handler = handleMap.get('open-path')

    await expect(handler?.({}, '/outside/base/file.txt')).rejects.toThrow('Path is outside allowed directory')
  })

  it('updates repository and logger when save-settings changes baseDir', async () => {
    const { registerIpcHandlers } = await import('./handlers')
    const services = createServices()

    registerIpcHandlers(services)
    const handler = handleMap.get('save-settings')

    await handler?.({}, {
      ...DEFAULT_SETTINGS,
      baseDir: '/new/base'
    })

    expect(services.settingsService.saveAndMigrateBaseDir).toHaveBeenCalled()
    expect(services.jobRepository.updateBaseDir).toHaveBeenCalledWith('/new/base')
    expect(services.logger.updateBaseDir).toHaveBeenCalledWith('/new/base')
  })

  it('registers get-thumbnail-dir handler', async () => {
    const { registerIpcHandlers } = await import('./handlers')
    const services = createServices()
    services.jobRepository.getJobDetail = vi.fn(async () => ({
      id: 'job-1',
      versionPath: '/allowed/base/jobs/test/v1'
    } as JobMeta))

    registerIpcHandlers(services)
    const handler = handleMap.get('get-thumbnail-dir')

    expect(handler).toBeTypeOf('function')

    const result = await handler?.({}, 'job-1')

    expect(services.jobRepository.getJobDetail).toHaveBeenCalledWith('job-1')
    expect(services.exportService.getThumbnailDir).toHaveBeenCalledWith('/allowed/base/jobs/test/v1')
    expect(result).toBe('/allowed/base/jobs/test/v1/export/kr/naver/thumbnail')
  })

  it('returns null from get-thumbnail-dir when job not found', async () => {
    const { registerIpcHandlers } = await import('./handlers')
    const services = createServices()
    services.jobRepository.getJobDetail = vi.fn(async () => null)

    registerIpcHandlers(services)
    const handler = handleMap.get('get-thumbnail-dir')

    const result = await handler?.({}, 'nonexistent')
    expect(result).toBeNull()
  })

  it('registers capture-thumbnail handler', async () => {
    const { registerIpcHandlers } = await import('./handlers')
    const services = createServices()

    registerIpcHandlers(services)
    const handler = handleMap.get('capture-thumbnail')

    expect(handler).toBeTypeOf('function')

    const payload = {
      jobId: 'job-1',
      sliceIndex: 1,
      countryId: 'kr',
      platformId: 'naver',
      crop: { x: 0, y: 0, width: 100, height: 50 }
    }

    const result = await handler?.({}, payload)

    expect(services.settingsService.getCountryPresets).toHaveBeenCalled()
    expect(services.exportService.captureThumbnail).toHaveBeenCalledWith(payload, [], 90)
    expect(result.outputPath).toContain('thumbnail')
  })

  it('passes jpgQuality from settings to run-export', async () => {
    const { registerIpcHandlers } = await import('./handlers')
    const services = createServices()
    services.settingsService.load = vi.fn(() => ({
      ...DEFAULT_SETTINGS,
      baseDir: '/allowed/base',
      export: { jpgQuality: 75 }
    }))

    registerIpcHandlers(services)
    const handler = handleMap.get('run-export')

    const payload = {
      jobId: 'job-1',
      entries: [{ countryId: 'kr', platform: { id: 'naver', episode: { width: 690, format: 'png' } } }]
    }

    await handler?.({}, payload)

    expect(services.exportService.exportJob).toHaveBeenCalledWith(
      payload,
      expect.any(Function),
      75
    )
  })

  it('rejects invalid capture-thumbnail payload', async () => {
    const { registerIpcHandlers } = await import('./handlers')
    const services = createServices()

    registerIpcHandlers(services)
    const handler = handleMap.get('capture-thumbnail')

    await expect(handler?.({}, {})).rejects.toThrow('Invalid capture thumbnail payload')
    await expect(handler?.({}, null)).rejects.toThrow('Invalid capture thumbnail payload')
  })

  it('rejects concurrent slice jobs', async () => {
    const { registerIpcHandlers } = await import('./handlers')
    const services = createServices()
    let release!: () => void

    services.jobExecutionService.execute = vi.fn(
      () => new Promise<JobMeta>((resolve) => {
        release = () => resolve({
          id: 'job-1',
          title: 'test',
          prefix: 'test',
          sourcePdfPath: '/allowed/base/source.pdf',
          copiedPdfPath: '/allowed/base/jobs/test/source/source.pdf',
          createdAt: new Date().toISOString(),
          mode: 'fixed',
          pageCount: 1,
          sliceCount: 1,
          versionPath: '/allowed/base/jobs/test/v1',
          options: {},
          files: []
        })
      })
    )

    registerIpcHandlers(services)
    const handler = handleMap.get('run-slice-job')!
    const payload: RunSliceJobPayload = {
      sourcePdfPath: '/allowed/base/source.pdf',
      title: 'test',
      prefix: 'test',
      mode: 'fixed',
      options: { sliceHeight: 100 }
    }

    const first = handler({}, payload)
    await expect(handler({}, payload)).rejects.toThrow('A slice job is already running')
    release()
    await first
  })
})
