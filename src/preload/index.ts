import {contextBridge, ipcRenderer, webUtils} from 'electron'
import type {
  AppSettings,
  CaptureThumbnailPayload,
  CaptureThumbnailResult,
  Country,
  DevicePreset,
  ExportHistoryEntry,
  ExportJobPayload,
  ExportResult,
  JobMeta,
  JobProgress,
  RunSliceJobPayload,
  StorageInfo
} from '@shared/types'


const api = {
  selectSourcePdf: (): Promise<string | null> =>
    ipcRenderer.invoke('select-source-pdf'),

  selectBaseDir: (): Promise<string | null> =>
    ipcRenderer.invoke('select-base-dir'),

  openPath: (path: string): Promise<void> =>
    ipcRenderer.invoke('open-path', path),

  loadSettings: (): Promise<AppSettings> =>
    ipcRenderer.invoke('load-settings'),

  saveSettings: (settings: AppSettings): Promise<void> =>
    ipcRenderer.invoke('save-settings', settings),

  getDevicePresets: (): Promise<DevicePreset[]> =>
    ipcRenderer.invoke('get-device-presets'),

  saveDevicePresets: (devices: DevicePreset[]): Promise<void> =>
    ipcRenderer.invoke('save-device-presets', devices),

  getDefaultDevicePresets: (): Promise<DevicePreset[]> =>
    ipcRenderer.invoke('get-default-device-presets'),

  getDefaultSettings: (): Promise<AppSettings> =>
    ipcRenderer.invoke('get-default-settings'),

  getCountryPresets: (): Promise<Country[]> =>
    ipcRenderer.invoke('get-country-presets'),

  exportPresets: (): Promise<boolean> =>
    ipcRenderer.invoke('export-presets'),

  importPresets: (): Promise<{ devices: DevicePreset[] } | null> =>
    ipcRenderer.invoke('import-presets'),

  getExportHistory: (jobId: string): Promise<ExportHistoryEntry[]> =>
    ipcRenderer.invoke('get-export-history', jobId),

  runExport: (payload: ExportJobPayload): Promise<ExportResult> =>
    ipcRenderer.invoke('run-export', payload),

  getThumbnailDir: (jobId: string): Promise<string | null> =>
    ipcRenderer.invoke('get-thumbnail-dir', jobId),

  captureThumbnail: (payload: CaptureThumbnailPayload): Promise<CaptureThumbnailResult> =>
    ipcRenderer.invoke('capture-thumbnail', payload),

  getRecentJobs: (): Promise<JobMeta[]> =>
    ipcRenderer.invoke('get-recent-jobs'),

  getJobDetail: (jobId: string): Promise<JobMeta | null> =>
    ipcRenderer.invoke('get-job-detail', jobId),

  getStorageInfo: (): Promise<StorageInfo> =>
    ipcRenderer.invoke('get-storage-info'),

  getPdfPageDimensions: (pdfPath: string): Promise<{ width: number; height: number }> =>
    ipcRenderer.invoke('get-pdf-page-dimensions', pdfPath),

  runSliceJob: (payload: RunSliceJobPayload): Promise<JobMeta> =>
    ipcRenderer.invoke('run-slice-job', payload),

  generatePreview: (jobId: string): Promise<void> =>
    ipcRenderer.invoke('generate-preview', jobId),

  openSourcePdf: (jobId: string): Promise<void> =>
    ipcRenderer.invoke('open-source-pdf', jobId),

  deleteJob: (jobId: string): Promise<boolean> =>
    ipcRenderer.invoke('delete-job', jobId),

  deleteJobsByPdf: (sourcePdfPath: string): Promise<number> =>
    ipcRenderer.invoke('delete-jobs-by-pdf', sourcePdfPath),

  deleteAllJobs: (): Promise<number> =>
    ipcRenderer.invoke('delete-all-jobs'),

  log: (level: 'info' | 'warn' | 'error', message: string, extra?: unknown): void => {
    ipcRenderer.send('renderer-log', { level, message, extra })
  },

  getPathForFile: (file: File): string => {
    try {
      return webUtils.getPathForFile(file)
    } catch {
      return (file as File & { path?: string }).path ?? ''
    }
  },

  onJobProgress: (callback: (progress: JobProgress) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, progress: JobProgress) => callback(progress)
    ipcRenderer.on('job-progress', listener)
    return () => {
      ipcRenderer.removeListener('job-progress', listener)
    }
  }
}

contextBridge.exposeInMainWorld('api', api)

export type ElectronAPI = typeof api
