# QA Report — PSD Support (2026-04-22)

Verifier: qa-inspector
Scope: Cross-boundary integrity between main, preload, renderer, and shared contracts for PSD input support. Build + full vitest re-run.

## 1. 공유 계약 (shared/constants)

- [PASS] `.psd` in `SUPPORTED_DOCUMENT_EXTENSIONS` — `src/shared/constants/supported-formats.ts:2` contains `['.pdf', '.psd']`.
- [PASS] `isPsdFile` implemented — `supported-formats.ts:22-24`, returns true for `.psd` only, case-insensitive via `getFileExtension`.
- [PASS] `.psd` NOT in `SUPPORTED_IMAGE_EXTENSIONS` — matches contract (PSD is document, not plain image).
- [PASS] `stripExtension` handles `.psd` — regex `/\.(pdf|psd|jpe?g|png)$/i` at `supported-formats.ts:33`. `"foo.psd"` → `"foo"`, `"foo.PSD"` → `"foo"`.
- [PASS] `getDialogFilters()` — `supported-formats.ts:37-44`:
  - "Supported Files" includes `psd` ✓
  - "PSD Files" entry exists with `['psd']` ✓
  - "Image Files" does NOT include `psd` ✓ (contract-compliant)
- [PASS] `isPsdFile` re-exported from `src/shared/constants/index.ts:11`.
- [PASS] Shared constants test suite — `src/shared/constants/index.test.ts` 45 tests passing (covers new PSD cases via existing generic patterns).

## 2. IPC / Type 경계면 정합성

- [PASS] No new IPC channels introduced. Preload (`src/preload/index.ts`) untouched — verified visually (no PSD-related methods needed). Renderer store / hook interfaces unchanged. Contract says "No new IPC channels" — upheld.
- [PASS] `isPsdFile` import path is identical in main and (potentially) renderer: both would resolve through `@shared/constants/supported-formats`.
  - `src/main/index.ts:11` → `import {isPsdFile} from '@shared/constants/supported-formats'`
  - `src/main/workers/job.worker.ts:12` → same import
  - Renderer did not need to import `isPsdFile` (design choice documented in renderer-developer_changes.md); any future use goes through the same shared barrel.
- [PASS] `SourceRenderer` interface fully satisfied by `PsdService`:
  - `getPageDimensions(filePath): Promise<{width, height}>` — `psd.service.ts:68-74` ✓
  - `renderAllPagesRaw(filePath, scale, onPage): Promise<number>` — `psd.service.ts:76-94` ✓
  - Signatures exactly match `src/main/services/source-renderer.ts:11-19`.
- [PASS] `PsdService.renderAllPagesRaw` accepts and ignores `scale` (renamed `_scale`) — correct; PSD composite is at native resolution, scale is a no-op per contract.
- [PASS] Main index and job.worker register the renderer identically:
  - `src/main/index.ts:116-117`: `new SourceService(pdf, image)` + `sourceService.addRenderer(isPsdFile, new PsdService())`
  - `src/main/workers/job.worker.ts:36-41`: same wiring
  - Order: image is the fallback (`SourceService` constructor sets `fallback = imageRenderer`). PSD + PDF are explicit testers. `.psd` matches `isPsdFile` before falling through to image — routing is correct.

## 3. Worker path 해결

- [PASS] `PsdService.getWorkerPath()` — `psd.service.ts:27-29` uses `join(__dirname, 'workers', 'psd.worker.js')`, identical pattern to `JobExecutionService.getWorkerPath()` at `job-execution.service.ts:59-61`. Works in both dev (electron-vite outputs `dist-electron/main/workers/psd.worker.js` from dev server) and packaged (ASAR resolves `__dirname` to `dist-electron/main` inside app.asar).
- [PASS] `electron.vite.config.ts:14` — rollup input `'workers/psd.worker'` added alongside the job worker.
- [PASS] Build emits `dist-electron/main/workers/psd.worker.js` (2.33 kB) — verified in `npx electron-vite build` output and on disk at `/Users/beni/ToonShark_realdraw/dist-electron/main/workers/psd.worker.js`.

## 4. 빌드 / 타입체크

- [PASS] `npx tsc --noEmit -p tsconfig.node.json` — 0 errors.
- [PASS] `npx tsc --noEmit -p tsconfig.json` — 0 errors.
- [WARN] `npx tsc --noEmit -p tsconfig.web.json` — 3 errors, **all pre-existing, unrelated to PSD**:
  - `src/renderer/src/pages/ExportPage.dom.test.tsx:179` — `Property 'at' does not exist on type 'Toast[]'`
  - `src/renderer/src/pages/WorkspacePage.dom.test.tsx:168,183` — same `Toast[]` `.at()`
  - Root cause: `lib` compiler option older than ES2022. Not introduced by the PSD changes (the PSD commit touches only `i18n/*.ts` and `HomePage.tsx:213` in the renderer — none of these files nor `Toast[]`). Last commit touching the failing test files: `41a35fb` (image slice feature, pre-existing).
  - **Out of scope** for this task; should be fixed separately by bumping the web tsconfig `lib` to `ES2022` or using `arr[arr.length-1]` in tests.
- [PASS] `npx electron-vite build` — clean. Emits: main `index.js` 62.76 kB, `workers/job.worker.js` 5.07 kB, `workers/psd.worker.js` 2.33 kB, preload `index.js` 2.76 kB, renderer bundle.

## 5. 테스트

- [PASS] `npx vitest run` — **460/460 passed across 27 files** (3.06 s). No regressions.
- [PASS] `src/main/services/psd.service.test.ts` — **7/7 passed** (214 ms). Covers:
  - `getPageDimensions` correct dimensions, rejects missing file, rejects corrupted file.
  - `renderAllPagesRaw` single onPage call with `pageNumber=1`, `pageCount=1`, buffer length `W*H*4`, rejects missing file.
  - `SourceService` routes `.psd` to PSD renderer, does NOT route `.jpg` to PSD renderer.
- [PASS] The `describe.runIf(hasBuiltWorker)` gate confirmed: built worker exists at `dist-electron/main/workers/psd.worker.js`, so the full PsdService suite actually executed (not skipped).
- [PASS] PDF (`pdf.service.test.ts` 7, `pdf.service.integration.test.ts` 1, `pdf-folder-resolution.test.ts` 17), image, slice (58), export (39), job-execution (25), handlers (9), preload (7), shared constants (45), renderer DOM suites — all green.

## 6. Dependency 위생

- [PASS] `ag-psd` in `dependencies` (not devDependencies) — `package.json:108-119` block lists `"ag-psd": "^30.1.1"`.
- [PASS] Version `30.1.1` installed and present in `package-lock.json` (grep returns a match).
- [PASS] No unrelated dep changes (spot check of `package.json` diff vs HEAD).
- [PASS] ag-psd main entry `dist/index.js` exists and exposes `initializeCanvas`, `readPsd`, `writePsdBuffer` (used by worker and test).

## 7. Electron-builder packaging

- [PASS] `package.json.build.asarUnpack` unchanged — correct. ag-psd is pure JS; no native binding requires unpack. Existing entries (`sharp`, `@napi-rs/canvas`) untouched.
- [PASS] `build.files` filter `!node_modules/**/*.{md,ts,map}` excludes `.ts` and `.d.ts` (types) and source maps, but ag-psd's runtime is `*.js` files in `node_modules/ag-psd/dist/` — those are kept. Verified by inspecting `dist/` listing (`.js` and `.js.map`; the `.map` files exclusion is intentional and safe at runtime).
- [PASS] `build.files` inclusion `node_modules/**/*` ensures `ag-psd` ships in the packaged app.
- Note: `@napi-rs/canvas` is already in `asarUnpack` (needed because it loads native `.node` bindings at runtime). The PSD worker uses `@napi-rs/canvas` — wiring is pre-existing; no change needed.

## 8. 런타임 동작 정적 분석

- [PASS] `src/main/index.ts:7-11,116-117` — imports `PsdService` and `isPsdFile`, calls `sourceService.addRenderer(isPsdFile, new PsdService())` immediately after `SourceService` construction.
- [PASS] `src/main/workers/job.worker.ts:7,12,36-41` — same wiring inside the worker's `execute()`. Inline comment documents the nested-worker intention.
- [PASS] Renderer UI:
  - `HomePage.tsx:213` — empty-state label `"PDF / JPG / PNG / PSD"` (hardcoded, intentional).
  - `HomePage.tsx:216,223` — `{t.dropFileHere}` binds i18n; both `ko.ts:21` and `en.ts:222` updated with PSD mention.
  - `OptionPanel.tsx` uses `isPdfFile(filePath)` for `showPdfScale` — PSD returns false → scale slider hidden. Contract-aligned, no change needed.
  - `WorkspacePage.tsx` gates `pdfScale` param by `isPdfFile(activeFilePath)` — PSD omits `pdfScale`, which `PsdService.renderAllPagesRaw` ignores anyway. Consistent.
  - `useFileDrop.ts` uses `isSupportedFile()` (shared) — `.psd` flows through automatically.
  - File-type chips via `getFileExtension().toUpperCase()` — PSD automatically shown as `PSD`.
- [PASS] i18n key `dropFileHere` exists in both locales and is consumed by `HomePage.tsx`.

## 9. 문서 / 주석

- [PASS] `psd.service.ts:14-21` — header JSDoc explains single-page convention, worker offloading, transferable buffer rationale.
- [PASS] `psd.worker.ts:7-13` — comments explain `initializeCanvas` fallback rationale and why Node's worker doesn't have `HTMLCanvasElement`.
- [PASS] `job.worker.ts:37-40` — comment documents the intentional nested-worker pattern (job.worker → psd.worker).
- [INFO] No security issues noted; PSD parsing is fully in a worker with a hard upper bound on unexpected behavior (worker exit → rejected promise).

## 수정한 파일

**없음.** All cross-boundary checks passed. The three pre-existing tsc errors in renderer DOM tests (`Toast[].at()`) are out of scope and were present on `main` before the PSD work (last touched in `41a35fb`, the image-slice commit).

## 최종 빌드 / 테스트 결과

- `npx tsc --noEmit -p tsconfig.node.json`: **0 errors**
- `npx tsc --noEmit -p tsconfig.json`: **0 errors**
- `npx tsc --noEmit -p tsconfig.web.json`: **3 errors, all pre-existing, unrelated to PSD** (WARN — see §4)
- `npx electron-vite build`: **clean**; `psd.worker.js` (2.33 kB) and `job.worker.js` (5.07 kB) emitted
- `npx vitest run`: **460 tests passed across 27 files** (3.06 s); PSD suite 7/7

## 배포 / 런타임 주의사항

1. **실제 PSD 파일 end-to-end 수동 테스트 필요.** The automated suite uses ag-psd-generated test fixtures (120×80 and 64×48 with a solid-color `imageData`). Real-world PSDs often lack composite `imageData` and rely on layer reconstruction, which exercises the canvas fallback path in `psd.worker.ts:73-89`. Suggested manual smoke: (a) modern Photoshop save with "Maximize Compatibility" on (composite present — fast path), (b) layered PSD saved without compat mode (canvas fallback), (c) large (>500 MB) PSD (memory pressure check), (d) full end-to-end slicing from HomePage drop → Workspace → Export.
2. **Nested worker thread model.** `job.worker` spawns `psd.worker` for each slicing run. Intended and documented; keeps progress messages flowing during heavy PSD parse. No action needed; just be aware when profiling thread counts.
3. **Full-file memory.** ag-psd requires the entire PSD in memory. For multi-GB PSDs, expect RSS spikes. Contract-acknowledged.
4. **PSB unsupported.** File filter is `.psd` only; ag-psd technically supports PSB but we haven't whitelisted it. If user feedback requests, adding `psb` to `getDialogFilters()` and `isPsdFile` is a one-line change.
5. **Pre-existing web tsconfig errors.** Unrelated to this PR. Fix separately: bump `lib` to `ES2022` in `tsconfig.web.json` or switch `arr.at(-1)` to `arr[arr.length - 1]` in the two DOM test files. Does not block PSD shipping.

## 전체 판정

**READY TO SHIP.**

All PSD-specific cross-boundary checks pass. Build clean, 460/460 tests green, cross-process wiring (main + job.worker) consistent, shared contracts honored, renderer UI reachable via existing helpers. Only outstanding issue is pre-existing renderer typecheck noise that this PR did not introduce and does not affect runtime. Recommend manual smoke-testing with at least one real-world PSD (especially a layered one without a composite) before cutting a release, to exercise the canvas fallback in the worker.
