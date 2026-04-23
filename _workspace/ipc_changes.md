# PSD Support — Shared Contract

**No new IPC channels.** PSD plugs into the existing `SourceRenderer` dispatcher in `SourceService`.

## Shared constants (src/shared/constants/supported-formats.ts)

- `SUPPORTED_DOCUMENT_EXTENSIONS` → add `.psd`
  - Rationale: PSD behaves more like a document than a simple image (has its own render pipeline, scale setting, worker-backed parsing). Keeping it alongside `.pdf` lets the existing `isPdfFile`/`isImageFile` split remain stable and makes it easy for renderer code to gate UI (e.g. the PDF scale slider should NOT be shown for PSD, but we also want a distinct code path).
- New helper: `isPsdFile(filePath: string): boolean`
- `stripExtension` regex: extend to strip `.psd`
- `getDialogFilters()`:
  - "Supported Files" → add `psd`
  - Add new entry `{ name: 'PSD Files', extensions: ['psd'] }`
  - Add `psd` to Image Files? → **No.** PSD is not a plain raster image from the pipeline's perspective. Keep it separate.

## Dependency

- Add `ag-psd` (runtime dependency, not dev) to `package.json`.
- ag-psd is pure JS — no native bindings, no asarUnpack needed.
- Do NOT downgrade sharp/pdfjs versions.

## Main process

### New service: `src/main/services/psd.service.ts`
- Implements `SourceRenderer`
- Treats each PSD as a **single page** (composite/flattened canvas) — same convention as `ImageService`
- Parses the PSD in a dedicated worker thread to keep the main thread responsive for large files
- Produces RGBA buffer via ag-psd's `readPsd(buffer, { skipLayerImageData: true, skipThumbnail: true, useImageData: false })` → uses the composite `canvas` that ag-psd produces when composite data is present; falls back to layer rendering if only layers are present
- Uses `fs.promises.readFile` to slurp the file (PSD must be fully in memory to parse) — this is unavoidable with ag-psd

### New worker: `src/main/workers/psd.worker.ts`
- Receives `{ filePath, mode: 'dimensions' | 'render' }` via `workerData` or message
- On 'dimensions': returns `{ width, height }` using ag-psd's header-only parse (`readPsd(buffer, { skipLayerImageData: true, skipCompositeImageData: true, skipThumbnail: true })` which only reads the header/small sections)
- On 'render': returns transferable `ArrayBuffer` of RGBA + `{ width, height }`
- Uses `postMessage(..., [transferList])` to avoid copying the RGBA buffer back

### Wiring
- `src/main/index.ts`: `new SourceService(new PdfService(), new ImageService())` becomes `new SourceService(new PdfService(), new ImageService())` + `.addRenderer(isPsdFile, new PsdService())`
- `src/main/workers/job.worker.ts`: same `.addRenderer` call inside the worker's `execute()`

### Worker path resolution
- Mirror whatever pattern `JobExecutionService` uses for `job.worker.ts` path resolution (dev vs packaged). Check `createWorker` in `job-execution.service.ts`.

## Renderer

- `src/renderer/src/i18n/ko.ts` + `en.ts`:
  - `dropFileHere` → include PSD (e.g. `"PDF, 이미지, PSD 파일을 여기에 놓으세요"` / `"Drop PDF, image, or PSD files here"`)
- `src/renderer/src/components/OptionPanel.tsx`:
  - `showPdfScale` already gated on `isPdfFile(filePath)` → stays false for PSD (correct — no scale slider for PSD). **No change needed.**
- Any file-type badges / icons: if the UI shows file-type chips, add PSD to the label logic. Otherwise skip.

## Testing contract

- `psd.service.test.ts` — unit test with a small fixture PSD (create or use an existing test fixture). If no fixture is available, at minimum test the router integration.
- Update `source.service.ts`'s implicit coverage (isPsdFile routing) via a lightweight test.
- All existing tests must continue passing (no regressions in jpg/png/pdf paths).

## Non-goals

- Layer extraction / per-layer export — out of scope for this pass.
- PSB (large document format) support — ag-psd supports it, but file filter stays `.psd` only for now.
- Text layer rendering fidelity — ag-psd may not perfectly render text layers; accept composite if present, best-effort otherwise.
