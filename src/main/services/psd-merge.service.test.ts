import {afterEach, beforeEach, describe, expect, it} from 'vitest'
import {existsSync, mkdirSync, rmSync, writeFileSync} from 'fs'
import {readFile, stat} from 'fs/promises'
import {join} from 'path'
import {tmpdir} from 'os'
import {writePsdBuffer} from 'ag-psd'
import type {Worker} from 'worker_threads'
import {PsdMergeService} from './psd-merge.service'

/**
 * Produce a minimal valid PSD buffer filled with a single solid color. No
 * layers, no thumbnail — just enough for header + composite imageData.
 */
function createTestPsd(width: number, height: number, colorR = 200, colorG = 100, colorB = 50): Buffer {
  const data = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      data[i] = colorR
      data[i + 1] = colorG
      data[i + 2] = colorB
      data[i + 3] = 255
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
 * Inline mock of the merge worker that produces a valid `.rgba` file on disk.
 *
 * Mirrors the real worker contract:
 *   - 8-byte header: width (uint32 LE) + height (uint32 LE)
 *   - raw RGBA payload: width * height * 4 bytes
 *
 * The mock stat-reads each PSD's header to compute dims (avoids pulling a
 * PSD decoder into the test path), then writes opaque-white RGBA of the
 * right size. The service contract we validate here is: correct file shape,
 * correct done message, correct output path extension. The worker's streaming
 * algorithm is covered by integration tests on the real worker.
 */
class InlineMergeWorker {
  handlers: Record<string, Array<(value: any) => void>> = {}

  constructor(private readonly input: { filePaths: string[]; outputPath: string }) {
    queueMicrotask(() => {
      this.run().catch((err) => {
        this.emit('message', {
          type: 'error',
          message: err instanceof Error ? err.message : String(err)
        })
      })
    })
  }

  private async run(): Promise<void> {
    const {readFile, writeFile, mkdir} = await import('fs/promises')
    const {dirname} = await import('path')
    const dims: Array<{ width: number; height: number }> = []
    for (const p of this.input.filePaths) {
      const buf = await readFile(p)
      // PSD header: sig(4)+ver(2)+reserved(6)+channels(2)+height(4)+width(4)+depth(2)+mode(2)
      const height = buf.readUInt32BE(14)
      const width = buf.readUInt32BE(18)
      dims.push({ width, height })
    }
    const maxWidth = dims.reduce((m, d) => Math.max(m, d.width), 0)
    const totalHeight = dims.reduce((s, d) => s + d.height, 0)

    await mkdir(dirname(this.input.outputPath), { recursive: true })

    const headerBytes = 8
    const payloadBytes = maxWidth * totalHeight * 4
    const out = Buffer.alloc(headerBytes + payloadBytes, 0xff) // white RGBA
    out.writeUInt32LE(maxWidth, 0)
    out.writeUInt32LE(totalHeight, 4)
    await writeFile(this.input.outputPath, out)

    this.emit('message', { type: 'done', width: maxWidth, height: totalHeight })
  }

  on(event: string, handler: (value: any) => void) {
    this.handlers[event] ??= []
    this.handlers[event].push(handler)
    return this
  }

  terminate() {
    return Promise.resolve(0)
  }

  emit(event: string, value: any) {
    for (const handler of this.handlers[event] ?? []) {
      handler(value)
    }
  }
}

/**
 * Separate error-path mock: emits a single 'error' message and never resolves.
 */
class InlineErrorWorker {
  handlers: Record<string, Array<(value: any) => void>> = {}

  constructor(message: string) {
    queueMicrotask(() => {
      this.emit('message', { type: 'error', message })
    })
  }

  on(event: string, handler: (value: any) => void) {
    this.handlers[event] ??= []
    this.handlers[event].push(handler)
    return this
  }

  terminate() {
    return Promise.resolve(0)
  }

  emit(event: string, value: any) {
    for (const handler of this.handlers[event] ?? []) {
      handler(value)
    }
  }
}

class InlineWorkerPsdMergeService extends PsdMergeService {
  public lastWorkerPath: string | null = null
  public lastWorkerInput: { filePaths: string[]; outputPath: string } | null = null

  constructor(private readonly workerFactory?: (
    input: { filePaths: string[]; outputPath: string }
  ) => Worker) {
    super()
  }

  protected override createWorker(
    workerPath: string,
    input: { filePaths: string[]; outputPath: string }
  ): Worker {
    this.lastWorkerPath = workerPath
    this.lastWorkerInput = input
    const factory = this.workerFactory ?? ((i) => new InlineMergeWorker(i) as unknown as Worker)
    return factory(input) as unknown as Worker
  }
}

describe('PsdMergeService', () => {
  let testDir: string
  let service: InlineWorkerPsdMergeService
  const createdOutputs: string[] = []

  beforeEach(() => {
    testDir = join(tmpdir(), `psd_merge_test_${Date.now()}_${Math.random().toString(36).slice(2)}`)
    mkdirSync(testDir, { recursive: true })
    service = new InlineWorkerPsdMergeService()
  })

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true })
    for (const p of createdOutputs.splice(0)) {
      try {
        if (existsSync(p)) rmSync(p, { force: true })
      } catch { /* ignore */ }
    }
  })

  it('throws when fewer than 2 files are provided', async () => {
    await expect(service.merge([])).rejects.toThrow(/at least 2/i)

    const single = join(testDir, 'only.psd')
    writeFileSync(single, createTestPsd(10, 10))
    await expect(service.merge([single])).rejects.toThrow(/at least 2/i)
  })

  it('throws when any path is not a .psd file', async () => {
    const a = join(testDir, 'a.psd')
    const b = join(testDir, 'b.png')
    writeFileSync(a, createTestPsd(10, 10))
    writeFileSync(b, Buffer.from([0x89, 0x50, 0x4e, 0x47]))

    await expect(service.merge([a, b])).rejects.toThrow(/must be \.psd/i)
  })

  it('delegates to a worker and returns MergePsdResult from its done message', async () => {
    const a = join(testDir, 'a.psd')
    const b = join(testDir, 'b.psd')
    writeFileSync(a, createTestPsd(100, 50))
    writeFileSync(b, createTestPsd(100, 80))

    const result = await service.merge([a, b])
    createdOutputs.push(result.outputPath)

    // Contract: sourceCount = input length
    expect(result.sourceCount).toBe(2)
    // Contract: dims come from the worker's done message
    expect(result.width).toBe(100)
    expect(result.height).toBe(130) // 50 + 80
    // Contract: output path was created by the worker
    expect(existsSync(result.outputPath)).toBe(true)
    // Worker factory received the correct input envelope
    expect(service.lastWorkerInput).not.toBeNull()
    expect(service.lastWorkerInput?.filePaths).toEqual([a, b])
    expect(service.lastWorkerInput?.outputPath).toBe(result.outputPath)
    // Output is under os.tmpdir()/toonshark-merged with the expected filename
    // shape. Extension is now `.rgba` — the internal raw-RGBA container that
    // bypasses Sharp decoding of the merged canvas.
    expect(result.outputPath).toMatch(/toonshark-merged[\\/]merged_\d+_[0-9a-f]{8}\.rgba$/)

    // File size must be header (8B) + width * height * 4 raw RGBA bytes
    const { size } = await stat(result.outputPath)
    expect(size).toBe(8 + 100 * 130 * 4)

    // Header must round-trip the dims
    const header = await readFile(result.outputPath)
    expect(header.readUInt32LE(0)).toBe(100)
    expect(header.readUInt32LE(4)).toBe(130)
  })

  it('propagates width mismatch via the worker done message (maxWidth)', async () => {
    const narrow = join(testDir, 'narrow.psd')
    const wide = join(testDir, 'wide.psd')
    writeFileSync(narrow, createTestPsd(100, 40))
    writeFileSync(wide, createTestPsd(200, 40))

    const result = await service.merge([narrow, wide])
    createdOutputs.push(result.outputPath)

    // Service must surface whatever dims the worker reports; our mock
    // reports maxWidth + totalHeight exactly like the real worker does.
    expect(result.width).toBe(200)
    expect(result.height).toBe(80)
    expect(result.sourceCount).toBe(2)

    // File size reflects the padded canvas (maxWidth used for every row).
    const { size } = await stat(result.outputPath)
    expect(size).toBe(8 + 200 * 80 * 4)
  })

  it('rejects when the worker emits an error message', async () => {
    const a = join(testDir, 'a.psd')
    const b = join(testDir, 'b.psd')
    writeFileSync(a, createTestPsd(10, 10))
    writeFileSync(b, createTestPsd(10, 10))

    const errorService = new InlineWorkerPsdMergeService(
      () => new InlineErrorWorker('simulated worker failure') as unknown as Worker
    )
    await expect(errorService.merge([a, b])).rejects.toThrow(/simulated worker failure/)
  })
})
