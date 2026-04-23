import {afterEach, beforeEach, describe, expect, it} from 'vitest'
import {mkdirSync, rmSync, writeFileSync} from 'fs'
import {writeFile} from 'fs/promises'
import {join} from 'path'
import {tmpdir} from 'os'
import {RAW_RGBA_HEADER_BYTES, RawRgbaSourceService} from './raw-rgba-source.service'
import type {DiskBackedPageResult} from './source-renderer'

function buildRgbaFile(width: number, height: number, fillByte = 0xff): Buffer {
  const payload = width * height * 4
  const out = Buffer.alloc(RAW_RGBA_HEADER_BYTES + payload, fillByte)
  out.writeUInt32LE(width, 0)
  out.writeUInt32LE(height, 4)
  return out
}

describe('RawRgbaSourceService', () => {
  let testDir: string
  let service: RawRgbaSourceService

  beforeEach(() => {
    testDir = join(tmpdir(), `raw_rgba_src_test_${Date.now()}_${Math.random().toString(36).slice(2)}`)
    mkdirSync(testDir, { recursive: true })
    service = new RawRgbaSourceService()
  })

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true })
  })

  describe('getPageDimensions', () => {
    it('reads width/height from the 8-byte header', async () => {
      const filePath = join(testDir, 'case1.rgba')
      writeFileSync(filePath, buildRgbaFile(1500, 26996))

      const dims = await service.getPageDimensions(filePath)
      expect(dims).toEqual({ width: 1500, height: 26996 })
    })

    it('throws when the header is truncated', async () => {
      const filePath = join(testDir, 'truncated.rgba')
      // Write only 4 bytes — half a header.
      writeFileSync(filePath, Buffer.from([0x10, 0x00, 0x00, 0x00]))

      await expect(service.getPageDimensions(filePath)).rejects.toThrow(/header truncated/)
    })

    it('throws for zero dimensions', async () => {
      const filePath = join(testDir, 'zero.rgba')
      const header = Buffer.alloc(RAW_RGBA_HEADER_BYTES)
      // width=0, height=0
      writeFileSync(filePath, header)

      await expect(service.getPageDimensions(filePath)).rejects.toThrow(/Invalid .rgba dimensions/)
    })
  })

  describe('renderAllPagesRaw', () => {
    it('yields a single disk-backed page with correct shape', async () => {
      const filePath = join(testDir, 'render.rgba')
      writeFileSync(filePath, buildRgbaFile(10, 20))

      let received: { page: DiskBackedPageResult; pageNumber: number; pageCount: number } | null = null
      const count = await service.renderAllPagesRaw(filePath, 1, async (pageNumber, page, pageCount) => {
        received = { page: page as DiskBackedPageResult, pageNumber, pageCount }
      })

      expect(count).toBe(1)
      expect(received).not.toBeNull()
      const rx = received!
      expect(rx.pageNumber).toBe(1)
      expect(rx.pageCount).toBe(1)
      expect(rx.page.kind).toBe('disk')
      expect(rx.page.filePath).toBe(filePath)
      expect(rx.page.headerOffset).toBe(RAW_RGBA_HEADER_BYTES)
      expect(rx.page.width).toBe(10)
      expect(rx.page.height).toBe(20)
      expect(rx.page.channels).toBe(4)
    })

    it('rejects when file size disagrees with the header', async () => {
      const filePath = join(testDir, 'corrupt.rgba')
      // Header claims 100×100, but we only write the header + 10 bytes of payload.
      const header = Buffer.alloc(RAW_RGBA_HEADER_BYTES + 10)
      header.writeUInt32LE(100, 0)
      header.writeUInt32LE(100, 4)
      await writeFile(filePath, header)

      await expect(
        service.renderAllPagesRaw(filePath, 1, async () => {
          /* should not be called */
        })
      ).rejects.toThrow(/Corrupt .rgba file/)
    })

    it('ignores the scale argument — raw RGBA has no scale concept', async () => {
      const filePath = join(testDir, 'scale.rgba')
      writeFileSync(filePath, buildRgbaFile(4, 4))

      let received: DiskBackedPageResult | null = null
      await service.renderAllPagesRaw(filePath, 99.5, async (_pn, page) => {
        received = page as DiskBackedPageResult
      })
      expect(received).not.toBeNull()
      expect(received!.width).toBe(4)
      expect(received!.height).toBe(4)
    })
  })
})
