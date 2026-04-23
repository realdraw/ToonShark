import {parentPort, workerData} from 'worker_threads'
import {readFile} from 'fs/promises'
import {initializeCanvas, readPsd} from 'ag-psd'
import {createCanvas} from '@napi-rs/canvas'
import {toErrorMessage} from '@shared/utils'

// ag-psd needs a `createCanvas` implementation to decode composite image data into a canvas.
// When useImageData is true, it returns a PixelData (imageData) with raw RGBA Uint8ClampedArray
// and does not require canvas. We still initialize canvas as a fallback for composite
// reconstruction from layers (ag-psd falls back to canvas paths in some code branches).
//
// Node's worker_threads don't expose HTMLCanvasElement; @napi-rs/canvas returns a Canvas
// object that is structurally compatible enough for ag-psd's internal operations.
initializeCanvas(
  ((width: number, height: number) => createCanvas(width, height)) as unknown as (
    width: number,
    height: number
  ) => HTMLCanvasElement
)

type PsdWorkerInput =
  | { mode: 'dimensions'; filePath: string }
  | { mode: 'render'; filePath: string }

type PsdWorkerMessage =
  | { type: 'dimensions'; width: number; height: number }
  | { type: 'render'; width: number; height: number; buffer: ArrayBuffer }
  | { type: 'error'; message: string }

function send(msg: PsdWorkerMessage, transfer: Transferable[] = []) {
  // Worker threads accept an ArrayBuffer[] as transferList; cast to any to satisfy TS
  parentPort?.postMessage(msg, transfer as unknown as ArrayBuffer[])
}

async function handleDimensions(filePath: string): Promise<void> {
  const buffer = await readFile(filePath)
  // Header-only parse: skip all pixel data and thumbnails for speed
  const psd = readPsd(buffer, {
    skipLayerImageData: true,
    skipCompositeImageData: true,
    skipThumbnail: true
  })
  send({ type: 'dimensions', width: psd.width, height: psd.height })
}

async function handleRender(filePath: string): Promise<void> {
  const fileBuffer = await readFile(filePath)
  // useImageData: true → ag-psd puts the composite RGBA bytes in psd.imageData
  // and does NOT premultiply/corrupt alpha. This is the fastest path.
  const psd = readPsd(fileBuffer, {
    skipLayerImageData: true,
    skipThumbnail: true,
    useImageData: true
  })

  const width = psd.width
  const height = psd.height

  // Prefer the raw imageData path (no canvas round-trip)
  if (psd.imageData && psd.imageData.data.length >= width * height * 4) {
    const src = psd.imageData.data
    // Allocate a fresh ArrayBuffer we own so it can be safely transferred
    const out = new Uint8Array(width * height * 4)
    out.set(src.subarray(0, out.length))
    send(
      { type: 'render', width, height, buffer: out.buffer },
      [out.buffer]
    )
    return
  }

  // Fallback: ag-psd generated a canvas (when composite was reconstructed from layers)
  // @napi-rs/canvas exposes getContext('2d').getImageData for RGBA extraction.
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
    send(
      { type: 'render', width, height, buffer: out.buffer },
      [out.buffer]
    )
    return
  }

  throw new Error('PSD has no composite image data and no reconstructable canvas')
}

async function run(): Promise<void> {
  const input = workerData as PsdWorkerInput
  if (!input || !input.mode || !input.filePath) {
    throw new Error('Invalid worker input: expected { mode, filePath }')
  }

  if (input.mode === 'dimensions') {
    await handleDimensions(input.filePath)
  } else if (input.mode === 'render') {
    await handleRender(input.filePath)
  } else {
    throw new Error(`Unknown PSD worker mode: ${(input as { mode: string }).mode}`)
  }
}

run().catch((err) => {
  send({ type: 'error', message: toErrorMessage(err) })
})
