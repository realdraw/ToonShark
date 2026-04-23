import {Worker} from 'worker_threads'
import {join} from 'path'
import {existsSync} from 'fs'
import type {RawPageResult, SourceRenderer} from './source-renderer'

type PsdWorkerInput =
  | { mode: 'dimensions'; filePath: string }
  | { mode: 'render'; filePath: string }

type PsdWorkerMessage =
  | { type: 'dimensions'; width: number; height: number }
  | { type: 'render'; width: number; height: number; buffer: ArrayBuffer }
  | { type: 'error'; message: string }

/**
 * SourceRenderer implementation for Adobe Photoshop (.psd) files.
 *
 * Each PSD is treated as a single page (its flattened composite), matching the
 * ImageService convention. ag-psd parsing happens in a dedicated worker thread
 * so large files (hundreds of MB) don't block the caller; the resulting RGBA
 * buffer is returned as a transferable ArrayBuffer to avoid a copy.
 */
export class PsdService implements SourceRenderer {
  /**
   * Override in tests. PsdService may be bundled into the main entry (__dirname =
   * dist-electron/main/) or split into a shared chunk (__dirname =
   * dist-electron/main/chunks/), depending on how rollup code-splits. Probe both.
   */
  protected getWorkerPath(): string {
    const candidates = [
      join(__dirname, 'workers', 'psd.worker.js'),
      join(__dirname, '..', 'workers', 'psd.worker.js')
    ]
    for (const p of candidates) {
      if (existsSync(p)) return p
    }
    return candidates[0]
  }

  protected createWorker(workerPath: string, workerData: PsdWorkerInput): Worker {
    return new Worker(workerPath, { workerData })
  }

  private runWorker(input: PsdWorkerInput): Promise<PsdWorkerMessage> {
    return new Promise((resolve, reject) => {
      const worker = this.createWorker(this.getWorkerPath(), input)
      let settled = false

      const finish = (fn: () => void) => {
        if (settled) return
        settled = true
        worker.terminate().catch(() => { /* ignore */ })
        fn()
      }

      worker.on('message', (msg: PsdWorkerMessage) => {
        if (msg.type === 'error') {
          finish(() => reject(new Error(msg.message)))
        } else {
          finish(() => resolve(msg))
        }
      })

      worker.on('error', (err) => {
        finish(() => reject(err))
      })

      worker.on('exit', (code) => {
        if (!settled) {
          settled = true
          reject(new Error(`PSD worker exited unexpectedly with code ${code}`))
        }
      })
    })
  }

  async getPageDimensions(filePath: string): Promise<{ width: number; height: number }> {
    const msg = await this.runWorker({ mode: 'dimensions', filePath })
    if (msg.type !== 'dimensions') {
      throw new Error(`Unexpected PSD worker response: ${msg.type}`)
    }
    return { width: msg.width, height: msg.height }
  }

  async renderAllPagesRaw(
    filePath: string,
    _scale: number,
    onPage: (pageNumber: number, raw: RawPageResult, pageCount: number) => Promise<void>
  ): Promise<number> {
    const msg = await this.runWorker({ mode: 'render', filePath })
    if (msg.type !== 'render') {
      throw new Error(`Unexpected PSD worker response: ${msg.type}`)
    }

    const raw: RawPageResult = {
      buffer: Buffer.from(msg.buffer),
      width: msg.width,
      height: msg.height
    }

    await onPage(1, raw, 1)
    return 1
  }
}
