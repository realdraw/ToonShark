import {parentPort, workerData} from 'worker_threads'
import {open, readFile, stat} from 'fs/promises'
import {initializeCanvas, readPsd} from 'ag-psd'
import {createCanvas} from '@napi-rs/canvas'
import {toErrorMessage} from '@shared/utils'

// ag-psd requires a canvas factory for its fallback code paths (used when the
// composite has to be reconstructed from layers). Match psd.worker.ts exactly.
initializeCanvas(
  ((width: number, height: number) => createCanvas(width, height)) as unknown as (
    width: number,
    height: number
  ) => HTMLCanvasElement
)

type MergeWorkerInput = {
  filePaths: string[]
  outputPath: string
}

type MergeWorkerMessage =
  | { type: 'progress'; current: number; total: number; phase: 'dims' | 'render' | 'encode' }
  | { type: 'done'; width: number; height: number }
  | { type: 'error'; message: string }

/**
 * `.rgba` file layout (shared with RawRgbaSourceService):
 *   offset 0x00  uint32 LE  width
 *   offset 0x04  uint32 LE  height
 *   offset 0x08  raw RGBA   width * height * 4 bytes (channels = 4)
 *
 * Keep this constant in sync with `RAW_RGBA_HEADER_BYTES` in
 * `raw-rgba-source.service.ts`.
 */
const RAW_RGBA_HEADER_BYTES = 8

function send(msg: MergeWorkerMessage): void {
  parentPort?.postMessage(msg)
}

/**
 * Extract RGBA bytes from an ag-psd parse result.
 *
 * Mirrors psd.worker.ts' handleRender logic exactly: prefer psd.imageData (no
 * canvas round-trip, no premultiplication), fall back to the canvas path when
 * ag-psd had to reconstruct the composite from layers.
 */
function extractRgba(
  psd: ReturnType<typeof readPsd>,
  width: number,
  height: number
): Uint8Array {
  if (psd.imageData && psd.imageData.data.length >= width * height * 4) {
    const src = psd.imageData.data
    const out = new Uint8Array(width * height * 4)
    out.set(src.subarray(0, out.length))
    return out
  }

  const canvas = psd.canvas as unknown as {
    getContext: (type: '2d') => {
      getImageData: (x: number, y: number, w: number, h: number) => { data: Uint8ClampedArray }
    }
  } | undefined

  if (canvas && typeof canvas.getContext === 'function') {
    const ctx = canvas.getContext('2d')
    const imageData = ctx.getImageData(0, 0, width, height)
    const out = new Uint8Array(width * height * 4)
    out.set(imageData.data.subarray(0, out.length))
    return out
  }

  throw new Error('PSD has no composite image data and no reconstructable canvas')
}

/**
 * Pass 1: header-only parse of every PSD to collect dimensions without ever
 * holding more than one file's raw bytes in memory at a time.
 */
async function collectDimensions(
  filePaths: string[]
): Promise<Array<{ width: number; height: number }>> {
  const dims: Array<{ width: number; height: number }> = []
  for (let i = 0; i < filePaths.length; i++) {
    // Block scope so buf/psd go out of scope after each iteration and are
    // eligible for GC before the next readFile allocates a new buffer.
    {
      const buf = await readFile(filePaths[i])
      const psd = readPsd(buf, {
        skipLayerImageData: true,
        skipCompositeImageData: true,
        skipThumbnail: true
      })
      if (!psd.width || !psd.height || psd.width <= 0 || psd.height <= 0) {
        throw new Error(`Invalid PSD dimensions for ${filePaths[i]}`)
      }
      dims.push({ width: psd.width, height: psd.height })
    }
    send({ type: 'progress', current: i + 1, total: filePaths.length, phase: 'dims' })
  }
  return dims
}

/**
 * Pass 2: stream RGBA rows directly to the final `.rgba` file, one PSD at a
 * time, with the 8-byte header pre-written at offset 0.
 *
 * For each PSD:
 *   - allocate a single stripe buffer of size (maxWidth * height * 4)
 *   - initialize it with 0xFF so padding regions are already opaque white
 *   - copy every row of source RGBA into the leftmost slot, leaving the right
 *     edge pre-filled (no extra copy, no Sharp round-trip)
 *   - append the stripe to the output file at `headerBytes + y*rowBytes`
 *
 * Peak memory per iteration: ~1 original file buffer + 1 stripe buffer. The
 * full raw RGBA canvas (can be >1.5 GB) is never held in memory in aggregate;
 * each stripe is released as soon as fh.write completes.
 *
 * No Sharp / libvips decode happens here. The file produced is the final
 * slicing input — downstream reads it via RawRgbaSourceService which streams
 * chunks straight off disk.
 */
async function writeRgbaFile(
  filePaths: string[],
  dims: Array<{ width: number; height: number }>,
  maxWidth: number,
  totalHeight: number,
  outputPath: string
): Promise<void> {
  const rowBytes = maxWidth * 4
  const fh = await open(outputPath, 'w')
  try {
    // Header: width (uint32 LE) + height (uint32 LE)
    const header = Buffer.alloc(RAW_RGBA_HEADER_BYTES)
    header.writeUInt32LE(maxWidth, 0)
    header.writeUInt32LE(totalHeight, 4)
    await fh.write(header, 0, RAW_RGBA_HEADER_BYTES, 0)

    let cursorY = 0
    for (let i = 0; i < filePaths.length; i++) {
      const { width, height } = dims[i]
      {
        const fileBuffer = await readFile(filePaths[i])
        const psd = readPsd(fileBuffer, {
          skipLayerImageData: true,
          skipThumbnail: true,
          useImageData: true
        })
        const rgba = extractRgba(psd, width, height)

        // Pre-fill with 0xFF so any pad region to the right of the source is
        // opaque white (R=G=B=255, A=255) without a second pass.
        const stripe = Buffer.alloc(rowBytes * height, 0xff)
        const srcRowBytes = width * 4
        if (width === maxWidth) {
          // No padding — one contiguous copy.
          stripe.set(rgba, 0)
        } else {
          for (let y = 0; y < height; y++) {
            const srcStart = y * srcRowBytes
            const dstStart = y * rowBytes
            stripe.set(rgba.subarray(srcStart, srcStart + srcRowBytes), dstStart)
          }
        }

        const offset = RAW_RGBA_HEADER_BYTES + cursorY * rowBytes
        await fh.write(stripe, 0, stripe.length, offset)
        cursorY += height
      }
      send({ type: 'progress', current: i + 1, total: filePaths.length, phase: 'render' })
    }
  } finally {
    await fh.close()
  }
}

async function run(): Promise<void> {
  const input = workerData as MergeWorkerInput
  if (!input || !Array.isArray(input.filePaths) || !input.outputPath) {
    throw new Error('Invalid worker input: expected { filePaths, outputPath }')
  }

  // Pass 1: dimensions
  const dims = await collectDimensions(input.filePaths)
  const maxWidth = dims.reduce((m, d) => Math.max(m, d.width), 0)
  const totalHeight = dims.reduce((sum, d) => sum + d.height, 0)
  if (maxWidth <= 0 || totalHeight <= 0) {
    throw new Error('Invalid merged canvas dimensions')
  }

  // Pass 2: stream RGBA → final .rgba file (staging is the output; no copy).
  await writeRgbaFile(input.filePaths, dims, maxWidth, totalHeight, input.outputPath)

  // Verify: file size must equal header + raw RGBA payload. Catches partial
  // writes / disk-full failures that would later surface as a mysterious
  // slice-time crash.
  send({ type: 'progress', current: 0, total: 1, phase: 'encode' })
  const expectedBytes = RAW_RGBA_HEADER_BYTES + maxWidth * totalHeight * 4
  const { size } = await stat(input.outputPath)
  if (size !== expectedBytes) {
    throw new Error(
      `Merged output verification failed: size=${size} bytes, ` +
        `expected ${expectedBytes} (header+${maxWidth}×${totalHeight}×4)`
    )
  }
  send({ type: 'progress', current: 1, total: 1, phase: 'encode' })

  send({ type: 'done', width: maxWidth, height: totalHeight })
}

run().catch((err) => {
  // Use console.error for worker-local diagnostics; the authoritative error
  // surface is the 'error' IPC message the parent listens for.
  console.error('[psd-merge.worker] failed:', err)
  send({ type: 'error', message: toErrorMessage(err) })
})
