import {mkdirSync} from 'fs'
import {open, readdir, stat} from 'fs/promises'
import {createHash} from 'crypto'
import {join} from 'path'

const MAX_FOLDER_NAME_LENGTH = 100
const PARTIAL_HASH_SIZE = 64 * 1024 // 64KB

export class FileService {
  sanitizePrefix(raw: string): string {
    let sanitized = raw
      .trim()
      .replace(/\s+/g, '_')
      .replace(/[^\p{L}\p{N}_-]/gu, '')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')

    if (!sanitized) {
      return 'untitled'
    }
    return sanitized
  }

  generateVersionId(): string {
    const now = new Date()
    const y = now.getFullYear()
    const m = String(now.getMonth() + 1).padStart(2, '0')
    const d = String(now.getDate()).padStart(2, '0')
    const h = String(now.getHours()).padStart(2, '0')
    const min = String(now.getMinutes()).padStart(2, '0')
    const s = String(now.getSeconds()).padStart(2, '0')
    const ms = String(now.getMilliseconds()).padStart(3, '0')
    return `v${y}${m}${d}_${h}${min}${s}_${ms}`
  }

  createVersionFolder(baseDir: string, jobName: string): string {
    const jobDir = join(baseDir, 'jobs', jobName)
    const versionId = this.generateVersionId()
    const versionPath = join(jobDir, versionId)

    // source/ is at job level (shared across versions)
    mkdirSync(join(jobDir, 'source'), { recursive: true })
    for (const sub of ['rendered', 'slices', 'thumbs', 'preview']) {
      mkdirSync(join(versionPath, sub), { recursive: true })
    }

    return versionPath
  }

  sanitizePdfFolderName(pdfPath: string): string {
    // Handle both / and \ separators (cross-platform)
    const fileName = pdfPath.replace(/\\/g, '/').split('/').pop() ?? ''
    const name = fileName.replace(/\.pdf$/i, '')
    let sanitized = name
      .trim()
      .replace(/\s+/g, '_')
      .replace(/[^\p{L}\p{N}_-]/gu, '')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')

    if (!sanitized) return 'untitled'
    if (sanitized.length > MAX_FOLDER_NAME_LENGTH) {
      sanitized = sanitized.slice(0, MAX_FOLDER_NAME_LENGTH).replace(/_$/, '')
    }
    return sanitized
  }

  async comparePdfFiles(pathA: string, pathB: string): Promise<boolean> {
    try {
      const [statA, statB] = await Promise.all([stat(pathA), stat(pathB)])
      if (statA.size !== statB.size) return false

      const size = statA.size
      const headSize = Math.min(PARTIAL_HASH_SIZE, size)
      const tailSize = Math.min(PARTIAL_HASH_SIZE, size)
      const tailOffset = Math.max(0, size - tailSize)

      const hash = createHash('sha256')
      const hashB = createHash('sha256')

      const [fhA, fhB] = await Promise.all([open(pathA, 'r'), open(pathB, 'r')])
      try {
        // Read head
        const headBufA = Buffer.alloc(headSize)
        const headBufB = Buffer.alloc(headSize)
        await Promise.all([
          fhA.read(headBufA, 0, headSize, 0),
          fhB.read(headBufB, 0, headSize, 0)
        ])
        hash.update(headBufA)
        hashB.update(headBufB)

        // Read tail (if different from head region)
        if (tailOffset > headSize) {
          const tailBufA = Buffer.alloc(tailSize)
          const tailBufB = Buffer.alloc(tailSize)
          await Promise.all([
            fhA.read(tailBufA, 0, tailSize, tailOffset),
            fhB.read(tailBufB, 0, tailSize, tailOffset)
          ])
          hash.update(tailBufA)
          hashB.update(tailBufB)
        }
      } finally {
        await Promise.all([fhA.close(), fhB.close()])
      }

      return hash.digest('hex') === hashB.digest('hex')
    } catch {
      return false
    }
  }

  async getDirSize(dirPath: string): Promise<number> {
    let size = 0
    try {
      const entries = await readdir(dirPath)
      for (const entry of entries) {
        const fullPath = join(dirPath, entry)
        const s = await stat(fullPath)
        if (s.isDirectory()) {
          size += await this.getDirSize(fullPath)
        } else {
          size += s.size
        }
      }
    } catch {
      // skip unreadable
    }
    return size
  }
}
