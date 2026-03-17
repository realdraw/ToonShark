import {afterEach, beforeEach, describe, expect, it} from 'vitest'
import {PdfService} from './pdf.service'
import {mkdirSync, rmSync, writeFileSync} from 'fs'
import {join} from 'path'
import {tmpdir} from 'os'


// Build a minimal but spec-correct PDF with a red rectangle
function createTestPdf(): Buffer {
  const streamContent = '1 0 0 rg\n10 10 180 280 re f\n'
  const streamLength = Buffer.byteLength(streamContent)

  // Build objects and track byte offsets for xref
  const parts: string[] = []
  const offsets: number[] = []
  let pos = 0

  function add(s: string) {
    parts.push(s)
    pos += Buffer.byteLength(s)
  }

  add('%PDF-1.4\n')

  offsets[1] = pos
  add('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n')

  offsets[2] = pos
  add('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n')

  offsets[3] = pos
  add('3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 300]\n   /Contents 4 0 R /Resources << >> >>\nendobj\n')

  offsets[4] = pos
  add(`4 0 obj\n<< /Length ${streamLength} >>\nstream\n${streamContent}endstream\nendobj\n`)

  const xrefOffset = pos
  add('xref\n0 5\n')
  add('0000000000 65535 f \n')
  for (let i = 1; i <= 4; i++) {
    add(String(offsets[i]).padStart(10, '0') + ' 00000 n \n')
  }
  add('trailer\n<< /Size 5 /Root 1 0 R >>\n')
  add(`startxref\n${xrefOffset}\n%%EOF\n`)

  return Buffer.from(parts.join(''))
}

describe('PdfService integration', () => {
  let service: PdfService
  let testDir: string
  let testPdfPath: string

  beforeEach(() => {
    testDir = join(tmpdir(), `pdf_int_test_${Date.now()}`)
    mkdirSync(testDir, { recursive: true })
    service = new PdfService()

    testPdfPath = join(testDir, 'test.pdf')
    writeFileSync(testPdfPath, createTestPdf())
  })

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true })
  })

  it('should render a page that is not all white', async () => {
    const results: { width: number; height: number; buffer: Buffer }[] = []
    await service.renderAllPagesRaw(testPdfPath, 1.0, async (_page, raw) => {
      results.push({ width: raw.width, height: raw.height, buffer: raw.buffer })
    })

    expect(results).toHaveLength(1)
    expect(results[0].width).toBeGreaterThan(0)
    expect(results[0].height).toBeGreaterThan(0)

    // Check that the image has non-white pixels (red rectangle) from raw RGBA buffer
    const { buffer, width, height } = results[0]
    let nonWhitePixels = 0
    for (let i = 0; i < width * height; i++) {
      const r = buffer[i * 4]
      const g = buffer[i * 4 + 1]
      const b = buffer[i * 4 + 2]
      if (r < 250 || g < 250 || b < 250) {
        nonWhitePixels++
      }
    }
    expect(nonWhitePixels).toBeGreaterThan(0)
  })
})
