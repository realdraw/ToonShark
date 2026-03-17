import {afterEach, beforeEach, describe, expect, it} from 'vitest'
import {SliceService} from './slice.service'
import sharp from 'sharp'
import {existsSync, mkdirSync, rmSync} from 'fs'
import {join} from 'path'
import {tmpdir} from 'os'

// Helper: create a solid color image buffer
async function createImage(width: number, height: number, color = { r: 255, g: 255, b: 255 }): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: color }
  }).png().toBuffer()
}

// Helper: create an image with colored and white bands
async function createBandedImage(width: number, bands: { height: number; white: boolean }[]): Promise<Buffer> {
  const totalHeight = bands.reduce((sum, b) => sum + b.height, 0)
  const rawData = Buffer.alloc(width * totalHeight * 3)
  let y = 0
  for (const band of bands) {
    const val = band.white ? 255 : 0
    for (let row = 0; row < band.height; row++) {
      for (let x = 0; x < width; x++) {
        const offset = ((y + row) * width + x) * 3
        rawData[offset] = val
        rawData[offset + 1] = val
        rawData[offset + 2] = val
      }
    }
    y += band.height
  }
  return sharp(rawData, { raw: { width, height: totalHeight, channels: 3 } }).png().toBuffer()
}

describe('SliceService', () => {
  let service: SliceService
  let testDir: string

  beforeEach(() => {
    testDir = join(tmpdir(), `slice_test_${Date.now()}`)
    mkdirSync(testDir, { recursive: true })
    service = new SliceService()
  })

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true })
  })

  // ──────────────────────────────────────────
  // computeFixedSliceRanges
  // ──────────────────────────────────────────
  describe('computeFixedSliceRanges', () => {
    it('should split image height evenly', () => {
      const ranges = service.computeFixedSliceRanges(3000, 1000, 0)
      expect(ranges).toEqual([
        { y: 0, height: 1000 },
        { y: 1000, height: 1000 },
        { y: 2000, height: 1000 }
      ])
    })

    it('should handle remainder slice', () => {
      const ranges = service.computeFixedSliceRanges(2500, 1000, 0)
      expect(ranges).toEqual([
        { y: 0, height: 1000 },
        { y: 1000, height: 1000 },
        { y: 2000, height: 500 }
      ])
    })

    it('should apply start offset', () => {
      const ranges = service.computeFixedSliceRanges(3000, 1000, 200)
      expect(ranges).toEqual([
        { y: 200, height: 1000 },
        { y: 1200, height: 1000 },
        { y: 2200, height: 800 }
      ])
    })

    it('should handle offset larger than image', () => {
      const ranges = service.computeFixedSliceRanges(500, 1000, 600)
      expect(ranges).toEqual([])
    })

    it('should handle single slice', () => {
      const ranges = service.computeFixedSliceRanges(500, 1000, 0)
      expect(ranges).toEqual([{ y: 0, height: 500 }])
    })

    it('should handle offset equal to image height', () => {
      const ranges = service.computeFixedSliceRanges(1000, 500, 1000)
      expect(ranges).toEqual([])
    })

    it('should handle zero height image', () => {
      const ranges = service.computeFixedSliceRanges(0, 500, 0)
      expect(ranges).toEqual([])
    })

    it('should handle very small slice height (1px)', () => {
      const ranges = service.computeFixedSliceRanges(3, 1, 0)
      expect(ranges).toEqual([
        { y: 0, height: 1 },
        { y: 1, height: 1 },
        { y: 2, height: 1 }
      ])
    })

    it('should produce single slice when sliceHeight >= imageHeight', () => {
      const ranges = service.computeFixedSliceRanges(500, 2000, 0)
      expect(ranges).toEqual([{ y: 0, height: 500 }])
    })

    it('should handle large image with small slices', () => {
      const ranges = service.computeFixedSliceRanges(10000, 100, 0)
      expect(ranges).toHaveLength(100)
      expect(ranges[0]).toEqual({ y: 0, height: 100 })
      expect(ranges[99]).toEqual({ y: 9900, height: 100 })
    })
  })

  // ──────────────────────────────────────────
  // analyzeWhiteRows
  // ──────────────────────────────────────────
  describe('analyzeWhiteRows', () => {
    it('should detect all-white rows', async () => {
      const buffer = await sharp({
        create: { width: 720, height: 100, channels: 3, background: { r: 255, g: 255, b: 255 } }
      }).raw().toBuffer()

      const isWhite = service.analyzeWhiteRows(buffer, 720, 100, 245, 3)
      expect(isWhite.length).toBe(100)
      expect(isWhite.every((v) => v)).toBe(true)
    })

    it('should detect non-white rows', () => {
      const width = 100
      const height = 20
      const rawBuffer = Buffer.alloc(width * height * 3)
      for (let y = 0; y < 10; y++) {
        for (let x = 0; x < width; x++) {
          const offset = (y * width + x) * 3
          rawBuffer[offset] = 255
          rawBuffer[offset + 1] = 255
          rawBuffer[offset + 2] = 255
        }
      }

      const isWhite = service.analyzeWhiteRows(rawBuffer, width, height, 245, 3)
      for (let y = 0; y < 10; y++) expect(isWhite[y]).toBe(true)
      for (let y = 10; y < 20; y++) expect(isWhite[y]).toBe(false)
    })

    it('should respect threshold — near-white detected as white', () => {
      const width = 10
      const height = 2
      const rawBuffer = Buffer.alloc(width * height * 3)
      for (let x = 0; x < width; x++) {
        const offset = x * 3
        rawBuffer[offset] = 250; rawBuffer[offset + 1] = 250; rawBuffer[offset + 2] = 250
      }
      for (let x = 0; x < width; x++) {
        const offset = (width + x) * 3
        rawBuffer[offset] = 240; rawBuffer[offset + 1] = 240; rawBuffer[offset + 2] = 240
      }

      const isWhite = service.analyzeWhiteRows(rawBuffer, width, height, 245, 3)
      expect(isWhite[0]).toBe(true)
      expect(isWhite[1]).toBe(false)
    })

    it('should mark row as non-white if even one pixel is below threshold', () => {
      const width = 100
      const rawBuffer = Buffer.alloc(width * 3, 255)
      rawBuffer[50 * 3] = 100
      const isWhite = service.analyzeWhiteRows(rawBuffer, width, 1, 245, 3)
      expect(isWhite[0]).toBe(false)
    })

    it('should handle threshold of 255 (pure white only)', () => {
      const width = 10
      const rawBuffer = Buffer.alloc(width * 2 * 3, 255)
      rawBuffer[width * 3] = 254
      const isWhite = service.analyzeWhiteRows(rawBuffer, width, 2, 255, 3)
      expect(isWhite[0]).toBe(true)
      expect(isWhite[1]).toBe(false)
    })

    it('should handle threshold of 0 (all pixels are white)', () => {
      const rawBuffer = Buffer.alloc(10 * 3, 0) // all black
      const isWhite = service.analyzeWhiteRows(rawBuffer, 10, 1, 0, 3)
      expect(isWhite[0]).toBe(true) // 0 >= 0 is true
    })

    it('should handle 1x1 image', () => {
      const rawBuffer = Buffer.from([200, 200, 200])
      const isWhite = service.analyzeWhiteRows(rawBuffer, 1, 1, 190, 3)
      expect(isWhite[0]).toBe(true)
    })
  })

  // ──────────────────────────────────────────
  // computeAutoSliceRanges
  // ──────────────────────────────────────────
  describe('computeAutoSliceRanges', () => {
    it('should find cut points at white gaps', () => {
      const isWhite = new Array(200).fill(false)
      for (let i = 50; i < 80; i++) isWhite[i] = true
      for (let i = 130; i < 160; i++) isWhite[i] = true

      const ranges = service.computeAutoSliceRanges(isWhite, {
        minWhiteRun: 10, minSliceHeight: 0, cutPosition: 'middle'
      })

      expect(ranges.length).toBe(3)
      expect(ranges[0]).toEqual({ y: 0, height: 65 })
      expect(ranges[1]).toEqual({ y: 65, height: 80 })
      expect(ranges[2]).toEqual({ y: 145, height: 55 })
    })

    it('should cut before-color when configured', () => {
      const isWhite = new Array(100).fill(false)
      for (let i = 40; i < 60; i++) isWhite[i] = true

      const ranges = service.computeAutoSliceRanges(isWhite, {
        minWhiteRun: 10, minSliceHeight: 0, cutPosition: 'before-color'
      })

      expect(ranges.length).toBe(2)
      expect(ranges[0]).toEqual({ y: 0, height: 60 })
      expect(ranges[1]).toEqual({ y: 60, height: 40 })
    })

    it('should cut even if it creates small slices (no minSliceHeight filter)', () => {
      const isWhite = new Array(100).fill(false)
      for (let i = 5; i < 25; i++) isWhite[i] = true

      const ranges = service.computeAutoSliceRanges(isWhite, {
        minWhiteRun: 10, minSliceHeight: 0, cutPosition: 'middle'
      })
      // Should cut at middle of 5..25 = 15, even though first slice is only 15px
      expect(ranges.length).toBe(2)
      expect(ranges[0]).toEqual({ y: 0, height: 15 })
      expect(ranges[1]).toEqual({ y: 15, height: 85 })
    })

    it('should cut near end of image (no minSliceHeight filter)', () => {
      const isWhite = new Array(100).fill(false)
      for (let i = 85; i < 100; i++) isWhite[i] = true

      const ranges = service.computeAutoSliceRanges(isWhite, {
        minWhiteRun: 10, minSliceHeight: 0, cutPosition: 'middle'
      })
      // Should cut at middle of 85..100 = 92
      expect(ranges.length).toBe(2)
      expect(ranges[0]).toEqual({ y: 0, height: 92 })
      expect(ranges[1]).toEqual({ y: 92, height: 8 })
    })

    it('should return single range if no white gaps found', () => {
      const isWhite = new Array(100).fill(false)
      const ranges = service.computeAutoSliceRanges(isWhite, {
        minWhiteRun: 10, minSliceHeight: 0, cutPosition: 'middle'
      })
      expect(ranges).toEqual([{ y: 0, height: 100 }])
    })

    it('should skip white runs shorter than minWhiteRun', () => {
      const isWhite = new Array(100).fill(false)
      for (let i = 45; i < 50; i++) isWhite[i] = true

      const ranges = service.computeAutoSliceRanges(isWhite, {
        minWhiteRun: 10, minSliceHeight: 0, cutPosition: 'middle'
      })
      expect(ranges).toEqual([{ y: 0, height: 100 }])
    })

    it('should handle leading white rows', () => {
      const isWhite = new Array(100).fill(false)
      for (let i = 0; i < 30; i++) isWhite[i] = true

      const ranges = service.computeAutoSliceRanges(isWhite, {
        minWhiteRun: 10, minSliceHeight: 0, cutPosition: 'middle'
      })
      expect(ranges.length).toBe(2)
      expect(ranges[0]).toEqual({ y: 0, height: 15 })
      expect(ranges[1]).toEqual({ y: 15, height: 85 })
    })

    it('should handle trailing white rows', () => {
      const isWhite = new Array(100).fill(false)
      for (let i = 70; i < 100; i++) isWhite[i] = true

      const ranges = service.computeAutoSliceRanges(isWhite, {
        minWhiteRun: 10, minSliceHeight: 0, cutPosition: 'middle'
      })
      expect(ranges.length).toBe(2)
      expect(ranges[0]).toEqual({ y: 0, height: 85 })
      expect(ranges[1]).toEqual({ y: 85, height: 15 })
    })

    it('should handle multiple white runs with some too short', () => {
      const isWhite = new Array(100).fill(false)
      for (let i = 40; i < 60; i++) isWhite[i] = true
      for (let i = 80; i < 85; i++) isWhite[i] = true // too short

      const ranges = service.computeAutoSliceRanges(isWhite, {
        minWhiteRun: 10, minSliceHeight: 0, cutPosition: 'middle'
      })
      expect(ranges.length).toBe(2)
      expect(ranges[0]).toEqual({ y: 0, height: 50 })
      expect(ranges[1]).toEqual({ y: 50, height: 50 })
    })

    it('should handle entire image white', () => {
      const isWhite = new Array(100).fill(true)
      const ranges = service.computeAutoSliceRanges(isWhite, {
        minWhiteRun: 10, minSliceHeight: 0, cutPosition: 'middle'
      })
      expect(ranges.length).toBe(2)
    })

    // minSliceHeight merge tests
    it('should merge small first slice with next when minSliceHeight is set', () => {
      // 200px image: white run at 0-20, then color 20-200
      // Cut at middle=10 → slices: [0,10) = 10px, [10,200) = 190px
      // With minSliceHeight=50 → first slice (10px) merges with next → single [0,200)
      const isWhite = new Array(200).fill(false)
      for (let i = 0; i < 20; i++) isWhite[i] = true

      const ranges = service.computeAutoSliceRanges(isWhite, {
        minWhiteRun: 10, minSliceHeight: 50, cutPosition: 'middle'
      })
      expect(ranges).toEqual([{ y: 0, height: 200 }])
    })

    it('should merge small last slice with previous when minSliceHeight is set', () => {
      // 100px image: white run at 85-100
      // Cut at middle=92 → slices: [0,92) = 92px, [92,100) = 8px
      // With minSliceHeight=50 → last slice (8px) merges with previous → single [0,100)
      const isWhite = new Array(100).fill(false)
      for (let i = 85; i < 100; i++) isWhite[i] = true

      const ranges = service.computeAutoSliceRanges(isWhite, {
        minWhiteRun: 10, minSliceHeight: 50, cutPosition: 'middle'
      })
      expect(ranges).toEqual([{ y: 0, height: 100 }])
    })

    it('should merge small middle slice with previous', () => {
      // 300px: color[0-80], white[80-100], color[100-110], white[110-130], color[130-300]
      // Cuts at 90 and 120 → slices: [0,90)=90px, [90,120)=30px, [120,300)=180px
      // With minSliceHeight=50 → middle slice (30px) merges with previous → [0,120)=120px, [120,300)=180px
      const isWhite = new Array(300).fill(false)
      for (let i = 80; i < 100; i++) isWhite[i] = true
      for (let i = 110; i < 130; i++) isWhite[i] = true

      const ranges = service.computeAutoSliceRanges(isWhite, {
        minWhiteRun: 10, minSliceHeight: 50, cutPosition: 'middle'
      })
      expect(ranges.length).toBe(2)
      expect(ranges[0]).toEqual({ y: 0, height: 120 })
      expect(ranges[1]).toEqual({ y: 120, height: 180 })
    })

    it('should not merge when minSliceHeight is 0', () => {
      const isWhite = new Array(100).fill(false)
      for (let i = 5; i < 25; i++) isWhite[i] = true

      const ranges = service.computeAutoSliceRanges(isWhite, {
        minWhiteRun: 10, minSliceHeight: 0, cutPosition: 'middle'
      })
      expect(ranges.length).toBe(2)
      expect(ranges[0]).toEqual({ y: 0, height: 15 })
      expect(ranges[1]).toEqual({ y: 15, height: 85 })
    })

    it('should keep all slices when all meet minSliceHeight', () => {
      // 200px: color[0-50], white[50-80], color[80-200]
      // Cut at 65 → slices: [0,65)=65px, [65,200)=135px
      // With minSliceHeight=50 → both meet → no merge
      const isWhite = new Array(200).fill(false)
      for (let i = 50; i < 80; i++) isWhite[i] = true

      const ranges = service.computeAutoSliceRanges(isWhite, {
        minWhiteRun: 10, minSliceHeight: 50, cutPosition: 'middle'
      })
      expect(ranges.length).toBe(2)
      expect(ranges[0]).toEqual({ y: 0, height: 65 })
      expect(ranges[1]).toEqual({ y: 65, height: 135 })
    })
  })

  // ──────────────────────────────────────────
  // fixedSlice — integration
  // ──────────────────────────────────────────
  describe('fixedSlice', () => {
    it('should create correct number of sliced images', async () => {
      const inputBuffer = await createImage(720, 3000)

      const results = await service.fixedSlice(inputBuffer, {
        sliceHeight: 1000, startOffset: 0,
        prefix: 'test', padding: 4, outputDir: testDir, startIndex: 1
      })

      expect(results).toHaveLength(3)
      expect(results[0].name).toBe('test_0001.png')
      expect(results[0].width).toBe(720)
      expect(results[0].height).toBe(1000)
      for (const r of results) expect(existsSync(r.path)).toBe(true)
    })

    it('should preserve original image width (no resize)', async () => {
      const inputBuffer = await createImage(1191, 3000) // typical PDF render width

      const results = await service.fixedSlice(inputBuffer, {
        sliceHeight: 1000, startOffset: 0,
        prefix: 'orig', padding: 4, outputDir: testDir, startIndex: 1
      })

      expect(results).toHaveLength(3)
      expect(results[0].width).toBe(1191)
      const meta = await sharp(results[0].path).metadata()
      expect(meta.width).toBe(1191)
    })

    it('should always output png', async () => {
      const inputBuffer = await createImage(720, 1000)

      const results = await service.fixedSlice(inputBuffer, {
        sliceHeight: 500, startOffset: 0,
        prefix: 'test', padding: 4, outputDir: testDir, startIndex: 1
      })

      expect(results).toHaveLength(2)
      expect(results[0].name).toBe('test_0001.png')
      const meta = await sharp(results[0].path).metadata()
      expect(meta.format).toBe('png')
    })

    it('should apply startOffset correctly', async () => {
      const inputBuffer = await createImage(720, 1000)

      const results = await service.fixedSlice(inputBuffer, {
        sliceHeight: 400, startOffset: 100,
        prefix: 'off', padding: 4, outputDir: testDir, startIndex: 1
      })

      expect(results).toHaveLength(3)
      expect(results[0].height).toBe(400)
      expect(results[1].height).toBe(400)
      expect(results[2].height).toBe(100)
    })

    it('should use startIndex correctly', async () => {
      const inputBuffer = await createImage(100, 300)

      const results = await service.fixedSlice(inputBuffer, {
        sliceHeight: 100, startOffset: 0,
        prefix: 'idx', padding: 4, outputDir: testDir, startIndex: 5
      })

      expect(results).toHaveLength(3)
      expect(results[0].name).toBe('idx_0005.png')
      expect(results[0].index).toBe(5)
      expect(results[2].name).toBe('idx_0007.png')
    })

    it('should verify actual output image dimensions', async () => {
      const inputBuffer = await createImage(720, 2500)

      const results = await service.fixedSlice(inputBuffer, {
        sliceHeight: 1000, startOffset: 0,
        prefix: 'dim', padding: 4, outputDir: testDir, startIndex: 1
      })

      for (const r of results) {
        const meta = await sharp(r.path).metadata()
        expect(meta.width).toBe(r.width)
        expect(meta.height).toBe(r.height)
      }
      expect(results[2].height).toBe(500)
    })

    it('should handle custom padding', async () => {
      const inputBuffer = await createImage(100, 200)

      const results = await service.fixedSlice(inputBuffer, {
        sliceHeight: 100, startOffset: 0,
        prefix: 'pad', padding: 2, outputDir: testDir, startIndex: 1
      })

      expect(results[0].name).toBe('pad_01.png')
      expect(results[1].name).toBe('pad_02.png')
    })

    it('should handle Korean prefix', async () => {
      const inputBuffer = await createImage(100, 200)

      const results = await service.fixedSlice(inputBuffer, {
        sliceHeight: 100, startOffset: 0,
        prefix: '웹툰_1화', padding: 4, outputDir: testDir, startIndex: 1
      })

      expect(results[0].name).toBe('웹툰_1화_0001.png')
      expect(existsSync(results[0].path)).toBe(true)
    })

    it('should handle large startIndex', async () => {
      const inputBuffer = await createImage(100, 100)

      const results = await service.fixedSlice(inputBuffer, {
        sliceHeight: 100, startOffset: 0,
        prefix: 'idx', padding: 4, outputDir: testDir, startIndex: 9999
      })

      expect(results[0].name).toBe('idx_9999.png')
      expect(results[0].index).toBe(9999)
    })
  })

  // ──────────────────────────────────────────
  // autoSlice — integration
  // ──────────────────────────────────────────
  describe('autoSlice', () => {
    it('should split image at white gap', async () => {
      const inputBuffer = await createBandedImage(100, [
        { height: 80, white: false },
        { height: 40, white: true },
        { height: 80, white: false }
      ])

      const results = await service.autoSlice(inputBuffer, {
        whiteThreshold: 245, minWhiteRun: 10, minSliceHeight: 0,
        cutPosition: 'middle',
        prefix: 'auto', padding: 4, outputDir: testDir, startIndex: 1
      })

      expect(results.length).toBe(2)
      expect(results[0].name).toBe('auto_0001.png')
      expect(results[1].name).toBe('auto_0002.png')
      for (const r of results) expect(existsSync(r.path)).toBe(true)
    })

    it('should preserve original image width (no resize)', async () => {
      const inputBuffer = await createBandedImage(1191, [
        { height: 500, white: false },
        { height: 100, white: true },
        { height: 500, white: false }
      ])

      const results = await service.autoSlice(inputBuffer, {
        whiteThreshold: 245, minWhiteRun: 10, minSliceHeight: 0,
        cutPosition: 'middle',
        prefix: 'orig', padding: 4, outputDir: testDir, startIndex: 1
      })

      expect(results.length).toBe(2)
      expect(results[0].width).toBe(1191)
      const meta = await sharp(results[0].path).metadata()
      expect(meta.width).toBe(1191)
    })

    it('should handle image with no white gaps', async () => {
      const inputBuffer = await createImage(100, 200, { r: 0, g: 0, b: 0 })

      const results = await service.autoSlice(inputBuffer, {
        whiteThreshold: 245, minWhiteRun: 10, minSliceHeight: 0,
        cutPosition: 'middle',
        prefix: 'nowhite', padding: 4, outputDir: testDir, startIndex: 1
      })

      expect(results.length).toBe(1)
      expect(results[0].height).toBe(200)
    })

    it('should handle all-white image', async () => {
      const inputBuffer = await createImage(100, 200)

      const results = await service.autoSlice(inputBuffer, {
        whiteThreshold: 245, minWhiteRun: 10, minSliceHeight: 0,
        cutPosition: 'middle',
        prefix: 'allwhite', padding: 4, outputDir: testDir, startIndex: 1
      })

      expect(results.length).toBe(2)
    })

    it('should handle multiple white gaps (3 panels)', async () => {
      const inputBuffer = await createBandedImage(100, [
        { height: 100, white: false },
        { height: 30, white: true },
        { height: 100, white: false },
        { height: 30, white: true },
        { height: 100, white: false }
      ])

      const results = await service.autoSlice(inputBuffer, {
        whiteThreshold: 245, minWhiteRun: 10, minSliceHeight: 0,
        cutPosition: 'middle',
        prefix: 'multi', padding: 4, outputDir: testDir, startIndex: 1
      })

      expect(results.length).toBe(3)
    })

    it('should always output png in auto mode', async () => {
      const inputBuffer = await createBandedImage(100, [
        { height: 80, white: false },
        { height: 40, white: true },
        { height: 80, white: false }
      ])

      const results = await service.autoSlice(inputBuffer, {
        whiteThreshold: 245, minWhiteRun: 10, minSliceHeight: 0,
        cutPosition: 'middle',
        prefix: 'ajpg', padding: 4, outputDir: testDir, startIndex: 1
      })

      expect(results[0].name).toBe('ajpg_0001.png')
      const meta = await sharp(results[0].path).metadata()
      expect(meta.format).toBe('png')
    })

    it('should produce different results for middle vs before-color', async () => {
      const inputBuffer = await createBandedImage(100, [
        { height: 80, white: false },
        { height: 40, white: true },
        { height: 80, white: false }
      ])

      const resultsMiddle = await service.autoSlice(inputBuffer, {
        whiteThreshold: 245, minWhiteRun: 10, minSliceHeight: 0,
        cutPosition: 'middle',
        prefix: 'mid', padding: 4, outputDir: testDir, startIndex: 1
      })

      const testDir2 = join(tmpdir(), `slice_test2_${Date.now()}`)
      mkdirSync(testDir2, { recursive: true })

      const resultsBeforeColor = await service.autoSlice(inputBuffer, {
        whiteThreshold: 245, minWhiteRun: 10, minSliceHeight: 0,
        cutPosition: 'before-color',
        prefix: 'bc', padding: 4, outputDir: testDir2, startIndex: 1
      })

      expect(resultsMiddle.length).toBe(2)
      expect(resultsBeforeColor.length).toBe(2)
      // before-color cuts later → first slice is taller
      expect(resultsBeforeColor[0].height).toBeGreaterThan(resultsMiddle[0].height)

      rmSync(testDir2, { recursive: true, force: true })
    })

    it('should verify actual file dimensions', async () => {
      const inputBuffer = await createBandedImage(720, [
        { height: 400, white: false },
        { height: 100, white: true },
        { height: 400, white: false }
      ])

      const results = await service.autoSlice(inputBuffer, {
        whiteThreshold: 245, minWhiteRun: 10, minSliceHeight: 0,
        cutPosition: 'middle',
        prefix: 'avdim', padding: 4, outputDir: testDir, startIndex: 1
      })

      for (const r of results) {
        const meta = await sharp(r.path).metadata()
        expect(meta.width).toBe(720)
        expect(meta.height).toBe(r.height)
      }
    })

    it('should merge small slices when minSliceHeight is set', async () => {
      // 200px image: 10px color, 20px white, 10px color, 20px white, 140px color
      // Without minSliceHeight: 3+ slices
      // With minSliceHeight=50: small slices get merged
      const inputBuffer = await createBandedImage(100, [
        { height: 10, white: false },
        { height: 20, white: true },
        { height: 10, white: false },
        { height: 20, white: true },
        { height: 140, white: false }
      ])

      const resultsNoMin = await service.autoSlice(inputBuffer, {
        whiteThreshold: 245, minWhiteRun: 10, minSliceHeight: 0,
        cutPosition: 'middle',
        prefix: 'nomin', padding: 4, outputDir: testDir, startIndex: 1
      })

      const testDir2 = join(tmpdir(), `slice_merge_test_${Date.now()}`)
      mkdirSync(testDir2, { recursive: true })

      const resultsWithMin = await service.autoSlice(inputBuffer, {
        whiteThreshold: 245, minWhiteRun: 10, minSliceHeight: 50,
        cutPosition: 'middle',
        prefix: 'withmin', padding: 4, outputDir: testDir2, startIndex: 1
      })

      // With minSliceHeight, should have fewer (merged) slices
      expect(resultsWithMin.length).toBeLessThanOrEqual(resultsNoMin.length)

      // Total height should be preserved
      const totalNoMin = resultsNoMin.reduce((s, r) => s + r.height, 0)
      const totalWithMin = resultsWithMin.reduce((s, r) => s + r.height, 0)
      expect(totalWithMin).toBe(totalNoMin)

      rmSync(testDir2, { recursive: true, force: true })
    })

    it('should handle single-row narrow image', async () => {
      const inputBuffer = await createImage(100, 1, { r: 0, g: 0, b: 0 })

      const results = await service.autoSlice(inputBuffer, {
        whiteThreshold: 245, minWhiteRun: 10, minSliceHeight: 0,
        cutPosition: 'middle',
        prefix: 'tiny', padding: 4, outputDir: testDir, startIndex: 1
      })

      expect(results).toHaveLength(1)
      expect(results[0].height).toBe(1)
    })
  })

  // ──────────────────────────────────────────
  // fixedSlice — edge cases
  // ──────────────────────────────────────────
  describe('fixedSlice — edge cases', () => {
    it('should produce single slice when sliceHeight > image height', async () => {
      const inputBuffer = await createImage(100, 50)

      const results = await service.fixedSlice(inputBuffer, {
        sliceHeight: 1000, startOffset: 0,
        prefix: 'big', padding: 4, outputDir: testDir, startIndex: 1
      })

      expect(results).toHaveLength(1)
      expect(results[0].height).toBe(50)
    })

    it('should return empty array when startOffset >= image height', async () => {
      const inputBuffer = await createImage(100, 50)

      const results = await service.fixedSlice(inputBuffer, {
        sliceHeight: 100, startOffset: 100,
        prefix: 'off', padding: 4, outputDir: testDir, startIndex: 1
      })

      expect(results).toHaveLength(0)
    })
  })
})
