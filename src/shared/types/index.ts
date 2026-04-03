/** Default auto-slice settings (safe to use in renderer — no Node.js deps) */
export const DEFAULT_AUTO_SLICE = {
  whiteThreshold: 255,
  minWhiteRun: 20,
  minSliceHeight: 250,
  cutPosition: 'middle' as const
}

export type Locale = 'en' | 'ko'
export type Theme = 'light' | 'dark' | 'system'
export type OutputFormat = 'png' | 'jpg'
export type SliceMode = 'fixed' | 'auto'
export type CutPosition = 'middle' | 'before-color'

export type AppSettings = {
  baseDir: string
  defaultSliceHeight: number
  naming: {
    defaultPrefix: string
    filenamePadding: number
  }
  autoSlice: {
    whiteThreshold: number
    minWhiteRun: number
    minSliceHeight: number
    cutPosition: CutPosition
  }
  pdfScale: number
  export: {
    jpgQuality: number
  }
  preview: {
    defaultDeviceId: string
    imageGap: number
    scrollAmount: number
  }
  locale: Locale
  theme: Theme
}

export type JobMeta = {
  id: string
  title: string
  prefix: string
  sourceFilePath: string
  copiedSourcePath: string
  createdAt: string
  mode: SliceMode
  pageCount: number
  sliceCount: number
  versionPath: string
  options: {
    sliceHeight?: number
    startOffset?: number
    whiteThreshold?: number
    minWhiteRun?: number
    minSliceHeight?: number
    cutPosition?: CutPosition
    pdfScale?: number
  }
  files: SliceFileInfo[]
}

export type SliceFileInfo = {
  name: string
  path: string
  width: number
  height: number
  index: number
  pageNumber?: number
  thumbnailPath?: string
}

export type DevicePreset = {
  id: string
  name: string
  cssViewportWidth: number
  cssViewportHeight: number
}

export type ProgressStepKey =
  | 'progressCopyPdf'
  | 'progressCountPages'
  | 'progressRenderPages'
  | 'progressSlicing'
  | 'progressPreview'
  | 'progressDone'
  | 'progressExporting'

export type JobProgress = {
  stepKey: ProgressStepKey
  current: number
  total: number
  percent: number
  operation?: 'slice' | 'export'
}

export type StorageJobInfo = {
  jobId: string
  title: string
  createdAt: string
  size: number
}

export type StorageSourceInfo = {
  sourceFilePath: string
  name: string
  size: number
  jobs: StorageJobInfo[]
}

export type StorageInfo = {
  totalSize: number
  sources: StorageSourceInfo[]
}

export type EpisodeSpec = {
  width: number
  format: OutputFormat
  maxFileSizeMB?: number
}

export type ThumbnailSpec = {
  width: number
  height: number
  format: OutputFormat
  maxFileSizeMB?: number
}

export type Platform = {
  id: string
  episode: EpisodeSpec
  thumbnail?: ThumbnailSpec
}

export type Country = {
  id: string
  platforms: Platform[]
}

export type ExportWarning = {
  file: string
  platformId: string
  message: string
}

export type ExportPlatformResult = {
  countryId: string
  platformId: string
  outputDir: string
  fileCount: number
  warnings: ExportWarning[]
}

export type ExportResult = {
  jobId: string
  platforms: ExportPlatformResult[]
  totalFiles: number
  totalWarnings: number
}

export type ExportPlatformEntry = {
  countryId: string
  platform: Platform
}

export type ExportJobPayload = {
  jobId: string
  entries: ExportPlatformEntry[]
}

export type ExportHistoryEntry = {
  countryId: string
  platformId: string
  exportedAt: string
  fileCount: number
  outputDir: string
}

export type ExportHistory = {
  exports: ExportHistoryEntry[]
}

export type CaptureThumbnailPayload = {
  jobId: string
  sliceIndex: number
  countryId: string
  platformId: string
  crop: { x: number; y: number; width: number; height: number }
}

export type CaptureThumbnailResult = {
  outputPath: string
  width: number
  height: number
  upscaled: boolean
  sourceSize?: { width: number; height: number }
  oversizedWarning?: string
}

export type RunSliceJobPayload = {
  sourceFilePath: string
  title: string
  prefix: string
  mode: SliceMode
  pdfScale?: number
  options: {
    sliceHeight?: number
    startOffset?: number
    whiteThreshold?: number
    minWhiteRun?: number
    minSliceHeight?: number
    cutPosition?: CutPosition
  }
}
