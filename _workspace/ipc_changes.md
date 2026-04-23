# PSD Merge — Shared Contract

Feature: When the user drops/selects **2 or more PSD files at once**, offer to vertically concatenate them into a single tall PNG and open that as one workspace tab.

## Trigger logic (renderer)

`useFileDrop` currently returns `paths[]`. No change to the hook. The *caller* (HomePage, WorkspacePage) decides:

```
if (paths.length >= 2 && paths.every(isPsdFile)) {
  open MergePsdModal with paths
} else {
  existing: paths.forEach(addFileByPath)
}
```

**Mixed selections** (e.g. 1 PSD + 1 PDF, or 3 PNGs) → fall back to individual tab open. Only pure PSD multi-select triggers merge.

**Single PSD** → existing flow (direct tab). Merge modal only appears for 2+.

## Shared types (add to `src/shared/types/index.ts`)

```typescript
export interface MergePsdRequest {
  filePaths: string[]       // Absolute paths, user-provided order
}

export interface MergePsdResult {
  outputPath: string        // Absolute path to merged PNG (OS temp dir)
  width: number
  height: number
  sourceCount: number       // Convenience: filePaths.length
}
```

## IPC

### New channel: `merge-psd-sources`
- Handler: invoke
- Request: `MergePsdRequest`
- Response: `MergePsdResult`
- Errors: throw; renderer catches and shows toast
- **No progress events for MVP** — modal shows a generic spinner. Can add progress channel later if users complain.

### Preload bridge
Add to `src/preload/index.ts`'s `api`:
```typescript
mergePsdSources: (payload: MergePsdRequest): Promise<MergePsdResult> =>
  ipcRenderer.invoke('merge-psd-sources', payload),
```

## Main process design

### New service: `src/main/services/psd-merge.service.ts`

```typescript
class PsdMergeService {
  constructor(private psdService: PsdService) {}

  async merge(filePaths: string[]): Promise<MergePsdResult>
}
```

Algorithm:
1. For each path: use `psdService.renderAllPagesRaw` to obtain RGBA + dims (single page per PSD, page 1)
2. `maxWidth = Math.max(...widths)`, `totalHeight = sum(heights)`
3. For each RGBA: if `width < maxWidth`, pad right with **opaque white `#ffffff` (alpha 255)** to `maxWidth` — Sharp `.extend({ right: maxWidth - w, background: { r:255,g:255,b:255,alpha:1 } })`
4. Compose with Sharp: `sharp({ create: { width: maxWidth, height: totalHeight, channels: 4, background: '#ffffff' } }).composite([...offset entries])`
5. Encode PNG, write to `os.tmpdir() + '/toonshark-merged/merged_{epochMs}_{hash8}.png'`
   - Ensure dir exists
   - `hash8` = 8-char hex of (joined paths + epochMs) to avoid collisions
6. Return `{ outputPath, width: maxWidth, height: totalHeight, sourceCount: filePaths.length }`

Notes:
- Reuse **existing PsdService** (worker-threaded ag-psd). `PsdMergeService` does NOT implement SourceRenderer — it's a one-shot file producer.
- Validation: throw `Error('At least 2 files required')` if `< 2`, and `Error('All files must be .psd')` if any non-PSD path (defense-in-depth; renderer already gates).
- Memory: Sharp's composite can handle large inputs; if concerned later, can stream via raw buffer concat. MVP uses Sharp composite.

### IPC handler registration (`src/main/ipc/handlers.ts`)

Add to `Services` type:
```typescript
psdMergeService: PsdMergeService
```

Add handler (after existing image/source handlers):
```typescript
ipcMain.handle('merge-psd-sources', async (_e, payload: MergePsdRequest): Promise<MergePsdResult> => {
  try {
    return await services.psdMergeService.merge(payload.filePaths)
  } catch (err) {
    services.logger.error('merge-psd-sources failed', err)
    throw new Error(`Failed to merge PSD sources: ${toErrorMessage(err)}`)
  }
})
```

### Wiring (`src/main/index.ts`)
```typescript
import {PsdService} from './services/psd.service'
import {PsdMergeService} from './services/psd-merge.service'

const psdService = new PsdService()
sourceService.addRenderer(isPsdFile, psdService)
const psdMergeService = new PsdMergeService(psdService)

registerIpcHandlers({ ..., psdMergeService })
```

## Renderer

### New modal: `src/renderer/src/components/MergePsdModal.tsx`

Props:
```typescript
{
  open: boolean
  filePaths: string[]           // Initial order (from drop/select)
  onCancel: () => void
  onMerged: (result: MergePsdResult) => void  // Parent calls addFileByPath(outputPath)
}
```

Behavior:
1. Opens with `filePaths` naturally sorted on first render
2. Shows list: filename (basename), with ▲/▼ buttons to reorder (or simple up/down — skip drag-and-drop for MVP)
3. Shows total count and "세로로 이어붙여집니다" hint
4. [Cancel] [Merge] buttons
5. On Merge: `setBusy(true)`, call `window.api.mergePsdSources({ filePaths: orderedPaths })`, on success call `onMerged(result)`, on error toast + stay open

Optional: show basenames only (not full paths) for UI cleanliness.

### Natural sort utility
Add to `src/shared/utils/index.ts`:
```typescript
export function naturalSort(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
}
```
Use in modal initial sort.

### Integration in HomePage + WorkspacePage

Both pages currently do:
```typescript
const handleFileDrop = (paths) => {
  for (const path of paths) addFileByPath(path)
}
```

Change to:
```typescript
const handleFileDrop = (paths) => {
  if (paths.length >= 2 && paths.every(isPsdFile)) {
    setMergeModalPaths(paths)
    return
  }
  for (const path of paths) addFileByPath(path)
}
```

Add modal state + handler:
```typescript
const [mergeModalPaths, setMergeModalPaths] = useState<string[] | null>(null)
...
{mergeModalPaths && (
  <MergePsdModal
    open
    filePaths={mergeModalPaths}
    onCancel={() => setMergeModalPaths(null)}
    onMerged={(result) => {
      setMergeModalPaths(null)
      addFileByPath(result.outputPath)
      // HomePage: also navigate('/workspace')
    }}
  />
)}
```

### Tab label concern
Merged file will show as `merged_{ts}_{hash}.png` in the tab — ugly. Options:
- A. Rename in jobStore when adding merged file (pass display name override)
- B. Let it show as-is (acceptable for MVP)

**MVP: B.** Ship ugly filename, iterate later if users complain. This keeps jobStore unchanged.

### i18n
Add to both `ko.ts` and `en.ts`:
- `mergePsdTitle` — "PSD 파일 합치기" / "Merge PSD Files"
- `mergePsdDesc` — "선택한 PSD 파일들을 세로로 이어붙여 하나의 원본으로 엽니다." / "Selected PSD files will be concatenated vertically into a single source."
- `mergePsdConfirm` — "합치기" / "Merge"
- `mergePsdInProgress` — "합치는 중..." / "Merging..."
- `mergePsdError` — "PSD 합치기 실패" / "Failed to merge PSDs"
- `moveUp` / `moveDown` if not already present

## Testing

### Main
- `src/main/services/psd-merge.service.test.ts`:
  - Happy path: 2 synthetic PSDs (generate via `ag-psd.writePsd` or reuse PSD fixture) → merged dims correct, output file exists, dimensions match max-w × total-h
  - Width-mismatch path: widths 100 vs 200 → output width = 200, narrower image right-padded (check via Sharp metadata)
  - Validation: `< 2` files → throws
  - Validation: non-PSD path → throws

### Renderer
- `MergePsdModal` — reorder logic (move up/down), Merge click triggers IPC, shows busy state
- `useFileDrop` remains unchanged; caller logic tested indirectly or via integration

### No end-to-end fixture yet for drop → merge → tab; manual test in dev mode.

## Non-goals for this pass
- Drag-to-reorder in modal (button-based for MVP)
- Merge progress per file
- Custom merged-name input
- Caching merged result by source-hash (re-merge every time is fine initially)
- Temp file cleanup strategy (OS tmpdir is auto-cleaned; in-app cleanup can come later)

---

## 2026-04-22 — Merge output format change (`.tiff` → `.rgba`)

### What changed (IPC surface)
- `merge-psd-sources` return type `MergePsdResult` is unchanged structurally, but `outputPath` now ends in `.rgba` (internal raw-RGBA container: 8-byte LE header `width|height` + `w*h*4` bytes raw RGBA).
- `get-source-dimensions` now accepts `.rgba` paths in addition to user-facing formats. Internally gated by `isInternalPipelineFile(path)`, which is a superset of user-drop check. Users still cannot drop `.rgba` files directly (`useFileDrop` uses `isSupportedFile`).
- No new channels, no new payload fields, no preload changes.

### Why
Huge merged canvases (400M+ px, ~1.6 GB raw RGBA) crashed Electron via libvips native allocation failure when the slice path called `sharp(tiff).raw().toBuffer()`. The new `.rgba` container skips all Sharp decoding of the merged canvas — a dedicated `RawRgbaSourceService` streams chunks straight off disk.

### Renderer integration notes
- Tab label stripping: `stripExtension` regex updated to also strip `.rgba`. Workspace tab shows a clean name.
- `OptionPanel` dimension query succeeds via `get-source-dimensions` (now accepts `.rgba`).
- No `<img>` in renderer references the merged source file directly — safe.
- Mixed format merge (PSD+PNG+PDF) — PSD-only for now
