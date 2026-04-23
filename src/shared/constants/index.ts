import type {AppSettings} from '../types'
import {DEFAULT_AUTO_SLICE} from '../types'

export { PDF_SCALE_MIN, PDF_SCALE_MAX } from './pdf-scale'
export {
  SUPPORTED_EXTENSIONS,
  SUPPORTED_IMAGE_EXTENSIONS,
  SUPPORTED_DOCUMENT_EXTENSIONS,
  isSupportedFile,
  isPdfFile,
  isPsdFile,
  isImageFile,
  getFileExtension,
  stripExtension,
  getDialogFilters
} from './supported-formats'

export const DEFAULT_SETTINGS: AppSettings = {
  baseDir: '',
  defaultSliceHeight: 1280,
  naming: {
    defaultPrefix: 'untitled',
    filenamePadding: 4
  },
  autoSlice: { ...DEFAULT_AUTO_SLICE },
  pdfScale: 4.0,
  export: {
    jpgQuality: 90
  },
  preview: {
    defaultDeviceId: 'iphone_16_pro',
    imageGap: 0,
    scrollAmount: 300
  },
  locale: 'en',
  theme: 'dark'
}
