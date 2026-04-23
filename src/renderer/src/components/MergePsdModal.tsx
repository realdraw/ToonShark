import {useCallback, useEffect, useMemo, useRef, useState} from 'react'
import type {MergePsdResult} from '@shared/types'
import {naturalSort, toErrorMessage} from '@shared/utils'
import {useTranslation} from '../i18n'
import {useToastStore} from '../stores/toastStore'

type MergePsdModalProps = {
  open: boolean
  filePaths: string[]
  onCancel: () => void
  onMerged: (result: MergePsdResult) => void
}

function basename(path: string): string {
  const parts = path.split(/[\\/]/)
  return parts[parts.length - 1] || path
}

export function MergePsdModal({ open, filePaths, onCancel, onMerged }: MergePsdModalProps) {
  const t = useTranslation()
  const addToast = useToastStore((s) => s.addToast)
  const [orderedPaths, setOrderedPaths] = useState<string[]>(() => filePaths.slice().sort(naturalSort))
  const [busy, setBusy] = useState(false)
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null)

  // Reset order whenever a fresh set of paths is provided
  useEffect(() => {
    setOrderedPaths(filePaths.slice().sort(naturalSort))
  }, [filePaths])

  // Focus cancel button on open (simple initial focus trap)
  useEffect(() => {
    if (open) cancelButtonRef.current?.focus()
  }, [open])

  // ESC to close (disabled while busy so an in-flight merge isn't abandoned visually)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) {
        e.stopPropagation()
        onCancel()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, busy, onCancel])

  const moveUp = useCallback((index: number) => {
    if (index <= 0) return
    setOrderedPaths((prev) => {
      const next = prev.slice()
      const tmp = next[index - 1]
      next[index - 1] = next[index]
      next[index] = tmp
      return next
    })
  }, [])

  const moveDown = useCallback((index: number) => {
    setOrderedPaths((prev) => {
      if (index >= prev.length - 1) return prev
      const next = prev.slice()
      const tmp = next[index + 1]
      next[index + 1] = next[index]
      next[index] = tmp
      return next
    })
  }, [])

  const handleMerge = useCallback(async () => {
    if (busy) return
    setBusy(true)
    try {
      const result = await window.api.mergePsdSources({ filePaths: orderedPaths })
      onMerged(result)
    } catch (err) {
      addToast('error', `${t.mergePsdError}: ${toErrorMessage(err)}`)
    } finally {
      setBusy(false)
    }
  }, [busy, orderedPaths, onMerged, addToast, t])

  const items = useMemo(
    () => orderedPaths.map((p) => ({ path: p, name: basename(p) })),
    [orderedPaths]
  )

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      role="dialog"
      aria-modal="true"
      aria-labelledby="merge-psd-modal-title"
      onClick={(e) => {
        // Block backdrop from propagating into underlying pages (e.g. drop/select listeners)
        e.stopPropagation()
      }}
    >
      <div className="bg-surface border border-border rounded-xl shadow-2xl w-full max-w-md mx-4 flex flex-col max-h-[80vh]">
        <div className="px-5 py-4 border-b border-border">
          <h2 id="merge-psd-modal-title" className="text-lg font-semibold text-primary">
            {t.mergePsdTitle}
          </h2>
          <p className="text-sm text-tertiary mt-1">{t.mergePsdDesc}</p>
        </div>

        <ul className="flex-1 overflow-y-auto px-3 py-3 space-y-1.5">
          {items.map((item, index) => {
            const isFirst = index === 0
            const isLast = index === items.length - 1
            return (
              <li
                key={item.path}
                className="flex items-center gap-2 px-3 py-2 bg-elevated border border-border rounded-md"
              >
                <span className="text-xs text-muted w-6 text-right flex-shrink-0">{index + 1}.</span>
                <span className="text-sm text-primary truncate flex-1" title={item.path}>
                  {item.name}
                </span>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => moveUp(index)}
                    disabled={isFirst || busy}
                    aria-label={t.moveUp}
                    className="w-7 h-7 flex items-center justify-center rounded text-tertiary hover:text-primary hover:bg-hover-elevated disabled:opacity-30 disabled:cursor-not-allowed transition"
                  >
                    &#9650;
                  </button>
                  <button
                    type="button"
                    onClick={() => moveDown(index)}
                    disabled={isLast || busy}
                    aria-label={t.moveDown}
                    className="w-7 h-7 flex items-center justify-center rounded text-tertiary hover:text-primary hover:bg-hover-elevated disabled:opacity-30 disabled:cursor-not-allowed transition"
                  >
                    &#9660;
                  </button>
                </div>
              </li>
            )
          })}
        </ul>

        <div className="px-5 py-4 border-t border-border flex items-center justify-end gap-2">
          <button
            ref={cancelButtonRef}
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="px-4 py-2 bg-elevated hover:bg-hover-elevated text-primary rounded-lg text-sm transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t.back}
          </button>
          <button
            type="button"
            onClick={handleMerge}
            disabled={busy}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {busy && (
              <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            )}
            <span>{busy ? t.mergePsdInProgress : t.mergePsdConfirm}</span>
          </button>
        </div>
      </div>
    </div>
  )
}
