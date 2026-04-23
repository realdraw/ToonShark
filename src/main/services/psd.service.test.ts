import {afterEach, beforeEach, describe, expect, it} from 'vitest'
import {mkdirSync, rmSync, writeFileSync} from 'fs'
import {join, resolve} from 'path'
import {tmpdir} from 'os'
import {writePsdBuffer} from 'ag-psd'
import {PsdService} from './psd.service'
import {SourceService} from './source.service'
import {PdfService} from './pdf.service'
import {ImageService} from './image.service'
import {isPsdFile} from '@shared/constants/supported-formats'

/**
 * Build a minimal PSD file on the fly with a solid color composite.
 * The pixel pattern is deterministic so tests can spot-check RGBA bytes.
 */
function createTestPsd(width: number, height: number): Buffer {
  const data = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      data[i] = 200     // R
      data[i + 1] = 100 // G
      data[i + 2] = 50  // B
      data[i + 3] = 255 // A
    }
  }
  return writePsdBuffer(
    {
      width,
      height,
      channels: 4,
      bitsPerChannel: 8,
      colorMode: 3, // RGB
      imageData: { width, height, data }
    },
    { generateThumbnail: false, psb: false }
  )
}

/**
 * Testable PsdService that resolves the psd.worker.ts path against the
 * compiled dist-electron output when present, otherwise falls back to
 * a tsx-capable loader path. Under vitest we ship a prebuilt worker
 * via electron-vite's build, or skip (see the it.runIf below).
 */
class TestPsdService extends PsdService {
  constructor(private readonly workerPath: string) {
    super()
  }
  protected getWorkerPath(): string {
    return this.workerPath
  }
}

import {existsSync} from 'fs'
const BUILT_WORKER = resolve(
  __dirname,
  '../../../dist-electron/main/workers/psd.worker.js'
)
const hasBuiltWorker = existsSync(BUILT_WORKER)

describe.runIf(hasBuiltWorker)('PsdService', () => {
  let service: PsdService
  let testDir: string

  beforeEach(() => {
    testDir = join(tmpdir(), `psd_test_${Date.now()}_${Math.random().toString(36).slice(2)}`)
    mkdirSync(testDir, { recursive: true })
    service = new TestPsdService(BUILT_WORKER)
  })

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true })
  })

  describe('getPageDimensions', () => {
    it('returns correct dimensions', async () => {
      const psdPath = join(testDir, 'dims.psd')
      writeFileSync(psdPath, createTestPsd(120, 80))

      const dims = await service.getPageDimensions(psdPath)
      expect(dims.width).toBe(120)
      expect(dims.height).toBe(80)
    })

    it('rejects for non-existent file', async () => {
      await expect(service.getPageDimensions('/nonexistent.psd')).rejects.toThrow()
    })

    it('rejects for corrupted file', async () => {
      const psdPath = join(testDir, 'corrupt.psd')
      writeFileSync(psdPath, 'not a PSD')
      await expect(service.getPageDimensions(psdPath)).rejects.toThrow()
    })
  })

  describe('renderAllPagesRaw', () => {
    it('calls onPage once with a single-page result and RGBA buffer of correct size', async () => {
      const psdPath = join(testDir, 'render.psd')
      const W = 64
      const H = 48
      writeFileSync(psdPath, createTestPsd(W, H))

      const calls: { pageNumber: number; pageCount: number; width: number; height: number; length: number }[] = []
      const count = await service.renderAllPagesRaw(psdPath, 1.0, async (pageNumber, raw, pageCount) => {
        calls.push({
          pageNumber,
          pageCount,
          width: raw.width,
          height: raw.height,
          length: raw.buffer.length
        })
      })

      expect(count).toBe(1)
      expect(calls).toHaveLength(1)
      expect(calls[0].pageNumber).toBe(1)
      expect(calls[0].pageCount).toBe(1)
      expect(calls[0].width).toBe(W)
      expect(calls[0].height).toBe(H)
      expect(calls[0].length).toBe(W * H * 4)
    })

    it('rejects for non-existent file', async () => {
      await expect(
        service.renderAllPagesRaw('/nonexistent.psd', 1.0, async () => {})
      ).rejects.toThrow()
    })
  })
})

describe('SourceService PSD routing', () => {
  it('routes .psd files to the registered PsdService renderer', async () => {
    const calls: string[] = []
    const fakePsdRenderer = {
      async getPageDimensions(filePath: string) {
        calls.push(`dims:${filePath}`)
        return { width: 10, height: 20 }
      },
      async renderAllPagesRaw() {
        calls.push('render')
        return 1
      }
    }

    const source = new SourceService(new PdfService(), new ImageService())
    source.addRenderer(isPsdFile, fakePsdRenderer)

    const dims = await source.getPageDimensions('/tmp/foo.psd')
    expect(dims).toEqual({ width: 10, height: 20 })
    expect(calls).toContain('dims:/tmp/foo.psd')
  })

  it('does not route non-PSD files to the PSD renderer', async () => {
    let psdCalled = false
    const fakePsdRenderer = {
      async getPageDimensions() {
        psdCalled = true
        return { width: 1, height: 1 }
      },
      async renderAllPagesRaw() {
        psdCalled = true
        return 1
      }
    }

    const source = new SourceService(new PdfService(), new ImageService())
    source.addRenderer(isPsdFile, fakePsdRenderer)

    // .jpg should fall through to ImageService (not PsdService); it'll error on
    // a missing file but the PSD renderer should not be touched.
    await source.getPageDimensions('/nonexistent.jpg').catch(() => {})
    expect(psdCalled).toBe(false)
  })
})
