import {isPdfFile} from '@shared/constants/supported-formats'
import type {SourceRenderer} from './source-renderer'

/**
 * Facade that delegates to the correct SourceRenderer based on file extension.
 * To add a new format, register a new renderer via addRenderer() or
 * add a new SourceRenderer implementation and wire it in the constructor.
 */
export class SourceService implements SourceRenderer {
  private renderers: { test: (filePath: string) => boolean; renderer: SourceRenderer }[] = []
  private fallback: SourceRenderer

  constructor(pdfRenderer: SourceRenderer, imageRenderer: SourceRenderer) {
    this.renderers.push({ test: isPdfFile, renderer: pdfRenderer })
    this.fallback = imageRenderer
  }

  /** Register additional renderers for new formats */
  addRenderer(test: (filePath: string) => boolean, renderer: SourceRenderer): void {
    this.renderers.push({ test, renderer })
  }

  private getRenderer(filePath: string): SourceRenderer {
    for (const { test, renderer } of this.renderers) {
      if (test(filePath)) return renderer
    }
    return this.fallback
  }

  getPageDimensions(filePath: string) {
    return this.getRenderer(filePath).getPageDimensions(filePath)
  }

  renderAllPagesRaw(
    filePath: string,
    scale: number,
    onPage: Parameters<SourceRenderer['renderAllPagesRaw']>[2]
  ) {
    return this.getRenderer(filePath).renderAllPagesRaw(filePath, scale, onPage)
  }
}
