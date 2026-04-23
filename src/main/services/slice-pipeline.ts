import {copyFileSync, existsSync, mkdirSync} from 'fs'
import {basename, dirname, join} from 'path'
import sharp from 'sharp'
import type {AppSettings, JobProgress, RunSliceJobPayload, SliceFileInfo} from '@shared/types'
import type {SourcePage, SourceRenderer} from './source-renderer'
import {isDiskBackedPage} from './source-renderer'
import type {DiskRawInput, RawImageInput, SliceService} from './slice.service'

type ProgressCallback = (progress: JobProgress) => void

// 렌더링된 PNG를 디스크에 쓰기 전 메모리에 보관하는 최대 페이지 수.
// 고해상도(pdfScale 10x) + 대형 PDF에서 메모리 부담이 될 수 있으므로, 필요 시 동적 조정 검토.
const RENDERED_WRITE_BATCH_SIZE = 5

// rendered/ PNG는 아무도 읽지 않는 아카이브 산출물이다. 병합된 PSD처럼 거대한
// 단일 페이지(수백 M 픽셀)는 PNG 인코딩만으로 워커 힙을 소진시키므로 임계
// 이상이면 건너뛴다. 작은 PDF 페이지는 기존대로 저장.
const RENDERED_PNG_MAX_PIXELS = 50_000_000

export type PipelineResult = {
  files: (SliceFileInfo & { pageNumber: number })[]
  pageCount: number
  copiedSourcePath: string
}

type SliceInput = RawImageInput | DiskRawInput

/**
 * Convert a SourcePage (either in-memory or disk-backed) into the shape
 * SliceService accepts. For in-memory pages we keep the existing raw RGBA
 * buffer path; for disk-backed pages we pass a DiskRawInput so slicing reads
 * straight from disk instead of holding the whole canvas in one Buffer.
 */
function pageToSliceInput(page: SourcePage): SliceInput {
  if (isDiskBackedPage(page)) {
    return {
      kind: 'disk-raw',
      filePath: page.filePath,
      headerOffset: page.headerOffset,
      width: page.width,
      height: page.height,
      channels: page.channels
    }
  }
  return {
    buffer: page.buffer,
    raw: { width: page.width, height: page.height, channels: 4 as const }
  }
}

/**
 * Shared source→slice pipeline used by both Worker thread and direct execution.
 * Accepts any SourceRenderer (PDF, image, etc.).
 */
export async function runSlicePipeline(
  payload: RunSliceJobPayload,
  settings: AppSettings,
  versionPath: string,
  prefix: string,
  sourceRenderer: SourceRenderer,
  sliceService: SliceService,
  onProgress: ProgressCallback
): Promise<PipelineResult> {
  onProgress({ stepKey: 'progressCopyPdf', current: 0, total: 0, percent: 0 })

  // Copy source file to job-level source/ (shared across versions)
  const sourceName = basename(payload.sourceFilePath)
  const jobDir = dirname(versionPath)
  const sourceDir = join(jobDir, 'source')
  const copiedSourcePath = join(sourceDir, sourceName)
  if (!existsSync(copiedSourcePath)) {
    mkdirSync(sourceDir, { recursive: true })
    copyFileSync(payload.sourceFilePath, copiedSourcePath)
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

  const pageCount = await sourceRenderer.renderAllPagesRaw(
    payload.sourceFilePath,
    pdfScale,
    async (page, pageResult, totalPages) => {
      const totalSteps = totalPages * 2

      // Render progress
      const renderStep = (page - 1) * 2 + 1
      onProgress({
        stepKey: 'progressRenderPages',
        current: page,
        total: totalPages,
        percent: Math.round(10 + (renderStep / totalSteps) * 80)
      })

      // Save rendered PNG in background (don't await individually) — but skip
      // for huge single-page sources (merged PSD, long webtoon strips) where
      // the PNG encode would OOM the worker and nothing reads the output.
      //
      // Disk-backed pages are always huge merged sources by construction, so
      // we never try to encode them as archival PNG.
      const pagePixels = pageResult.width * pageResult.height
      if (!isDiskBackedPage(pageResult) && pagePixels <= RENDERED_PNG_MAX_PIXELS) {
        const renderedName = `page_${String(page).padStart(4, '0')}.png`
        const rawOptions = { width: pageResult.width, height: pageResult.height, channels: 4 as const }
        pendingRenderedWrites.push(
          sharp(pageResult.buffer, { raw: rawOptions, limitInputPixels: false }).png().toFile(join(renderedDir, renderedName)).then(() => {})
        )

        // Flush completed writes periodically to avoid memory accumulation
        if (pendingRenderedWrites.length >= RENDERED_WRITE_BATCH_SIZE) {
          await Promise.all(pendingRenderedWrites)
          pendingRenderedWrites.length = 0
        }
      }

      // Slice progress
      const sliceStep = (page - 1) * 2 + 2
      onProgress({
        stepKey: 'progressSlicing',
        current: page,
        total: totalPages,
        percent: Math.round(10 + (sliceStep / totalSteps) * 80)
      })

      // Pass raw RGBA (buffer or disk-backed) directly to slice service — no
      // PNG decode. Disk-backed sources stream chunks from the file instead
      // of decoding into a single Buffer.
      const sliceInput = pageToSliceInput(pageResult)
      const thumbOpts = { thumbsDir, thumbWidth: THUMB_WIDTH }
      const sliceResults = payload.mode === 'fixed'
        ? await sliceService.fixedSlice(sliceInput, {
            sliceHeight: payload.options.sliceHeight ?? settings.defaultSliceHeight,
            startOffset: payload.options.startOffset ?? 0,
            minSliceHeight:
              payload.options.minSliceHeight ?? settings.autoSlice.minSliceHeight,
            prefix,
            padding: settings.naming.filenamePadding,
            outputDir: slicesDir,
            startIndex: globalIndex,
            ...thumbOpts
          })
        : await sliceService.autoSlice(sliceInput, {
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

  return { files: allFiles, pageCount, copiedSourcePath }
}
