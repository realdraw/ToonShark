import {create} from 'zustand'
import type {AppSettings, CutPosition, SliceMode} from '@shared/types'
import {DEFAULT_AUTO_SLICE} from '@shared/types'

export type PdfOptions = {
  mode: SliceMode
  prefix: string
  sliceHeight: number
  startOffset: number
  pdfScale: number
  whiteThreshold: number
  minWhiteRun: number
  minSliceHeight: number
  cutPosition: CutPosition
}

function createDefaults(): PdfOptions {
  return {
    mode: 'auto',
    prefix: '',
    sliceHeight: 1280,
    startOffset: 0,
    pdfScale: 4.0,
    whiteThreshold: DEFAULT_AUTO_SLICE.whiteThreshold,
    minWhiteRun: DEFAULT_AUTO_SLICE.minWhiteRun,
    minSliceHeight: DEFAULT_AUTO_SLICE.minSliceHeight,
    cutPosition: DEFAULT_AUTO_SLICE.cutPosition
  }
}

function createFromSettings(settings: AppSettings): PdfOptions {
  return {
    mode: 'auto',
    prefix: '',
    sliceHeight: settings.defaultSliceHeight,
    startOffset: 0,
    pdfScale: settings.pdfScale ?? 4.0,
    whiteThreshold: settings.autoSlice.whiteThreshold,
    minWhiteRun: settings.autoSlice.minWhiteRun,
    minSliceHeight: settings.autoSlice.minSliceHeight,
    cutPosition: settings.autoSlice.cutPosition
  }
}

type WorkspaceStore = {
  /** Per-PDF options, keyed by pdf path */
  optionsMap: Record<string, PdfOptions>

  /** Cached settings for creating defaults for new tabs */
  _settings: AppSettings | null

  /** Get options for a specific PDF (returns null if not initialized) */
  getOptions: (pdfPath: string) => PdfOptions | null

  /** Initialize options for a PDF if not already present */
  initOptions: (pdfPath: string) => void

  /** Update a single field for a specific PDF */
  updateOption: <K extends keyof PdfOptions>(pdfPath: string, key: K, value: PdfOptions[K]) => void

  /** Set prefix for a specific PDF */
  setPrefix: (pdfPath: string, prefix: string) => void

  /** Store settings reference for new tab defaults */
  setSettings: (settings: AppSettings) => void

  /** Remove options when a PDF tab is closed */
  removeOptions: (pdfPath: string) => void
}

export const useWorkspaceStore = create<WorkspaceStore>((set, get) => ({
  optionsMap: {},
  _settings: null,

  getOptions: (pdfPath) => {
    return get().optionsMap[pdfPath] ?? null
  },

  initOptions: (pdfPath) => {
    if (get().optionsMap[pdfPath]) return
    const settings = get()._settings
    const newOptions = settings ? createFromSettings(settings) : createDefaults()
    set((state) => ({
      optionsMap: { ...state.optionsMap, [pdfPath]: newOptions }
    }))
  },

  updateOption: (pdfPath, key, value) => {
    set((state) => {
      const current = state.optionsMap[pdfPath] ?? (state._settings ? createFromSettings(state._settings) : createDefaults())
      return {
        optionsMap: {
          ...state.optionsMap,
          [pdfPath]: { ...current, [key]: value }
        }
      }
    })
  },

  setPrefix: (pdfPath, prefix) => {
    get().updateOption(pdfPath, 'prefix', prefix)
  },

  setSettings: (settings) => {
    set({ _settings: settings })
  },

  removeOptions: (pdfPath) => {
    set((state) => {
      const next = { ...state.optionsMap }
      delete next[pdfPath]
      return { optionsMap: next }
    })
  }
}))
