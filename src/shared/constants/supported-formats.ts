export const SUPPORTED_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png'] as const
export const SUPPORTED_DOCUMENT_EXTENSIONS = ['.pdf'] as const
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

export function isImageFile(filePath: string): boolean {
  const ext = getFileExtension(filePath)
  return (SUPPORTED_IMAGE_EXTENSIONS as readonly string[]).includes(ext)
}

/** Strip the file extension from a filename (handles all supported formats) */
export function stripExtension(filename: string): string {
  return filename.replace(/\.(pdf|jpe?g|png)$/i, '')
}

/** For Electron dialog filters */
export function getDialogFilters(): { name: string; extensions: string[] }[] {
  return [
    { name: 'Supported Files', extensions: ['pdf', 'jpg', 'jpeg', 'png'] },
    { name: 'PDF Files', extensions: ['pdf'] },
    { name: 'Image Files', extensions: ['jpg', 'jpeg', 'png'] }
  ]
}
