import {readFileSync} from 'fs'
import {createCanvas} from '@napi-rs/canvas'

// pdfjs-dist v5 legacy build for Node.js
// Uses built-in NodeCanvasFactory which requires @napi-rs/canvas
let pdfjsPromise: Promise<typeof import('pdfjs-dist')> | null = null

function getPdfjs(): Promise<typeof import('pdfjs-dist')> {
  if (!pdfjsPromise) {
    pdfjsPromise = import(
      /* webpackIgnore: true */ 'pdfjs-dist/legacy/build/pdf.mjs'
    ) as Promise<typeof import('pdfjs-dist')>
  }
  return pdfjsPromise
}

async function openDoc(pdfPath: string) {
  const pdfjsLib = await getPdfjs()
  const data = new Uint8Array(readFileSync(pdfPath))
  return pdfjsLib.getDocument({ data, verbosity: 0 }).promise
}

export type RawPageResult = {
  buffer: Buffer
  width: number
  height: number
}

async function renderPageRaw(
  page: import('pdfjs-dist').PDFPageProxy,
  scale: number
): Promise<RawPageResult> {
  const viewport = page.getViewport({ scale })
  const width = Math.floor(viewport.width)
  const height = Math.floor(viewport.height)
  const canvas = createCanvas(width, height)
  const context = canvas.getContext('2d')

  await page.render({
    canvas: canvas as any,
    canvasContext: context as any,
    viewport
  }).promise

  page.cleanup()

  // Extract raw RGBA pixels directly — skip PNG encode/decode round-trip
  const imageData = context.getImageData(0, 0, width, height)
  const buffer = Buffer.from(imageData.data.buffer, imageData.data.byteOffset, imageData.data.byteLength)

  return { buffer, width, height }
}

export class PdfService {
  async getPageDimensions(pdfPath: string): Promise<{ width: number; height: number }> {
    const doc = await openDoc(pdfPath)
    try {
      const page = await doc.getPage(1)
      const viewport = page.getViewport({ scale: 1.0 })
      return { width: Math.floor(viewport.width), height: Math.floor(viewport.height) }
    } finally {
      await doc.destroy()
    }
  }

  async renderAllPagesRaw(
    pdfPath: string,
    scale: number,
    onPage: (pageNumber: number, raw: RawPageResult, pageCount: number) => Promise<void>
  ): Promise<number> {
    const doc = await openDoc(pdfPath)
    try {
      const pageCount = doc.numPages
      for (let i = 1; i <= pageCount; i++) {
        const page = await doc.getPage(i)
        const raw = await renderPageRaw(page, scale)
        await onPage(i, raw, pageCount)
      }
      return pageCount
    } finally {
      await doc.destroy()
    }
  }
}
