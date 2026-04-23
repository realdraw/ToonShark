# Main Developer — PSD Support Implementation Changes

## Installed packages
- `ag-psd@30.1.1` (runtime dependency, pure JS — no asarUnpack needed)

## Files changed / created (absolute paths)

### Shared contracts
- `/Users/beni/ToonShark_realdraw/src/shared/constants/supported-formats.ts` — added `.psd` to `SUPPORTED_DOCUMENT_EXTENSIONS`; added `isPsdFile()` helper; extended `stripExtension` regex to cover `.psd`; added `PSD Files` entry + `psd` to "Supported Files" in `getDialogFilters()`; kept PSD out of `SUPPORTED_IMAGE_EXTENSIONS` and out of "Image Files" filter per contract.
- `/Users/beni/ToonShark_realdraw/src/shared/constants/index.ts` — re-exported `isPsdFile`.

### Main process
- `/Users/beni/ToonShark_realdraw/src/main/services/psd.service.ts` (new) — `SourceRenderer` implementation. Delegates parsing to `psd.worker` via `workerData: { mode, filePath }`. Single-page convention mirroring `ImageService`. `getWorkerPath()`/`createWorker()` are `protected` for test injection.
- `/Users/beni/ToonShark_realdraw/src/main/workers/psd.worker.ts` (new) — reads PSD via ag-psd, initializes `@napi-rs/canvas` via `initializeCanvas()` as a fallback. `dimensions` mode uses header-only parse (`skipLayerImageData`, `skipCompositeImageData`, `skipThumbnail`). `render` mode uses `useImageData: true` so RGBA bytes come back in `psd.imageData.data` without canvas round-trip; returns transferable `ArrayBuffer` via `postMessage(..., [buffer])`. Canvas path is kept as a fallback.
- `/Users/beni/ToonShark_realdraw/src/main/index.ts` — imported `PsdService` + `isPsdFile`; added `sourceService.addRenderer(isPsdFile, new PsdService())` right after `SourceService` construction.
- `/Users/beni/ToonShark_realdraw/src/main/workers/job.worker.ts` — same wiring as main process. Commented the intentional nested-worker model (job.worker → psd.worker) — it keeps CPU-heavy PSD parsing off the job worker's event loop so progress keeps flowing for very large files.

### Build config
- `/Users/beni/ToonShark_realdraw/electron.vite.config.ts` — added `workers/psd.worker` input so electron-vite emits `dist-electron/main/workers/psd.worker.js` alongside the existing job worker.

### Tests
- `/Users/beni/ToonShark_realdraw/src/main/services/psd.service.test.ts` (new) — 7 tests:
  - `getPageDimensions`: correct dimensions, rejects on missing file, rejects on corrupted file.
  - `renderAllPagesRaw`: single onPage call with `pageNumber=1`, `pageCount=1`, RGBA buffer of exactly `W*H*4` bytes; rejects on missing file.
  - `SourceService` routing: `.psd` routes to registered PSD renderer; `.jpg` does not touch the PSD renderer.
  - Fixtures are generated at runtime via ag-psd's `writePsdBuffer` (a 120x80 and a 64x48 solid-color PSD). The worker is exercised against the built `dist-electron/main/workers/psd.worker.js`, gated with `describe.runIf(hasBuiltWorker)` so the test is self-describing even if the build output is missing.

## Test results
- `npx vitest run src/main/services/psd.service.test.ts` — **7/7 passed** (196 ms).
- `npx vitest run` (full suite) — **460/460 passed across 27 files** (3.07 s). No regressions in jpg/png/pdf paths.
- `npx electron-vite build` — clean build; new `workers/psd.worker.js` (2.33 kB) emitted.
- `npx tsc --noEmit -p tsconfig.node.json` — no errors.

## Contract compliance
- No new IPC channels were introduced. PSD plugs into the existing `SourceRenderer` dispatcher in `SourceService` exactly as specified in `_workspace/ipc_changes.md`.
- `getDialogFilters()` placement matches the contract: PSD is in "Supported Files" and gets its own "PSD Files" group, but is NOT added to "Image Files".
- `isPdfFile`/`isImageFile` semantics unchanged — PSD is neither PDF nor a plain raster image from the pipeline's view, preserving existing renderer gating (e.g. `showPdfScale` stays false for PSD without any renderer changes).

## Constraints / follow-ups discovered
- **Nested worker**: `job.worker` spawns `psd.worker`. Node supports this, but each PSD slicing run now creates a second worker thread. Acceptable for the intended workload; progress messaging benefits from it. Documented inline in `job.worker.ts`.
- **Full-file memory**: ag-psd requires the PSD to be fully in memory (`fs.readFile`). For multi-GB PSDs the renderer / OS may exhibit memory pressure. Acceptable per contract ("unavoidable with ag-psd").
- **Composite fallback**: the worker prefers `psd.imageData` (from `useImageData: true`). The canvas fallback path is present but untested here because every PSD ag-psd writes carries `imageData`. If a real-world PSD lacks a composite AND has layers, ag-psd's layer-compositing path would be exercised through the canvas fallback; consider adding an integration test with such a PSD later.
- **Type casting around ag-psd**: `initializeCanvas` is typed for `HTMLCanvasElement`. We inject `@napi-rs/canvas`'s `createCanvas` result, cast through `unknown`. Equivalent pattern used by `pdf.service.ts` for `page.render({ canvas: canvas as any })`. No runtime issue.
- **PSB (Large Document Format)**: out of scope. File filter stays `.psd` only. `writePsdBuffer(..., { psb: false })` reinforces this in the test helper.
- **Layer extraction / text fidelity**: out of scope. Composite is used as-is.
- **Renderer-side changes**: i18n strings (dropFileHere) and any PSD UI labeling are the renderer-developer's responsibility per the contract. Main process is complete.
