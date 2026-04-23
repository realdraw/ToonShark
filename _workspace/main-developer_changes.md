# Main Developer — Merged Source Native Crash Fix

## Problem
30 PSDs × 200 MB merged to 1500 × 269963 (~400 M px, ~1.6 GB raw RGBA) TIFF succeeded, but slice start triggered an instant Electron-wide restart with no JS error. Root cause: `ImageService.renderAllPagesRaw` called `sharp(tiff).ensureAlpha().raw().toBuffer()`, forcing libvips to allocate the full 1.6 GB raw RGBA decode outside the V8 heap. Native malloc failure → process segfault → Electron auto-restart.

## Solution
New internal `.rgba` container format (8-byte header + raw RGBA payload) emitted directly by the merge worker, consumed by a new disk-backed `SourceRenderer`. Sharp/libvips never decodes the merged canvas; slicing streams chunks straight off disk.

## Files Changed

### New files
- `/Users/beni/ToonShark_realdraw/src/main/services/raw-rgba-source.service.ts`
  - `RawRgbaSourceService` implementing `SourceRenderer`.
  - `getPageDimensions` reads only the 8-byte header (O(1), no payload read).
  - `renderAllPagesRaw` validates `size == 8 + w*h*4` then yields one `DiskBackedPageResult`.
- `/Users/beni/ToonShark_realdraw/src/main/services/raw-rgba-source.service.test.ts`
  - 6 tests: header parsing, truncation, zero dims, disk-backed page shape, size-mismatch rejection, scale-ignored.
- `/Users/beni/ToonShark_realdraw/src/shared/constants/supported-formats.test.ts`
  - 9 tests: stripExtension coverage (including `.rgba`), `isRawRgbaFile`, `isInternalPipelineFile`, and the critical invariant that `.rgba` is NOT in `isSupportedFile`.

### Modified files

#### `/Users/beni/ToonShark_realdraw/src/shared/constants/supported-formats.ts`
- Added `isRawRgbaFile(filePath)` and `isInternalPipelineFile(filePath)` helpers.
- `.rgba` intentionally NOT added to `SUPPORTED_IMAGE_EXTENSIONS` (users must not drop internal artifacts).
- `stripExtension` regex extended to `.rgba` (clean workspace tab labels).

#### `/Users/beni/ToonShark_realdraw/src/shared/constants/index.ts`
- Re-exports `isRawRgbaFile`, `isInternalPipelineFile`.

#### `/Users/beni/ToonShark_realdraw/src/main/services/source-renderer.ts`
- New `DiskBackedPageResult` union member (`kind: 'disk'` + filePath + headerOffset + dims + channels).
- `SourcePage` union + `isDiskBackedPage` type guard.
- `SourceRenderer.renderAllPagesRaw` `onPage` now accepts `SourcePage` (either legacy `RawPageResult` or `DiskBackedPageResult`).

#### `/Users/beni/ToonShark_realdraw/src/main/workers/psd-merge.worker.ts`
- Removed Sharp import, `sharp.concurrency(1)`, Pass 3 (TIFF encode), and Sharp metadata verify.
- Pass 2 renamed `writeRgbaFile` — writes 8-byte header (width/height LE) at offset 0, then streams stripes at `header + y*rowBytes`. Staging + final output are the same file (no copy).
- New verify step: `fs.stat` → size must equal `8 + maxWidth*totalHeight*4`; throws otherwise.
- Progress phase `encode` retained for UI continuity but now just reports the verify step.

#### `/Users/beni/ToonShark_realdraw/src/main/services/psd-merge.service.ts`
- Output extension `.tiff` → `.rgba`.
- Header comment updated to describe the new pipeline and routing.

#### `/Users/beni/ToonShark_realdraw/src/main/services/slice.service.ts`
- New `DiskRawInput` type: `{ kind, filePath, headerOffset, width, height, channels }`.
- `ImageInput = Buffer | RawImageInput | DiskRawInput`.
- New `analyzeWhiteRowsFromDisk(fh, width, height, headerOffset, channels, threshold)` — streams ~100 MB row-aligned chunks, reuses in-memory analyzer per chunk. Bounded memory regardless of canvas height.
- `autoSlice` branches to disk-backed analysis when input is `DiskRawInput`.
- `sliceAndSave` opens the `.rgba` file handle ONCE at entry, reads per-stripe bytes via `fh.read(buf, 0, sliceBytes, headerOffset + y*rowBytes)`, feeds Sharp raw options, closes handle in `finally`.

#### `/Users/beni/ToonShark_realdraw/src/main/services/slice-pipeline.ts`
- `pageToSliceInput` helper converts `SourcePage` → `RawImageInput | DiskRawInput`.
- Rendered PNG archive generation skipped entirely for disk-backed pages (they are always huge merged sources and the archive is never read).
- Renamed callback param `raw` → `pageResult` to avoid confusion with the raw field.

#### `/Users/beni/ToonShark_realdraw/src/main/index.ts`
- Registers `RawRgbaSourceService` via `sourceService.addRenderer(isRawRgbaFile, ...)`.
- Routing order: PDF → PSD → RawRGBA → ImageService (fallback).

#### `/Users/beni/ToonShark_realdraw/src/main/workers/job.worker.ts`
- Same RawRgbaSourceService registration as main/index.ts so worker-thread execution and main-thread execution behave identically.

#### `/Users/beni/ToonShark_realdraw/src/main/ipc/handlers.ts`
- `get-source-dimensions` now accepts `isSupportedFile(path) || isInternalPipelineFile(path)`. `.rgba` is explicitly gated as "internal, but addressable for dimension queries from the tab the renderer just opened from the merge result."

#### `/Users/beni/ToonShark_realdraw/src/main/services/job-repository.ts`
- Source-folder scans (`getSourceOnlyInfo`, `findOrCreateJobFolder`) now match `isSupportedFile(entry) || isInternalPipelineFile(entry)` so jobs derived from merged sources remain discoverable across restarts.

#### `/Users/beni/ToonShark_realdraw/src/main/services/psd-merge.service.test.ts`
- Removed Sharp-based TIFF mock. Inline worker now produces a valid `.rgba` file (8-byte LE header + opaque-white RGBA payload).
- Assertions now verify:
  - `outputPath` matches `toonshark-merged[\\/]merged_\d+_[0-9a-f]{8}\.rgba$`
  - File size == `8 + width*height*4`
  - Header round-trips width/height via `readUInt32LE`.
- Width-mismatch test checks padded canvas size.

#### `/Users/beni/ToonShark_realdraw/src/main/services/slice.service.test.ts`
- New `DiskRawInput path` block with 4 tests:
  - `fixedSlice` reads stripes from disk and preserves widths/heights.
  - `autoSlice` streams the file and finds white-row cuts.
  - Disk and in-memory paths produce byte-identical ranges for equivalent input.
  - `analyzeWhiteRowsFromDisk` correctly handles multi-row canvases across chunk boundaries.

## Test Results
- `npx vitest run`: **30 files passed, 490 tests passed** (2.89s).
- `npx electron-vite build`: **succeeded** (main 66 kB, preload 2.85 kB, renderer 811 kB, workers built cleanly including psd-merge.worker.js 4.51 kB).

## Memory Profile
- **Before**: `sharp(tiff).ensureAlpha().raw().toBuffer()` forced a single libvips allocation of `maxWidth × totalHeight × 4` bytes. On the repro (1500 × 269963) this is **~1.62 GB native**, outside V8's view, so `--max-old-space-size` was irrelevant. libvips malloc failure → process segfault → Electron restart.
- **After, worker**: stripe buffer per PSD capped at `maxWidth × sourceHeight × 4` (typical ~80 MB for 1500 × 13500), released before the next iteration. Peak ≈ 1 stripe + 1 source PSD buffer.
- **After, slicing**:
  - `analyzeWhiteRowsFromDisk`: one 100 MB chunk buffer, reused across all chunks.
  - `sliceAndSave`: one `range.height × rowBytes` Buffer per range (typical ~6 MB for a 1500 × 1000 slice). Released between iterations.
  - File handle: opened once, reused across all slices, closed in `finally`.
- **Net impact**: peak slicing memory dropped from **~1.6 GB native (uncontrollable)** to **~100 MB resident (bounded)**. Previous crash path eliminated.

## Renderer Impact
- `WorkspacePage` receives the merged `.rgba` path via `addFileByPath(result.outputPath)` and renders a workspace tab. The tab label is derived from `extractSourceName` → `stripExtension` which now also strips `.rgba` (verified in `supported-formats.test.ts`).
- `OptionPanel` calls `window.api.getSourceDimensions(resolvedFilePath)`. The IPC handler accepts `.rgba` via `isInternalPipelineFile`. Dimensions display correctly.
- **No `<img>` paths reference the merged source** (searched `toLocalFileUrl` usages; only slice result thumbnails are rendered as images). No UI regression expected.
- `useFileDrop` still rejects `.rgba` via `isSupportedFile` — users cannot accidentally re-drop a merge artifact. This is the correct safety posture.

## IPC Changes
- `get-source-dimensions` now accepts filepaths ending in `.rgba` in addition to the existing supported extensions. No new channel; contract unchanged.
- `merge-psd-sources` still returns `MergePsdResult { outputPath, width, height, sourceCount }`; only the `outputPath` extension changed from `.tiff` to `.rgba`. Wire format unchanged.

## Follow-ups / Recommendations
1. **`.rgba` tempfile lifecycle**: Merge outputs land in `os.tmpdir()/toonshark-merged/` and persist until manual cleanup. The copy in `jobs/<id>/source/` is the durable reference. A housekeeping routine could prune tmpdir entries older than N days.
2. **Drop-gate hardening**: `useFileDrop` already rejects `.rgba` via `isSupportedFile`. If a future UI path ever exposes raw file-path entry, ensure it also gates through `isSupportedFile` (not `isInternalPipelineFile`).
3. **Rendered PNG archive**: Now always skipped for disk-backed pages. Consider whether the pixel-budget check for in-memory pages (50 M px) needs tuning for PDF exports now that the merged-source path no longer contributes to the worry.
4. **Chunk size**: `DISK_CHUNK_BYTES = 100 MB` is conservative; a future profile on SSDs could raise this to reduce syscall count without memory risk.
5. **Header versioning**: The current `.rgba` format is v0 (magic-less 8-byte header). If future variants are needed (different channel counts, compression), consider adding a 4-byte magic + version prefix.
