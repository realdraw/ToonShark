import {open, stat} from 'fs/promises'
import type {DiskBackedPageResult, SourcePage, SourceRenderer} from './source-renderer'

/**
 * SourceRenderer for the internal `.rgba` container produced by PsdMergeService.
 *
 * File layout:
 *   offset 0x00  uint32 LE  width
 *   offset 0x04  uint32 LE  height
 *   offset 0x08  raw RGBA   width * height * 4 bytes (channels = 4)
 *
 * Why this exists: merged PSD sources routinely reach 400M+ pixels (~1.6 GB
 * raw RGBA). The previous path went through `sharp(tiff).raw().toBuffer()`,
 * which forces libvips to decode the entire TIFF into a single native
 * allocation — that allocation is outside the V8 heap, so
 * `--max-old-space-size` cannot prevent it from failing. When libvips' malloc
 * fails the whole process segfaults and Electron auto-restarts.
 *
 * This renderer avoids every Sharp decode call on merged sources. It returns
 * a `DiskBackedPageResult` that downstream consumers stream chunk-by-chunk
 * from disk. Peak in-memory cost is bounded by the consumer's chunk size,
 * not the source dimensions.
 */
export const RAW_RGBA_HEADER_BYTES = 8

async function readHeader(filePath: string): Promise<{ width: number; height: number }> {
  const fh = await open(filePath, 'r')
  try {
    const header = Buffer.alloc(RAW_RGBA_HEADER_BYTES)
    const { bytesRead } = await fh.read(header, 0, RAW_RGBA_HEADER_BYTES, 0)
    if (bytesRead < RAW_RGBA_HEADER_BYTES) {
      throw new Error(
        `Invalid .rgba file at ${filePath}: header truncated (${bytesRead}/${RAW_RGBA_HEADER_BYTES} bytes)`
      )
    }
    const width = header.readUInt32LE(0)
    const height = header.readUInt32LE(4)
    if (width <= 0 || height <= 0) {
      throw new Error(`Invalid .rgba dimensions at ${filePath}: ${width}×${height}`)
    }
    return { width, height }
  } finally {
    await fh.close()
  }
}

export class RawRgbaSourceService implements SourceRenderer {
  async getPageDimensions(filePath: string): Promise<{ width: number; height: number }> {
    return readHeader(filePath)
  }

  /**
   * Validates the file matches its header, then yields a single disk-backed
   * page to the caller. `scale` is ignored — raw RGBA has no scale concept.
   */
  async renderAllPagesRaw(
    filePath: string,
    _scale: number,
    onPage: (pageNumber: number, page: SourcePage, pageCount: number) => Promise<void>
  ): Promise<number> {
    const { width, height } = await readHeader(filePath)

    const expectedSize = RAW_RGBA_HEADER_BYTES + width * height * 4
    const { size } = await stat(filePath)
    if (size !== expectedSize) {
      throw new Error(
        `Corrupt .rgba file at ${filePath}: size=${size} bytes, expected ${expectedSize} ` +
          `(header ${width}×${height}×4 + ${RAW_RGBA_HEADER_BYTES}B)`
      )
    }

    const page: DiskBackedPageResult = {
      kind: 'disk',
      filePath,
      headerOffset: RAW_RGBA_HEADER_BYTES,
      width,
      height,
      channels: 4
    }
    await onPage(1, page, 1)
    return 1
  }
}
