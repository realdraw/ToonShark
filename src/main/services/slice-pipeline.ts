import {copyFileSync, existsSync} from 'fs'
import {basename, dirname, join} from 'path'
import sharp from 'sharp'
import type {AppSettings, JobProgress, RunSliceJobPayload, SliceFileInfo} from '@shared/types'
import type {PdfService, RawPageResult} from './pdf.service'
import type {SliceService} from './slice.service'

type ProgressCallback = (progress: JobProgress) => void

// 렌더링된 PNG를 디스크에 쓰기 전 메모리에 보관하는 최대 페이지 수.
// 고해상도(pdfScale 10x) + 대형 PDF에서 메모리 부담이 될 수 있으므로, 필요 시 동적 조정 검토.
const RENDERED_WRITE_BATCH_SIZE = 5

export type PipelineResult = {
  files: (SliceFileInfo & { pageNumber: number })[]
  pageCount: number
  copiedPdfPath: string
}

function rawToSharpInput(raw: RawPageResult) {
  return {
    buffer: raw.buffer,
    rawOptions: { width: raw.width, height: raw.height, channels: 4 as const }
  }
}

/**
 * Shared PDF→Slice pipeline used by both Worker thread and direct execution.
 */
export async function runSlicePipeline(
  payload: RunSliceJobPayload,
  settings: AppSettings,
  versionPath: string,
  prefix: string,
  pdfService: PdfService,
  sliceService: SliceService,
  onProgress: ProgressCallback
): Promise<PipelineResult> {
  onProgress({ stepKey: 'progressCopyPdf', current: 0, total: 0, percent: 0 })

  // Copy source PDF to job-level source/ (shared across versions)
  const pdfName = basename(payload.sourcePdfPath)
  const jobDir = dirname(versionPath)
  const copiedPdfPath = join(jobDir, 'source', pdfName)
  if (!existsSync(copiedPdfPath)) {
    copyFileSync(payload.sourcePdfPath, copiedPdfPath)
  }

  onProgress({ stepKey: 'progressCountPages', current: 0, total: 0, percent: 5 })
  const pdfScale = payload.pdfScale ?? settings.pdfScale ?? 4.0
  const renderedDir = join(versionPath, 'rendered')
  const slicesDir = join(versionPath, 'slices')
  const thumbsDir = join(versionPath, 'thumbs')
  const THUMB_WIDTH = 200

  let globalIndex = 1
  const allFiles: (SliceFileInfo & { pageNumber: number })[] = []
  const pendingRenderedWrites: Promise<void>[] = []

  const pageCount = await pdfService.renderAllPagesRaw(
    payload.sourcePdfPath,
    pdfScale,
    async (page, raw, totalPages) => {
      const totalSteps = totalPages * 2
      const { buffer: rawBuf, rawOptions } = rawToSharpInput(raw)

      // Render progress
      const renderStep = (page - 1) * 2 + 1
      onProgress({
        stepKey: 'progressRenderPages',
        current: page,
        total: totalPages,
        percent: Math.round(10 + (renderStep / totalSteps) * 80)
      })

      // Save rendered PNG in background (don't await individually)
      const renderedName = `page_${String(page).padStart(4, '0')}.png`
      pendingRenderedWrites.push(
        sharp(rawBuf, { raw: rawOptions }).png().toFile(join(renderedDir, renderedName)).then(() => {})
      )

      // Flush completed writes periodically to avoid memory accumulation
      if (pendingRenderedWrites.length >= RENDERED_WRITE_BATCH_SIZE) {
        await Promise.all(pendingRenderedWrites)
        pendingRenderedWrites.length = 0
      }

      // Slice progress
      const sliceStep = (page - 1) * 2 + 2
      onProgress({
        stepKey: 'progressSlicing',
        current: page,
        total: totalPages,
        percent: Math.round(10 + (sliceStep / totalSteps) * 80)
      })

      // #1+#2: Pass raw RGBA buffer directly to slice service — no PNG decode
      const thumbOpts = { thumbsDir, thumbWidth: THUMB_WIDTH }
      const rawInput = { buffer: rawBuf, raw: rawOptions }
      const sliceResults = payload.mode === 'fixed'
        ? await sliceService.fixedSlice(rawInput, {
            sliceHeight: payload.options.sliceHeight ?? settings.defaultSliceHeight,
            startOffset: payload.options.startOffset ?? 0,
            prefix,
            padding: settings.naming.filenamePadding,
            outputDir: slicesDir,
            startIndex: globalIndex,
            ...thumbOpts
          })
        : await sliceService.autoSlice(rawInput, {
            whiteThreshold:
              payload.options.whiteThreshold ?? settings.autoSlice.whiteThreshold,
            minWhiteRun:
              payload.options.minWhiteRun ?? settings.autoSlice.minWhiteRun,
            minSliceHeight:
              payload.options.minSliceHeight ?? settings.autoSlice.minSliceHeight,
            cutPosition:
              payload.options.cutPosition ?? settings.autoSlice.cutPosition,
            prefix,
            padding: settings.naming.filenamePadding,
            outputDir: slicesDir,
            startIndex: globalIndex,
            ...thumbOpts
          })

      for (const slice of sliceResults) {
        allFiles.push({ ...slice, pageNumber: page })
      }
      globalIndex += sliceResults.length
    }
  )

  // Wait for background rendered PNG writes to finish
  await Promise.all(pendingRenderedWrites)

  return { files: allFiles, pageCount, copiedPdfPath }
}
