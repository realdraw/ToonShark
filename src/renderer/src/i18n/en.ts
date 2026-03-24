export interface TranslationKeys {
  // Common
  loading: string
  back: string
  delete: string
  open: string
  run: string
  processing: string
  saved: string

  // HomePage
  appTitle: string
  openFolder: string
  settings: string
  openFile: string
  recentJobs: string
  noJobsTitle: string
  noJobsDesc: string
  dropFileHere: string
  runs: (n: number) => string
  slices: (n: number) => string
  preview: string
  fixed: string
  auto: string

  openFiles: string

  // WorkspacePage
  addFile: string
  home: string
  filePrefix: string
  filePrefixDesc: string
  sliceMode: string
  sliceModeDesc: string
  whiteThreshold: string
  whiteThresholdDesc: string
  loose: string
  strict: string
  whiteOnly: string
  minWhiteRunLabel: string
  minWhiteRunDesc: string
  minSliceHeightLabel: string
  minSliceHeightDesc: string
  cutPositionLabel: string
  cutPositionDesc: string
  cutMiddle: string
  cutBeforeColor: string
  sliceHeightLabel: string
  sliceHeightDesc: string
  startOffsetLabel: string
  startOffsetDesc: string
  pdfScaleLabel: string
  pdfScaleDesc: string
  noResultsTitle: string
  noResultsDesc: string
  runCount: (n: number) => string
  sourceFile: string
  folder: string
  detail: string

  // JobDetailPage
  createdAt: string
  pages: string
  slicesLabel: string
  mode: string
  fixedInterval: string
  prefixLabel: string
  sourceFileLabel: string
  openSourceFile: string

  // SliceDetailPage
  sliceNotFound: string
  jobNotFound: string
  prev: string
  next: string
  page: (n: number) => string
  scrollSpeed: string

  // PreviewPage
  width: string
  height: string
  gap: string

  // SettingsPage
  settingsTitle: string
  storage: string
  baseDir: string
  browse: string
  sliceDefaults: string
  defaultHeight: string
  autoSlice: string
  marginSensitivity: string
  minMarginHeight: string
  minSliceHeightSetting: string
  cutPositionSetting: string
  naming: string
  defaultPrefix: string
  filenamePadding: string
  pdfScaleSetting: string
  previewSection: string
  imageGap: string
  scrollAmountSetting: string
  saveSettings: string
  saveSettingsFailed: string
  language: string
  languageSection: string
  english: string
  korean: string
  themeSection: string
  themeLabel: string
  themeLight: string
  themeDark: string
  themeSystem: string

  // Storage Info
  totalUsage: string
  storageWarning: (size: string) => string
  storageWarningAction: string
  deleteAll: string
  deleteSource: string
  confirmDeleteAll: string
  confirmDeleteSource: (name: string) => string
  confirmDeleteJob: string

  // Device Presets
  devicePresets: string
  deviceName: string
  viewportWidth: string
  viewportHeight: string
  addDevice: string
  resetDefaults: string
  resetAllSettings: string
  resetAllSettingsConfirm: string
  resetAllSettingsSaveReminder: string
  unsavedChanges: string
  saveChanges: string

  // Export Settings
  exportSection: string
  jpgQuality: string
  jpgQualityDesc: string

  // Export
  exportTitle: string
  exportButton: string
  exportRun: string
  exportRunning: string
  exportNoPlatforms: string
  exportSuccess: string
  exportWarnings: (n: number) => string
  exportFiles: (n: number) => string
  exportOpenFolder: string
  exportNoSlices: string
  exportPlatform: string
  exportWidth: string
  exportFormat: string
  exportMaxSize: string
  exportedBadge: string
  exportedAt: (date: string) => string

  // Preset Import/Export
  importPresets: string
  exportPresets: string
  importPresetsSuccess: string
  exportPresetsSuccess: string
  importPresetsFailed: string
  exportPresetsFailed: string
  platformCount: (n: number) => string

  // Country / Platform names (i18n)
  countryName: (id: string) => string
  platformName: (id: string) => string

  // Progress steps
  progressCopyPdf: string
  progressCountPages: string
  progressRenderPages: string
  progressSlicing: string
  progressPreview: string
  progressDone: string
  progressExporting: string

  // Thumbnail Capture
  thumbnail: string
  thumbnailConfirm: string
  thumbnailCancel: string
  thumbnailSuccess: string
  thumbnailSuccessUpscaled: (srcW: number, srcH: number) => string
  thumbnailFailed: string
  thumbnailNoPlatforms: string
  thumbnailOpenFolder: string

  // Duplicate detection
  toastDuplicateJob: string

  // Toast
  toastJobSuccess: (sliceCount: number) => string
  toastJobFailed: string
  toastExportSuccess: (fileCount: number) => string
  toastExportFailed: string
}

const en: TranslationKeys = {
  // Common
  loading: 'Loading...',
  back: 'Back',
  delete: 'Delete',
  open: 'Open',
  run: 'Run',
  processing: 'Processing...',
  saved: 'Saved!',

  // HomePage
  appTitle: 'ToonShark',
  openFolder: 'Open Folder',
  settings: 'Settings',
  openFile: 'Open File',
  recentJobs: 'Recent Jobs',
  noJobsTitle: 'No jobs yet',
  noJobsDesc: 'Open a file to get started',
  dropFileHere: 'Drop PDF or image files here',
  runs: (n: number) => `${n} run${n !== 1 ? 's' : ''}`,
  slices: (n: number) => `${n} slice${n !== 1 ? 's' : ''}`,
  preview: 'Preview',
  fixed: 'Fixed',
  auto: 'Auto',

  openFiles: 'Open Files',

  // WorkspacePage
  addFile: '+ Add File',
  home: 'Home',
  filePrefix: 'File Prefix',
  filePrefixDesc: 'Name prepended to output files. Auto-generated from source filename. Korean characters supported.',
  sliceMode: 'Slice Mode',
  sliceModeDesc: 'Auto: Automatically detects cut boundaries by analyzing white margins. Fixed: Mechanically splits at a fixed height.',
  whiteThreshold: 'Margin Color Sensitivity',
  whiteThresholdDesc: 'Strict: Only pure white is recognized as margin. Loose: Slightly gray areas are also recognized as margin. "Strict" is recommended for most cases.',
  loose: 'Loose',
  strict: 'Strict',
  whiteOnly: 'White only',
  minWhiteRunLabel: 'Min Margin Height (px)',
  minWhiteRunDesc: 'Consecutive white rows must be at least this many pixels to be recognized as a cut boundary. Higher values ignore small margins.',
  minSliceHeightLabel: 'Min Slice Height (px)',
  minSliceHeightDesc: 'Minimum height of each split slice. Prevents overly small fragments.',
  cutPositionLabel: 'Cut Position',
  cutPositionDesc: 'Middle of margin: Cuts at the center of the white area. Before color: Cuts just above where the drawing begins.',
  cutMiddle: 'Middle of margin',
  cutBeforeColor: 'Before color',
  sliceHeightLabel: 'Slice Height (px)',
  sliceHeightDesc: 'Fixed height for each slice.',
  startOffsetLabel: 'Start Offset (px)',
  startOffsetDesc: 'Skip this many pixels from the top before starting to split. Useful for excluding top margins or headers.',
  pdfScaleLabel: 'PDF Render Scale',
  pdfScaleDesc: 'Scale factor for converting PDF to image. 1.0 = original size, 2.0 = double resolution. Higher values produce sharper images but take longer.',
  noResultsTitle: 'No results',
  noResultsDesc: 'Adjust options and click Run',
  runCount: (n: number) => `(${n} run${n !== 1 ? 's' : ''})`,
  sourceFile: 'Source File',
  folder: 'Folder',
  detail: 'Detail',

  // JobDetailPage
  createdAt: 'Created',
  pages: 'Pages',
  slicesLabel: 'Slices',
  mode: 'Mode',
  fixedInterval: 'Fixed interval',
  prefixLabel: 'Prefix',
  sourceFileLabel: 'Source File',
  openSourceFile: 'Open Source File',

  // SliceDetailPage
  sliceNotFound: 'Slice not found',
  jobNotFound: 'Job not found',
  prev: 'Prev',
  next: 'Next',
  page: (n: number) => `Page ${n}`,
  scrollSpeed: 'Scroll',

  // PreviewPage
  width: 'Width',
  height: 'Height',
  gap: 'Gap',

  // SettingsPage
  settingsTitle: 'Settings',
  storage: 'Storage',
  baseDir: 'Base Directory',
  browse: 'Browse',
  sliceDefaults: 'Slice Defaults',
  defaultHeight: 'Default Height (px)',
  autoSlice: 'Auto Slice',
  marginSensitivity: 'Margin Color Sensitivity',
  minMarginHeight: 'Min Margin Height (px)',
  minSliceHeightSetting: 'Min Slice Height (px)',
  cutPositionSetting: 'Cut Position',
  naming: 'Naming',
  defaultPrefix: 'Default Prefix',
  filenamePadding: 'Number Padding',
  pdfScaleSetting: 'PDF Render Scale',
  previewSection: 'Preview',
  imageGap: 'Image Gap (px)',
  scrollAmountSetting: 'Scroll Amount (px)',
  saveSettings: 'Save Settings',
  saveSettingsFailed: 'Failed to save settings',
  language: 'Language',
  languageSection: 'Language',
  english: 'English',
  korean: '한국어',
  themeSection: 'Theme',
  themeLabel: 'Appearance',
  themeLight: 'Light',
  themeDark: 'Dark',
  themeSystem: 'System',

  // Storage Info
  totalUsage: 'Total',
  storageWarning: (size: string) => `Storage usage is ${size}. Consider cleaning up old jobs to free disk space.`,
  storageWarningAction: 'Clean Up',
  deleteAll: 'Delete All',
  deleteSource: 'Delete',
  confirmDeleteAll: 'Are you sure you want to delete all job history? This will permanently remove all files.',
  confirmDeleteSource: (name: string) => `Are you sure you want to delete all history for "${name}"? This will permanently remove all related files.`,
  confirmDeleteJob: 'Are you sure you want to delete this job? This will permanently remove all related files.',

  // Device Presets
  devicePresets: 'Device Presets',
  deviceName: 'Device Name',
  viewportWidth: 'Width (px)',
  viewportHeight: 'Height (px)',
  addDevice: 'Add Device',
  resetDefaults: 'Reset Defaults',
  resetAllSettings: 'Reset All Settings',
  resetAllSettingsConfirm: 'Are you sure you want to reset all settings to defaults? (Base directory will be preserved)',
  resetAllSettingsSaveReminder: 'Settings have been reset. Please click Save to apply.',
  unsavedChanges: 'You have unsaved changes. Do you want to leave without saving?',
  saveChanges: 'Save Changes',

  // Export Settings
  exportSection: 'Export',
  jpgQuality: 'JPG Quality',
  jpgQualityDesc: 'JPEG compression quality for episode export and thumbnail capture. Higher values produce better quality but larger files.',

  // Export
  exportTitle: 'Episode Export',
  exportButton: 'Episode Export',
  exportRun: 'Run Export',
  exportRunning: 'Exporting...',
  exportNoPlatforms: 'No platforms selected',
  exportSuccess: 'Export complete!',
  exportWarnings: (n: number) => `${n} warning${n !== 1 ? 's' : ''}`,
  exportFiles: (n: number) => `${n} file${n !== 1 ? 's' : ''} exported`,
  exportOpenFolder: 'Open Export Folder',
  exportNoSlices: 'No slices found. Run slicing first.',
  exportPlatform: 'Platform',
  exportWidth: 'Width',
  exportFormat: 'Format',
  exportMaxSize: 'Max Size',
  exportedBadge: 'Exported',
  exportedAt: (date: string) => `Exported: ${date}`,

  // Preset Import/Export
  importPresets: 'Import Presets',
  exportPresets: 'Export Presets',
  importPresetsSuccess: 'Presets imported successfully',
  exportPresetsSuccess: 'Presets exported successfully',
  importPresetsFailed: 'Failed to import presets',
  exportPresetsFailed: 'Failed to export presets',
  platformCount: (n: number) => `${n} platform${n !== 1 ? 's' : ''}`,

  // Country / Platform names (i18n)
  countryName: (id: string) => {
    const names: Record<string, string> = {
      kr: 'South Korea'
    }
    return names[id] ?? id
  },
  platformName: (id: string) => {
    const names: Record<string, string> = {
      ridi: 'Ridi', alltoon: 'Alltoon', watcha: 'WATCHA',
      onestore: 'ONE Store', mrblue: 'Mr.Blue', kakaopage: 'KakaoPage',
      bomtoon: 'Bomtoon', lezhin: 'Lezhin Comics', naverseries: 'Naver Series',
      oreum: 'Oreum Media', bookpal: 'Bookpal'
    }
    return names[id] ?? id
  },

  // Progress steps
  progressCopyPdf: 'Copying source file...',
  progressCountPages: 'Counting pages...',
  progressRenderPages: 'Rendering pages...',
  progressSlicing: 'Slicing images...',
  progressPreview: 'Generating preview...',
  progressDone: 'Done',
  progressExporting: 'Exporting...',

  // Thumbnail Capture
  thumbnail: 'Thumbnail',
  thumbnailConfirm: 'Save',
  thumbnailCancel: 'Cancel',
  thumbnailSuccess: 'Thumbnail saved',
  thumbnailSuccessUpscaled: (srcW: number, srcH: number) => `Thumbnail saved (upscaled from ${srcW}x${srcH})`,
  thumbnailFailed: 'Thumbnail capture failed',
  thumbnailNoPlatforms: 'No platforms with thumbnail spec',
  thumbnailOpenFolder: 'Open Folder',

  // Duplicate detection
  toastDuplicateJob: 'A job with the same settings already exists',

  // Toast
  toastJobSuccess: (sliceCount: number) => `Slicing complete! ${sliceCount} slice${sliceCount !== 1 ? 's' : ''} created`,
  toastJobFailed: 'Slicing failed',
  toastExportSuccess: (fileCount: number) => `Export complete! ${fileCount} file${fileCount !== 1 ? 's' : ''} exported`,
  toastExportFailed: 'Export failed',
}

export default en
