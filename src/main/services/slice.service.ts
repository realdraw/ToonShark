import sharp from 'sharp'
import {join} from 'path'
import type {CutPosition, SliceFileInfo} from '@shared/types'

type SliceRange = {
  y: number
  height: number
}

type RawImageInput = {
  buffer: Buffer
  raw: { width: number; height: number; channels: 4 }
}

type ImageInput = Buffer | RawImageInput

function isRawInput(input: ImageInput): input is RawImageInput {
  return typeof input === 'object' && 'raw' in input && 'buffer' in input
}

function toSharp(input: ImageInput): sharp.Sharp {
  if (isRawInput(input)) {
    return sharp(input.buffer, { raw: input.raw })
  }
  return sharp(input)
}

async function getImageDimensions(input: ImageInput): Promise<{ width: number; height: number }> {
  if (isRawInput(input)) {
    return { width: input.raw.width, height: input.raw.height }
  }
  const metadata = await sharp(input).metadata()
  if (!metadata.width || !metadata.height) throw new Error('Cannot read image dimensions')
  return { width: metadata.width, height: metadata.height }
}

type FixedSliceOptions = {
  sliceHeight: number
  startOffset: number
  prefix: string
  padding: number
  outputDir: string
  startIndex: number
  thumbsDir?: string
  thumbWidth?: number
}

type AutoSliceOptions = {
  whiteThreshold: number
  minWhiteRun: number
  minSliceHeight: number
  cutPosition: CutPosition
  prefix: string
  padding: number
  outputDir: string
  startIndex: number
  thumbsDir?: string
  thumbWidth?: number
}


export class SliceService {
  computeFixedSliceRanges(
    imageHeight: number,
    sliceHeight: number,
    startOffset: number
  ): SliceRange[] {
    const ranges: SliceRange[] = []
    let currentY = startOffset

    if (currentY >= imageHeight) return ranges

    while (currentY < imageHeight) {
      const remaining = imageHeight - currentY
      const h = Math.min(sliceHeight, remaining)
      ranges.push({ y: currentY, height: h })
      currentY += sliceHeight
    }

    return ranges
  }

  analyzeWhiteRows(
    rawBuffer: Buffer,
    width: number,
    height: number,
    whiteThreshold: number,
    channels: number = 4
  ): boolean[] {
    const result: boolean[] = new Array(height)
    const rowBytes = width * channels

    for (let y = 0; y < height; y++) {
      let isWhite = true
      const rowStart = y * rowBytes
      for (let x = 0; x < width; x++) {
        const offset = rowStart + x * channels
        const r = rawBuffer[offset]
        const g = rawBuffer[offset + 1]
        const b = rawBuffer[offset + 2]
        if (r < whiteThreshold || g < whiteThreshold || b < whiteThreshold) {
          isWhite = false
          break
        }
      }
      result[y] = isWhite
    }

    return result
  }

  computeAutoSliceRanges(
    isWhiteRow: boolean[],
    options: {
      minWhiteRun: number
      minSliceHeight: number
      cutPosition: CutPosition
    }
  ): SliceRange[] {
    const totalHeight = isWhiteRow.length
    const { minWhiteRun, cutPosition } = options

    // Find white runs
    type WhiteRun = { start: number; end: number }
    const whiteRuns: WhiteRun[] = []
    let runStart = -1

    for (let y = 0; y < totalHeight; y++) {
      if (isWhiteRow[y]) {
        if (runStart === -1) runStart = y
      } else {
        if (runStart !== -1) {
          const runLength = y - runStart
          if (runLength >= minWhiteRun) {
            whiteRuns.push({ start: runStart, end: y })
          }
          runStart = -1
        }
      }
    }
    // Handle trailing white run
    if (runStart !== -1) {
      const runLength = totalHeight - runStart
      if (runLength >= minWhiteRun) {
        whiteRuns.push({ start: runStart, end: totalHeight })
      }
    }

    if (whiteRuns.length === 0) {
      return [{ y: 0, height: totalHeight }]
    }

    // Compute cut points
    const cutPoints: number[] = []
    for (const run of whiteRuns) {
      let cutY: number
      if (cutPosition === 'middle') {
        cutY = Math.floor((run.start + run.end) / 2)
      } else {
        // before-color: cut at end of white run
        cutY = run.end
      }
      cutPoints.push(cutY)
    }

    // Build ranges from cut points
    const ranges: SliceRange[] = []
    let prevY = 0
    for (const cp of cutPoints) {
      if (cp > prevY) {
        ranges.push({ y: prevY, height: cp - prevY })
        prevY = cp
      }
    }
    if (prevY < totalHeight) {
      ranges.push({ y: prevY, height: totalHeight - prevY })
    }

    // Merge slices smaller than minSliceHeight with neighbors
    if (options.minSliceHeight > 0 && ranges.length > 1) {
      let i = 0
      while (i < ranges.length && ranges.length > 1) {
        if (ranges[i].height < options.minSliceHeight) {
          if (i === 0) {
            // First slice too small → merge with next
            ranges[1] = { y: ranges[0].y, height: ranges[0].height + ranges[1].height }
            ranges.splice(0, 1)
          } else {
            // Merge with previous
            ranges[i - 1] = {
              y: ranges[i - 1].y,
              height: ranges[i - 1].height + ranges[i].height
            }
            ranges.splice(i, 1)
          }
        } else {
          i++
        }
      }
    }

    return ranges
  }

  async fixedSlice(
    imageInput: ImageInput,
    options: FixedSliceOptions
  ): Promise<SliceFileInfo[]> {
    const { width, height } = await getImageDimensions(imageInput)

    const ranges = this.computeFixedSliceRanges(
      height,
      options.sliceHeight,
      options.startOffset
    )

    return this.sliceAndSave(imageInput, width, ranges, options)
  }

  async autoSlice(
    imageInput: ImageInput,
    options: AutoSliceOptions
  ): Promise<SliceFileInfo[]> {
    const { width, height } = await getImageDimensions(imageInput)

    let rawBuffer: Buffer
    let channels: number

    if (isRawInput(imageInput)) {
      rawBuffer = imageInput.buffer
      channels = imageInput.raw.channels
    } else {
      const { data, info } = await sharp(imageInput).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
      rawBuffer = data
      channels = info.channels
    }

    const isWhiteRow = this.analyzeWhiteRows(rawBuffer, width, height, options.whiteThreshold, channels)

    const ranges = this.computeAutoSliceRanges(isWhiteRow, {
      minWhiteRun: options.minWhiteRun,
      minSliceHeight: options.minSliceHeight,
      cutPosition: options.cutPosition
    })

    return this.sliceAndSave(imageInput, width, ranges, options)
  }

  private async sliceAndSave(
    imageInput: ImageInput,
    width: number,
    ranges: SliceRange[],
    options: {
      prefix: string
      padding: number
      outputDir: string
      startIndex: number
      thumbsDir?: string
      thumbWidth?: number
    }
  ): Promise<SliceFileInfo[]> {
    const results: SliceFileInfo[] = []

    for (let i = 0; i < ranges.length; i++) {
      const range = ranges[i]
      const index = options.startIndex + i
      const paddedIndex = String(index).padStart(options.padding, '0')
      const fileName = `${options.prefix}_${paddedIndex}.png`
      const filePath = join(options.outputDir, fileName)

      const extracted = toSharp(imageInput).extract({
        left: 0,
        top: range.y,
        width,
        height: range.height
      })

      // Clone before consuming the pipeline for the main file
      let thumbnailPath: string | undefined
      if (options.thumbsDir) {
        const thumbName = `${options.prefix}_${paddedIndex}.jpg`
        thumbnailPath = join(options.thumbsDir, thumbName)
        await extracted.clone().resize({ width: options.thumbWidth ?? 200 }).jpeg({ quality: 70 }).toFile(thumbnailPath)
      }

      await extracted.png().toFile(filePath)

      results.push({
        name: fileName,
        path: filePath,
        width,
        height: range.height,
        index,
        thumbnailPath
      })
    }

    return results
  }
}
