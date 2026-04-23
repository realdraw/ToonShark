# QA Report — PSD Merge OOM Fix (worker + streaming rewrite)

**Date:** 2026-04-22
**Scope:** Main → worker relocation of 30× 200MB PSD merge pipeline
**Verdict:** **READY TO SHIP**

---

## 10-Item Verification

### 1. Main-thread non-blocking — PASS
- `src/main/services/psd-merge.service.ts`: **zero** `sharp` import (verified via `grep -n "sharp" …` returning no matches).
- All CPU-bound work (PSD parse, RGBA assembly, PNG encode) now lives in `src/main/workers/psd-merge.worker.ts`.
- Service is a pure orchestrator: path validation → deterministic temp filename → `runWorker()` promise. No buffer allocations beyond the ~80-byte IPC envelope.

### 2. Worker path resolution — PASS
- `PsdMergeService.getWorkerPath()` (service.ts:35–44) probes `__dirname/workers/psd-merge.worker.js` then `__dirname/../workers/psd-merge.worker.js` — **byte-for-byte equivalent** to `PsdService.getWorkerPath()` (psd.service.ts:29–38).
- Build output confirmed: `dist-electron/main/workers/psd-merge.worker.js` (4.37 kB) alongside `job.worker.js` and `psd.worker.js`.
- `electron.vite.config.ts:15` registers the entry in the main rollup input map.

### 3. Streaming correctness (code read) — PASS
- **Pass 1** (`collectDimensions`, worker.ts:76–98): `readPsd(buf, { skipLayerImageData: true, skipCompositeImageData: true, skipThumbnail: true })`. `buf` + `psd` are enclosed in a `{ … }` block inside the `for` loop, so both are GC-eligible at the end of each iteration. One file's bytes in flight at any time.
- **Pass 2** (`writeStagingRgba`, worker.ts:113–158): same block-scope discipline. Each iteration allocates exactly one `Buffer.alloc(maxWidth * height * 4, 0xff)` stripe (pre-filled white → no second pass for right-edge padding), `fh.write(stripe, 0, stripe.length, offset)`, then releases. `fs.promises.open('w')` + positional writes = the `.rgba.staging` file accumulates without a full-canvas buffer ever existing.
- **Staging filename** (worker.ts:166): `${input.outputPath}.rgba.staging` — matches spec exactly. Deleted in `finally` block (worker.ts:192–200) on both success and failure paths; `rm(..., { force: true })` swallows ENOENT so a missing file never masks the real error.
- **Pass 3** (worker.ts:182–189): `sharp(stagingPath, { raw, limitInputPixels: false, sequentialRead: true }).png({ compressionLevel: 3 }).toFile(outputPath)`. All three required flags present. Sharp streams the raw file from disk — no full-canvas RGBA buffer at encode time.

### 4. IPC / type / service contract unchanged — PASS
- `MergePsdRequest` / `MergePsdResult` shapes (`src/shared/types/index.ts:201–213`) untouched.
- Preload bridge (`src/preload/index.ts:81–82`): `mergePsdSources: (payload: MergePsdRequest): Promise<MergePsdResult>` → `ipcRenderer.invoke('merge-psd-sources', payload)` — matches.
- Handler (`src/main/ipc/handlers.ts:421–439`): validates `payload.filePaths`, returns `psdMergeService.merge(...)` result verbatim. Response shape = `MergePsdResult`.
- Renderer consumer (`src/renderer/src/components/MergePsdModal.tsx:75`): `window.api.mergePsdSources({ filePaths: orderedPaths })` — unchanged contract. No modifications required.

### 5. Resource cleanup — PASS
- `runWorker` (service.ts:80–114) uses a `settled` latch + `finish()` helper that calls `worker.terminate().catch(() => {})` on **every** resolve/reject path: `done` message, `error` message, `worker.on('error')`, and unexpected `exit`.
- Staging file cleanup: worker's `try/finally` in `run()` guarantees `rm(stagingPath, { force: true })` runs whether the encode succeeds, throws, or the process is about to die. The `error` IPC message is sent from the top-level `.catch()` **after** the inner `finally` completes.

### 6. Typecheck / build — PASS
- `npx tsc --noEmit -p tsconfig.node.json` → clean, no output.
- `npx tsc --noEmit -p tsconfig.json` → clean, no output.
- `npx electron-vite build` → clean. main 65.96 kB, `workers/psd-merge.worker.js` 4.37 kB, preload 2.85 kB, renderer 811.61 kB. No warnings.

### 7. Tests — PASS
- `npx vitest run` → **28 files / 471 tests passed** (3.37 s total). Matches main-developer's reported number exactly (+1 from prior 470 due to fifth psd-merge case).
- `psd-merge.service.test.ts` (5/5 passed, 30 ms): uses `InlineMergeWorker` factory override via `protected createWorker` — verified by reading test lines 51–169. `lastWorkerPath` + `lastWorkerInput` spies confirm the service calls `getWorkerPath()` with the expected envelope. `InlineErrorWorker` covers the reject path. Tests run **without** a prior `electron-vite build` (the old `describe.runIf(existsSync(...))` gate is removed), so CI is unaffected by build ordering.

### 8. Electron packaging — PASS
- `package.json:34–40` includes `"dist-electron/**/*"` in the `files` allowlist — the new `workers/psd-merge.worker.js` ships automatically.
- `asarUnpack` (package.json:78–81) is `sharp/**` + `@napi-rs/canvas/**` only; the worker itself is pure JS and correctly runs from inside the ASAR.
- No changes required to packaging config.

### 9. `main/index.ts` wiring — PASS
- `src/main/index.ts:120`: `const psdMergeService = new PsdMergeService()` — **no argument**, matches the new zero-param constructor.
- `src/main/index.ts:117,119`: `psdService` is kept solely for `sourceService.addRenderer(isPsdFile, psdService)`. It is **not** passed to `PsdMergeService` anymore. Clean separation.
- `ipcState` registration (index.ts:128–138) still passes `psdMergeService` in the services bag.

### 10. Latent risks — PASS (with one note)
- **Staging filename collision**: output path = `os.tmpdir()/toonshark-merged/merged_{epochMs}_{hash8}.png`. `hash8 = sha1(filePaths.join('|') + epochMs).slice(0,8)`. Even simultaneous merges of the same file list produce different `epochMs` → different hash. Collision probability effectively zero. **PASS.**
- **Disk space for staging**: `maxWidth × totalHeight × 4` bytes. Worst case cited (30 files × ~10 000 px tall × 2 000 px wide × 4 B ≈ 2.4 GB) is well within typical free space; pathological inputs (30 × 15 000 tall at 2 000 wide = ~3.6 GB) would surface as an `fh.write` ENOSPC → worker emits `{ type: 'error', message }` → service rejects with an `Error` whose message is the raw ENOSPC text → handler wraps as `"Failed to merge PSD sources: ENOSPC…"` → renderer surfaces via `addToast('error', …)`. Error is propagated intact; no silent loss. **PASS** (follow-up: consider a pre-flight disk-space check if this turns out to bite real users).

---

## Files modified by QA
None. All verification was read-only.

---

## Peak-memory improvement review

Spot-checked against main-developer's table. Matches the code:

| Resource | Before | After | Verdict |
| --- | --- | --- | --- |
| Concurrent original file buffers | N (up to 30 × 200MB ≈ 6GB) | 1 (per-iteration block scope) | Code at worker.ts:84, 126 confirms |
| Concurrent decoded RGBA | N padded strips | 1 stripe per iteration | Code at worker.ts:136 confirms |
| Sharp composite intermediate | full `maxWidth × totalHeight × 4` canvas | **none** — streams from disk | `sequentialRead: true` + raw input at worker.ts:182–186 confirms |
| PNG encode buffer | full in-memory | streaming, `compressionLevel: 3` | worker.ts:187 confirms |
| Process | main (V8 heap capped) | worker (own heap) | Service no longer imports sharp/ag-psd; confirmed |

**Net:** main process peak memory ≈ unchanged baseline (no RGBA touches it). Worker peak ≈ `max(file_i_bytes) + (maxWidth × max_h_i × 4)`, typically <1 GB per file. **Claim matches implementation.**

---

## Build & test summary

| Check | Result |
| --- | --- |
| `npx tsc --noEmit -p tsconfig.node.json` | PASS (no output) |
| `npx tsc --noEmit -p tsconfig.json` | PASS (no output) |
| `npx electron-vite build` | PASS (main 65.96 kB, worker 4.37 kB, preload 2.85 kB, renderer 811.61 kB) |
| `npx vitest run` | **471 / 471 passed** (28 files, 3.37 s) |
| `psd-merge.service.test.ts` | 5 / 5 passed (30 ms) — InlineMergeWorker override path exercised |

---

## Manual smoke-test checklist (pre-ship)

1. **The bug repro**: drag-and-drop 30 × real 200 MB PSDs into the merge modal. Confirm:
   - Main process memory (Activity Monitor / Task Manager) stays flat (~200–300 MB) throughout.
   - Worker thread memory grows then releases per file (expect <1 GB peak per iteration).
   - No OOM shutdown, no renderer freeze.
2. **Merged PNG correctness**: open the produced `merged_{epochMs}_{hash8}.png`. Verify:
   - Width = max PSD width, height = sum of PSD heights.
   - Right-edge padding of narrow files is opaque white (not transparent / not black).
   - Vertical order matches the modal's ordered list.
3. **End-to-end flow**: merged PNG → slice → preview → export. Confirm the merge output works as a normal source and produces expected slice tiles.
4. **Cancel / error paths**:
   - Mid-merge, kill a source file (rename away). Expect an error toast with a readable message; staging file absent from `os.tmpdir()/toonshark-merged/`.
   - Fill disk to near-full before merging. Expect ENOSPC error surfaced to toast (not a silent crash); staging file absent.
5. **Concurrent merges**: trigger two merges back-to-back (if the UI allows). Output filenames must differ (hash8 + epochMs guarantees this).
6. **Packaging test** (before release): `npx electron-builder` → install the dmg/exe → repeat step 1 on the packaged app. Verify the worker resolves from inside ASAR (expect `__dirname/../workers/...` path to win).

---

## Summary

- PASS: **10 / 10** items
- FAIL: 0
- WARN: 0
- Files modified by QA: 0

**Verdict: READY TO SHIP.** The implementation matches main-developer's description, the IPC contract is preserved byte-for-byte, all 471 tests pass, both typechecks are clean, and the build produces the expected worker artifact. The main process no longer touches Sharp or large RGBA buffers, so the 30 × 200 MB OOM scenario is architecturally resolved. Recommend running the manual smoke-test checklist above on the packaged app before cutting the release.
