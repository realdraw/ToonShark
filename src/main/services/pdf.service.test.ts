import {afterEach, beforeEach, describe, expect, it} from 'vitest'
import {PdfService} from './pdf.service'
import {mkdirSync, rmSync, writeFileSync} from 'fs'
import {join} from 'path'
import {tmpdir} from 'os'

// Build a minimal but spec-correct PDF with a red rectangle
function createTestPdf(pageCount = 1): Buffer {
  const streamContent = '1 0 0 rg\n10 10 180 280 re f\n'
  const streamLength = Buffer.byteLength(streamContent)
  const parts: string[] = []
  const offsets: number[] = []
  let pos = 0
  let objNum = 0

  function add(s: string) {
    parts.push(s)
    pos += Buffer.byteLength(s)
  }

  add('%PDF-1.4\n')

  // Catalog
  objNum++
  offsets[objNum] = pos
  add(`${objNum} 0 obj\n<< /Type /Catalog /Pages ${objNum + 1} 0 R >>\nendobj\n`)

  // Pages
  const pagesObjNum = ++objNum
  const pageObjNums: number[] = []
  for (let i = 0; i < pageCount; i++) {
    pageObjNums.push(pagesObjNum + 1 + i * 2)
  }
  const kids = pageObjNums.map((n) => `${n} 0 R`).join(' ')
  offsets[pagesObjNum] = pos
  add(`${pagesObjNum} 0 obj\n<< /Type /Pages /Kids [${kids}] /Count ${pageCount} >>\nendobj\n`)

  // Pages and their content streams
  for (let i = 0; i < pageCount; i++) {
    const pageObj = ++objNum
    const streamObj = ++objNum

    offsets[pageObj] = pos
    add(`${pageObj} 0 obj\n<< /Type /Page /Parent ${pagesObjNum} 0 R /MediaBox [0 0 200 300]\n   /Contents ${streamObj} 0 R /Resources << >> >>\nendobj\n`)

    offsets[streamObj] = pos
    add(`${streamObj} 0 obj\n<< /Length ${streamLength} >>\nstream\n${streamContent}endstream\nendobj\n`)
  }

  const totalObjs = objNum + 1
  const xrefOffset = pos
  add(`xref\n0 ${totalObjs}\n`)
  add('0000000000 65535 f \n')
  for (let i = 1; i < totalObjs; i++) {
    add(String(offsets[i]).padStart(10, '0') + ' 00000 n \n')
  }
  add(`trailer\n<< /Size ${totalObjs} /Root 1 0 R >>\n`)
  add(`startxref\n${xrefOffset}\n%%EOF\n`)

  return Buffer.from(parts.join(''))
}

describe('PdfService', () => {
  let service: PdfService
  let testDir: string

  beforeEach(() => {
    testDir = join(tmpdir(), `pdf_test_${Date.now()}`)
    mkdirSync(testDir, { recursive: true })
    service = new PdfService()
  })

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true })
  })

  describe('getPageDimensions', () => {
    it('should throw for non-existent file', async () => {
      await expect(service.getPageDimensions('/nonexistent.pdf')).rejects.toThrow()
    })

    it('should return correct dimensions for first page', async () => {
      // MediaBox is [0 0 200 300]
      const pdfPath = join(testDir, 'dims.pdf')
      writeFileSync(pdfPath, createTestPdf(1))

      const dims = await service.getPageDimensions(pdfPath)
      expect(dims.width).toBe(200)
      expect(dims.height).toBe(300)
    })

    it('should return dimensions for multi-page PDF (first page)', async () => {
      const pdfPath = join(testDir, 'dims_multi.pdf')
      writeFileSync(pdfPath, createTestPdf(3))

      const dims = await service.getPageDimensions(pdfPath)
      expect(dims.width).toBe(200)
      expect(dims.height).toBe(300)
    })

    it('should throw for corrupted file', async () => {
      const pdfPath = join(testDir, 'corrupt.pdf')
      writeFileSync(pdfPath, 'not a PDF')

      await expect(service.getPageDimensions(pdfPath)).rejects.toThrow()
    })
  })

  describe('renderAllPagesRaw', () => {
    it('should render all pages of a single-page PDF', async () => {
      const pdfPath = join(testDir, 'all_single.pdf')
      writeFileSync(pdfPath, createTestPdf(1))

      const results: { width: number; height: number }[] = []
      const count = await service.renderAllPagesRaw(pdfPath, 1.0, async (_page, raw) => {
        results.push({ width: raw.width, height: raw.height })
      })

      expect(count).toBe(1)
      expect(results).toHaveLength(1)
      expect(results[0].width).toBeGreaterThan(0)
      expect(results[0].height).toBeGreaterThan(0)
    })

    it('should render all pages of a multi-page PDF', async () => {
      const pdfPath = join(testDir, 'all_multi.pdf')
      writeFileSync(pdfPath, createTestPdf(3))

      const results: { pageNumber: number; width: number; height: number }[] = []
      const count = await service.renderAllPagesRaw(pdfPath, 1.0, async (pageNumber, raw) => {
        results.push({ pageNumber, width: raw.width, height: raw.height })
      })

      expect(count).toBe(3)
      expect(results).toHaveLength(3)
      for (let i = 0; i < results.length; i++) {
        expect(results[i].pageNumber).toBe(i + 1)
        expect(results[i].width).toBeGreaterThan(0)
        expect(results[i].height).toBeGreaterThan(0)
      }
    })

    it('should throw for non-existent file', async () => {
      await expect(
        service.renderAllPagesRaw('/nonexistent.pdf', 1.0, async () => {})
      ).rejects.toThrow()
    })
  })
})
