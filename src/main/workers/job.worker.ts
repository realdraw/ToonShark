import {parentPort} from 'worker_threads'
import {rmSync} from 'fs'
import sharp from 'sharp'
import {PdfService} from '../services/pdf.service'
import {SliceService} from '../services/slice.service'
import type {PipelineResult} from '../services/slice-pipeline'
import {runSlicePipeline} from '../services/slice-pipeline'
import type {AppSettings, JobProgress, RunSliceJobPayload} from '@shared/types'
import {toErrorMessage} from '@shared/utils'

// Limit sharp thread pool to avoid CPU thrashing
sharp.concurrency(1)

type WorkerInput = {
  payload: RunSliceJobPayload
  settings: AppSettings
  versionPath: string
  prefix: string
}

type WorkerMessage =
  | { type: 'progress'; data: JobProgress }
  | { type: 'result'; data: PipelineResult }
  | { type: 'error'; message: string }

function send(msg: WorkerMessage) {
  parentPort?.postMessage(msg)
}

async function execute(input: WorkerInput) {
  const { payload, settings, versionPath, prefix } = input
  const pdfService = new PdfService()
  const sliceService = new SliceService()

  try {
    const result = await runSlicePipeline(
      payload, settings, versionPath, prefix,
      pdfService, sliceService,
      (progress) => send({ type: 'progress', data: progress })
    )

    send({ type: 'result', data: result })
  } catch (err) {
    // Cleanup on error
    try { rmSync(versionPath, { recursive: true, force: true }) } catch { /* ignore */ }
    send({ type: 'error', message: toErrorMessage(err) })
  }
}

parentPort?.on('message', (msg: WorkerInput) => {
  execute(msg).catch((err) => {
    send({ type: 'error', message: toErrorMessage(err) })
  })
})
