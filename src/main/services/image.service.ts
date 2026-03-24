import sharp from 'sharp'
import type {RawPageResult, SourceRenderer} from './source-renderer'

/**
 * SourceRenderer implementation for raster images (JPG, PNG, etc.).
 * Each image is treated as a single page.
 */
export class ImageService implements SourceRenderer {
  async getPageDimensions(filePath: string): Promise<{ width: number; height: number }> {
    const metadata = await sharp(filePath).metadata()
    return { width: metadata.width ?? 0, height: metadata.height ?? 0 }
  }

  async renderAllPagesRaw(
    filePath: string,
    _scale: number,
    onPage: (pageNumber: number, raw: RawPageResult, pageCount: number) => Promise<void>
  ): Promise<number> {
    const { data, info } = await sharp(filePath)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })

    const raw: RawPageResult = {
      buffer: Buffer.from(data),
      width: info.width,
      height: info.height
    }

    await onPage(1, raw, 1)
    return 1
  }
}
