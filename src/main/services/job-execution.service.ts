import {Worker} from 'worker_threads'
import {rmSync} from 'fs'
import {basename, join} from 'path'
import {v4 as uuid} from 'uuid'
import type {AppSettings, JobMeta, JobProgress, RunSliceJobPayload, SliceFileInfo} from '@shared/types'
import type {SettingsService} from './settings.service'
import type {FileService} from './file.service'
import type {SliceService} from './slice.service'
import type {PdfService} from './pdf.service'
import type {PreviewService} from './preview.service'
import type {JobRepository} from './job-repository'
import type {PipelineResult} from './slice-pipeline'

const WORKER_TIMEOUT_MS = 10 * 60 * 1000 // 10 minutes

export class JobExecutionService {
  constructor(
    private settingsService: SettingsService,
    private fileService: FileService,
    private sliceService: SliceService,
    private pdfService: PdfService,
    private previewService: PreviewService,
    private jobRepository: JobRepository
  ) {}

  private buildMeta(
    payload: RunSliceJobPayload,
    prefix: string,
    versionPath: string,
    copiedPdfPath: string,
    files: (SliceFileInfo & { pageNumber: number })[],
    pageCount: number
  ): JobMeta {
    const title = payload.title || basename(payload.sourcePdfPath).replace(/\.pdf$/i, '')
    return {
      id: uuid(),
      title,
      prefix,
      sourcePdfPath: payload.sourcePdfPath,
      copiedPdfPath,
      createdAt: new Date().toISOString(),
      mode: payload.mode,
      pageCount,
      sliceCount: files.length,
      versionPath,
      options: { ...payload.options, pdfScale: payload.pdfScale },
      files
    }
  }

  private async saveAndGeneratePreview(meta: JobMeta, settings: AppSettings): Promise<void> {
    await this.jobRepository.saveJobMeta(meta)
    const devices = this.settingsService.getDevicePresets()
    this.previewService.writePreviewFiles(meta.versionPath, meta.files, devices, {
      imageGap: settings.preview.imageGap,
      defaultDeviceId: settings.preview.defaultDeviceId
    })
  }

  protected getWorkerPath(): string {
    return join(__dirname, 'workers', 'job.worker.js')
  }

  protected createWorker(workerPath: string): Worker {
    return new Worker(workerPath)
  }

  /**
   * Execute in a Worker thread — keeps the main thread free for IPC/UI.
   */
  async execute(
    payload: RunSliceJobPayload,
    onProgress: (progress: JobProgress) => void
  ): Promise<JobMeta> {
    const settings = this.settingsService.load()
    const prefix = this.fileService.sanitizePrefix(payload.prefix)
    const folderName = await this.jobRepository.resolveFolderForPdf(
      this.fileService.sanitizePdfFolderName(payload.sourcePdfPath),
      payload.sourcePdfPath
    )
    const versionPath = this.fileService.createVersionFolder(settings.baseDir, folderName)

    return new Promise<JobMeta>((resolve, reject) => {
      const workerPath = this.getWorkerPath()
      const worker = this.createWorker(workerPath)
      let settled = false

      const cleanup = () => {
        settled = true
        clearTimeout(timeout)
      }

      const timeout = setTimeout(() => {
        if (!settled) {
          cleanup()
          worker.terminate().catch(() => {})
          try { rmSync(versionPath, { recursive: true, force: true }) } catch { /* ignore */ }
          reject(new Error('Worker timed out'))
        }
      }, WORKER_TIMEOUT_MS)

      worker.postMessage({ payload, settings, versionPath, prefix })

      worker.on('message', async (msg: { type: string; data?: any; message?: string }) => {
        if (settled) return

        if (msg.type === 'progress') {
          onProgress(msg.data)
        } else if (msg.type === 'result') {
          const { files, pageCount, copiedPdfPath } = msg.data as PipelineResult

          onProgress({ stepKey: 'progressPreview', current: 0, total: 0, percent: 95 })

          const meta = this.buildMeta(payload, prefix, versionPath, copiedPdfPath, files, pageCount)

          try {
            await this.saveAndGeneratePreview(meta, settings)
          } catch (err) {
            cleanup()
            worker.terminate().catch(() => {})
            try { rmSync(versionPath, { recursive: true, force: true }) } catch { /* ignore */ }
            reject(err)
            return
          }

          onProgress({ stepKey: 'progressDone', current: 0, total: 0, percent: 100 })

          cleanup()
          worker.terminate().catch(() => {})
          resolve(meta)
        } else if (msg.type === 'error') {
          cleanup()
          worker.terminate().catch(() => {})
          reject(new Error(msg.message ?? 'Worker error'))
        }
      })

      worker.on('error', (err) => {
        if (settled) return
        cleanup()
        try { rmSync(versionPath, { recursive: true, force: true }) } catch { /* ignore */ }
        reject(err)
      })

      worker.on('exit', (code) => {
        if (settled) return
        cleanup()
        try { rmSync(versionPath, { recursive: true, force: true }) } catch { /* ignore */ }
        reject(new Error(`Worker exited unexpectedly with code ${code}`))
      })
    })
  }
}
