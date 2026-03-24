/**
 * Common interface for rendering source files (PDF, images, etc.) into raw RGBA buffers.
 * Implement this interface to add support for new input formats.
 */
export type RawPageResult = {
  buffer: Buffer
  width: number
  height: number
}

export interface SourceRenderer {
  getPageDimensions(filePath: string): Promise<{ width: number; height: number }>

  renderAllPagesRaw(
    filePath: string,
    scale: number,
    onPage: (pageNumber: number, raw: RawPageResult, pageCount: number) => Promise<void>
  ): Promise<number>
}
