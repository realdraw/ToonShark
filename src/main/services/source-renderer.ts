/**
 * Common interface for rendering source files (PDF, images, etc.) into raw RGBA buffers.
 * Implement this interface to add support for new input formats.
 *
 * Two page shapes are supported:
 *   - RawPageResult       — in-memory Buffer (legacy path, used by PDF/PSD/image renderers)
 *   - DiskBackedPageResult — file-backed raw RGBA (used by RawRgbaSourceService for
 *                            merged sources that would OOM if decoded into a Buffer)
 *
 * Downstream consumers (SliceService, slice-pipeline) must handle both shapes.
 */
export type RawPageResult = {
  buffer: Buffer
  width: number
  height: number
}

/**
 * Disk-backed raw RGBA page. The file at `filePath` contains raw RGBA bytes
 * starting at `headerOffset`; the consumer must stream only the ranges it
 * needs instead of loading the whole file into memory.
 */
export type DiskBackedPageResult = {
  kind: 'disk'
  filePath: string
  headerOffset: number
  width: number
  height: number
  channels: 4
}

export type SourcePage = RawPageResult | DiskBackedPageResult

export function isDiskBackedPage(page: SourcePage): page is DiskBackedPageResult {
  return (page as DiskBackedPageResult).kind === 'disk'
}

export interface SourceRenderer {
  getPageDimensions(filePath: string): Promise<{ width: number; height: number }>

  renderAllPagesRaw(
    filePath: string,
    scale: number,
    onPage: (pageNumber: number, page: SourcePage, pageCount: number) => Promise<void>
  ): Promise<number>
}
