import sharp from 'sharp'
import {join} from 'path'
import {open} from 'fs/promises'
import type {FileHandle} from 'fs/promises'
import type {CutPosition, SliceFileInfo} from '@shared/types'

type SliceRange = {
  y: number
  height: number
}

type RawImageInput = {
  buffer: Buffer
  raw: { width: number; height: number; channels: 4 }
}

/**
 * Disk-backed raw RGBA input. Used for merged sources whose decoded RGBA
 * payload (can exceed 1.5 GB) must not be held in a single Buffer.
 *
 * The file layout is: `headerOffset` bytes of opaque header, then
 * `width * height * channels` bytes of raw RGBA starting at `headerOffset`.
 * Callers stream only the ranges they need via `open()` + `read()`.
 */
type DiskRawInput = {
  kind: 'disk-raw'
  filePath: string
  headerOffset: number
  width: number
  height: number
  channels: 4
}

type ImageInput = Buffer | RawImageInput | DiskRawInput

function isRawInput(input: ImageInput): input is RawImageInput {
  return typeof input === 'object' && !Buffer.isBuffer(input) && 'raw' in input && 'buffer' in input
}

function isDiskRawInput(input: ImageInput): input is DiskRawInput {
  return typeof input === 'object' && !Buffer.isBuffer(input) && 'kind' in input && input.kind === 'disk-raw'
}

export type {DiskRawInput, RawImageInput, ImageInput}

// Merged PSD sources and long webtoon strips exceed Sharp's default ~268M
// pixel cap. Disable the cap for every Sharp open in the slicing pipeline.
const SHARP_INPUT_OPTIONS = { limitInputPixels: false } as const

/**
 * Peak memory budget for the streaming analyzeWhiteRows pass on disk-backed
 * inputs. Chosen to stay well under even modest device RAM while keeping the
 * number of syscalls per job reasonable (e.g. a 1500-wide × 270k-tall canvas
 * at 4 bytes/px is ~1.6 GB → ~16 read() calls at 100 MB each).
 */
const DISK_CHUNK_BYTES = 100 * 1024 * 1024

function toSharp(input: ImageInput): sharp.Sharp {
  if (isDiskRawInput(input)) {
    // Callers must not pass DiskRawInput through toSharp(); the slice path
    // reads stripes directly via a file handle and feeds them to sharp() with
    // the correct raw options. Surface a clear error if this invariant is ever
    // violated.
    throw new Error('toSharp() does not accept DiskRawInput — use streaming path')
  }
  if (isRawInput(input)) {
    return sharp(input.buffer, { ...SHARP_INPUT_OPTIONS, raw: input.raw })
  }
  return sharp(input, SHARP_INPUT_OPTIONS)
}

async function getImageDimensions(input: ImageInput): Promise<{ width: number; height: number }> {
  if (isDiskRawInput(input)) {
    return { width: input.width, height: input.height }
  }
  if (isRawInput(input)) {
    return { width: input.raw.width, height: input.raw.height }
  }
  const metadata = await sharp(input, SHARP_INPUT_OPTIONS).metadata()
  if (!metadata.width || !metadata.height) throw new Error('Cannot read image dimensions')
  return { width: metadata.width, height: metadata.height }
}

type FixedSliceOptions = {
  sliceHeight: number
  startOffset: number
  minSliceHeight?: number
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
    startOffset: number,
    minSliceHeight: number = 0
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

    // Merge last slice with previous if smaller than minSliceHeight
    if (minSliceHeight > 0 && ranges.length > 1) {
      const last = ranges[ranges.length - 1]
      if (last.height < minSliceHeight) {
        const prev = ranges[ranges.length - 2]
        ranges[ranges.length - 2] = { y: prev.y, height: prev.height + last.height }
        ranges.pop()
      }
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

  /**
   * Disk-streaming variant of analyzeWhiteRows for inputs that can't fit in
   * a single Buffer. Reads the file in ~100 MB chunks aligned to row
   * boundaries so each chunk can be analyzed with the same inner loop as the
   * in-memory variant, then released before the next read.
   */
  async analyzeWhiteRowsFromDisk(
    fh: FileHandle,
    width: number,
    height: number,
    headerOffset: number,
    channels: number,
    whiteThreshold: number
  ): Promise<boolean[]> {
    const result: boolean[] = new Array(height)
    const rowBytes = width * channels

    // Guard against pathological width (rowBytes > chunk budget).
    const rowsPerChunk = Math.max(1, Math.floor(DISK_CHUNK_BYTES / rowBytes))
    const chunkBytes = rowsPerChunk * rowBytes
    const chunkBuf = Buffer.alloc(chunkBytes)

    let y = 0
    while (y < height) {
      const rowsThisChunk = Math.min(rowsPerChunk, height - y)
      const bytesThisChunk = rowsThisChunk * rowBytes
      const fileOffset = headerOffset + y * rowBytes
      const { bytesRead } = await fh.read(chunkBuf, 0, bytesThisChunk, fileOffset)
      if (bytesRead < bytesThisChunk) {
        throw new Error(
          `analyzeWhiteRowsFromDisk: short read at row ${y} ` +
            `(${bytesRead}/${bytesThisChunk} bytes at offset ${fileOffset})`
        )
      }

      const rowsAnalyzed = this.analyzeWhiteRows(
        chunkBuf,
        width,
        rowsThisChunk,
        whiteThreshold,
        channels
      )
      for (let i = 0; i < rowsThisChunk; i++) result[y + i] = rowsAnalyzed[i]

      y += rowsThisChunk
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
      options.startOffset,
      options.minSliceHeight ?? 0
    )

    return this.sliceAndSave(imageInput, width, ranges, options)
  }

  async autoSlice(
    imageInput: ImageInput,
    options: AutoSliceOptions
  ): Promise<SliceFileInfo[]> {
    const { width, height } = await getImageDimensions(imageInput)

    let isWhiteRow: boolean[]

    if (isDiskRawInput(imageInput)) {
      // Stream the raw RGBA off disk in ~100 MB chunks. This is the only
      // branch that handles canvases larger than available Buffer capacity.
      const fh = await open(imageInput.filePath, 'r')
      try {
        isWhiteRow = await this.analyzeWhiteRowsFromDisk(
          fh,
          imageInput.width,
          imageInput.height,
          imageInput.headerOffset,
          imageInput.channels,
          options.whiteThreshold
        )
      } finally {
        await fh.close()
      }
    } else if (isRawInput(imageInput)) {
      isWhiteRow = this.analyzeWhiteRows(
        imageInput.buffer,
        width,
        height,
        options.whiteThreshold,
        imageInput.raw.channels
      )
    } else {
      const { data, info } = await sharp(imageInput, SHARP_INPUT_OPTIONS)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true })
      isWhiteRow = this.analyzeWhiteRows(data, width, height, options.whiteThreshold, info.channels)
    }

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

    // Disk-backed inputs: open the file handle once and reuse across all
    // ranges. Reopening per range would be correct but wasteful (each slice
    // issues only a single pread syscall, so the overhead per range is all
    // kernel bookkeeping).
    let diskFh: FileHandle | null = null
    if (isDiskRawInput(imageInput)) {
      diskFh = await open(imageInput.filePath, 'r')
    }

    try {
      for (let i = 0; i < ranges.length; i++) {
        const range = ranges[i]
        const index = options.startIndex + i
        const paddedIndex = String(index).padStart(options.padding, '0')
        const fileName = `${options.prefix}_${paddedIndex}.png`
        const filePath = join(options.outputDir, fileName)

        // For raw RGBA input (merged PSD, PDF pages), byte-slice the buffer
        // with subarray() — a view, no copy — so Sharp only sees each
        // stripe's bytes. This avoids libvips holding the entire source image
        // in memory for every extract() call, which previously blew up the
        // worker heap on merged sources (600M+ pixels × 30 slices).
        //
        // For disk-backed raw RGBA, read only this stripe's bytes from disk.
        const stripeSharp = await (async () => {
          if (isDiskRawInput(imageInput)) {
            if (!diskFh) throw new Error('Disk handle missing')
            const rowBytes = imageInput.width * imageInput.channels
            const sliceBytes = range.height * rowBytes
            const sliceBuf = Buffer.alloc(sliceBytes)
            const fileOffset = imageInput.headerOffset + range.y * rowBytes
            const { bytesRead } = await diskFh.read(sliceBuf, 0, sliceBytes, fileOffset)
            if (bytesRead < sliceBytes) {
              throw new Error(
                `Short read at slice ${i} (y=${range.y}, h=${range.height}): ` +
                  `${bytesRead}/${sliceBytes} bytes at offset ${fileOffset}`
              )
            }
            return sharp(sliceBuf, {
              ...SHARP_INPUT_OPTIONS,
              raw: {
                width: imageInput.width,
                height: range.height,
                channels: imageInput.channels
              }
            })
          }
          if (isRawInput(imageInput)) {
            const rowBytes = imageInput.raw.width * imageInput.raw.channels
            const start = range.y * rowBytes
            const end = start + range.height * rowBytes
            const sliceView = imageInput.buffer.subarray(start, end)
            return sharp(sliceView, {
              ...SHARP_INPUT_OPTIONS,
              raw: {
                width: imageInput.raw.width,
                height: range.height,
                channels: imageInput.raw.channels
              }
            })
          }
          return toSharp(imageInput).extract({
            left: 0,
            top: range.y,
            width,
            height: range.height
          })
        })()

        // Clone before consuming the pipeline for the main file
        let thumbnailPath: string | undefined
        if (options.thumbsDir) {
          const thumbName = `${options.prefix}_${paddedIndex}.jpg`
          thumbnailPath = join(options.thumbsDir, thumbName)
          await stripeSharp.clone().resize({ width: options.thumbWidth ?? 200 }).jpeg({ quality: 70 }).toFile(thumbnailPath)
        }

        await stripeSharp.png().toFile(filePath)

        results.push({
          name: fileName,
          path: filePath,
          width,
          height: range.height,
          index,
          thumbnailPath
        })
      }
    } finally {
      if (diskFh) await diskFh.close()
    }

    return results
  }
}
