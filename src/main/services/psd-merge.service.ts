import {Worker} from 'worker_threads'
import {createHash} from 'crypto'
import {existsSync, mkdirSync} from 'fs'
import {join} from 'path'
import {tmpdir} from 'os'
import type {MergePsdResult} from '@shared/types'
import {isPsdFile} from '@shared/constants/supported-formats'

type MergeWorkerInput = {
  filePaths: string[]
  outputPath: string
}

type MergeWorkerMessage =
  | { type: 'progress'; current: number; total: number; phase: 'dims' | 'render' | 'encode' }
  | { type: 'done'; width: number; height: number }
  | { type: 'error'; message: string }

/**
 * Composes multiple PSD files vertically into a single `.rgba` file
 * (internal raw-RGBA container, see RawRgbaSourceService).
 *
 * All heavy lifting (PSD parsing, stripe assembly, disk streaming) runs in a
 * worker thread (psd-merge.worker) so the main process never holds large RGBA
 * buffers. The worker writes raw RGBA bytes with an 8-byte header directly to
 * disk — no Sharp/libvips decode of the merged canvas — which avoids OOM on
 * huge merged sources (400M+ pixels).
 *
 * This is a one-shot file producer — it is NOT a SourceRenderer and does not
 * participate in the SourceService routing. The emitted `.rgba` file is
 * routed via RawRgbaSourceService at slice time.
 */
export class PsdMergeService {
  /**
   * Mirror PsdService.getWorkerPath: bundles may place the worker under
   * `workers/` adjacent to the main entry or one level up when rollup splits
   * into chunks. Probe both.
   */
  protected getWorkerPath(): string {
    const candidates = [
      join(__dirname, 'workers', 'psd-merge.worker.js'),
      join(__dirname, '..', 'workers', 'psd-merge.worker.js')
    ]
    for (const p of candidates) {
      if (existsSync(p)) return p
    }
    return candidates[0]
  }

  protected createWorker(workerPath: string, input: MergeWorkerInput): Worker {
    return new Worker(workerPath, { workerData: input })
  }

  async merge(filePaths: string[]): Promise<MergePsdResult> {
    if (!Array.isArray(filePaths) || filePaths.length < 2) {
      throw new Error('At least 2 files required')
    }
    for (const p of filePaths) {
      if (typeof p !== 'string' || !p || !isPsdFile(p)) {
        throw new Error('All files must be .psd')
      }
    }

    // Deterministic output path under the OS temp dir.
    const outputDir = join(tmpdir(), 'toonshark-merged')
    mkdirSync(outputDir, { recursive: true })
    const epochMs = Date.now()
    const hash8 = createHash('sha1')
      .update(filePaths.join('|') + epochMs)
      .digest('hex')
      .slice(0, 8)
    // `.rgba` is an internal raw-RGBA container (see RawRgbaSourceService).
    // Emitting this format directly bypasses Sharp/libvips decoding of the
    // merged canvas, which was OOMing on large merged sources (400M+ pixels).
    const outputPath = join(outputDir, `merged_${epochMs}_${hash8}.rgba`)

    const dims = await this.runWorker({ filePaths, outputPath })

    return {
      outputPath,
      width: dims.width,
      height: dims.height,
      sourceCount: filePaths.length
    }
  }

  private runWorker(input: MergeWorkerInput): Promise<{ width: number; height: number }> {
    return new Promise((resolve, reject) => {
      const worker = this.createWorker(this.getWorkerPath(), input)
      let settled = false

      const finish = (fn: () => void) => {
        if (settled) return
        settled = true
        // Terminate the worker regardless of outcome so no dangling threads
        // linger after either a 'done' or 'error' message.
        worker.terminate().catch(() => { /* ignore */ })
        fn()
      }

      worker.on('message', (msg: MergeWorkerMessage) => {
        if (msg.type === 'done') {
          finish(() => resolve({ width: msg.width, height: msg.height }))
        } else if (msg.type === 'error') {
          finish(() => reject(new Error(msg.message)))
        }
        // 'progress' messages are ignored for now; kept in the protocol so a
        // progress IPC channel can be added without changing the worker.
      })

      worker.on('error', (err) => {
        finish(() => reject(err))
      })

      worker.on('exit', (code) => {
        if (!settled) {
          settled = true
          reject(new Error(`PSD merge worker exited unexpectedly with code ${code}`))
        }
      })
    })
  }
}
