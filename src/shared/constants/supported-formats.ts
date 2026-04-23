export const SUPPORTED_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.tif', '.tiff'] as const
export const SUPPORTED_DOCUMENT_EXTENSIONS = ['.pdf', '.psd'] as const
export const SUPPORTED_EXTENSIONS = [
  ...SUPPORTED_DOCUMENT_EXTENSIONS,
  ...SUPPORTED_IMAGE_EXTENSIONS
] as const

export function getFileExtension(filePath: string): string {
  const dot = filePath.lastIndexOf('.')
  return dot >= 0 ? filePath.slice(dot).toLowerCase() : ''
}

export function isSupportedFile(filePath: string): boolean {
  const ext = getFileExtension(filePath)
  return (SUPPORTED_EXTENSIONS as readonly string[]).includes(ext)
}

export function isPdfFile(filePath: string): boolean {
  return getFileExtension(filePath) === '.pdf'
}

export function isPsdFile(filePath: string): boolean {
  return getFileExtension(filePath) === '.psd'
}

export function isImageFile(filePath: string): boolean {
  const ext = getFileExtension(filePath)
  return (SUPPORTED_IMAGE_EXTENSIONS as readonly string[]).includes(ext)
}

/**
 * Internal raw RGBA container format emitted by PsdMergeService. NOT listed in
 * SUPPORTED_EXTENSIONS — users must never drop `.rgba` files directly; only the
 * merge pipeline produces them. See `raw-rgba-source.service.ts` for details.
 */
export function isRawRgbaFile(filePath: string): boolean {
  return getFileExtension(filePath) === '.rgba'
}

/**
 * A file that is not drop-eligible but is a valid pipeline input once produced
 * internally (merge output). Used by IPC gates that must accept the merged
 * output path for dimension queries and slice jobs.
 */
export function isInternalPipelineFile(filePath: string): boolean {
  return isRawRgbaFile(filePath)
}

/** Strip the file extension from a filename (handles all supported formats) */
export function stripExtension(filename: string): string {
  return filename.replace(/\.(pdf|psd|jpe?g|png|tiff?|rgba)$/i, '')
}

/** For Electron dialog filters */
export function getDialogFilters(): { name: string; extensions: string[] }[] {
  return [
    { name: 'Supported Files', extensions: ['pdf', 'psd', 'jpg', 'jpeg', 'png'] },
    { name: 'PDF Files', extensions: ['pdf'] },
    { name: 'PSD Files', extensions: ['psd'] },
    { name: 'Image Files', extensions: ['jpg', 'jpeg', 'png'] }
  ]
}
