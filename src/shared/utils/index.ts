import {stripExtension} from '../constants/supported-formats'

export function toErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

export function extractSourceName(path: string): string {
  const basename = path.split(/[\\/]/).pop() ?? ''
  const stripped = stripExtension(basename)
  return stripped || 'untitled'
}

/** @deprecated Use extractSourceName instead */
export const extractPdfName = extractSourceName

export function toLocalFileUrl(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/')
  // Encode each path segment to handle #, ?, spaces, etc.
  const encoded = normalized.split('/').map(s => encodeURIComponent(s)).join('/')
  // Windows: C:/path → /C:/path (URL needs leading slash for absolute paths)
  const urlPath = /^[a-zA-Z]%3A/.test(encoded) ? `/${encoded}` : encoded
  return `local-file://${urlPath}`
}

/**
 * Sanitize an ID for use as a folder name.
 * Replaces unsafe characters, collapses underscores, trims.
 */
export function sanitizeFolderId(id: string): string {
  let s = id
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
  if (!s) return 'unknown'
  if (s.length > 100) s = s.slice(0, 100).replace(/_$/, '')
  return s
}

/**
 * Extract the parent directory from a file path.
 * Works with both Unix (/) and Windows (\) separators.
 */
export function extractDir(filePath: string): string {
  const lastSep = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'))
  return lastSep > 0 ? filePath.substring(0, lastSep) : filePath
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 1) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / Math.pow(1024, i)
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}
