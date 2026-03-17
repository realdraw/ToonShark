import {beforeEach, describe, expect, it} from 'vitest'
import type {PdfOptions} from './workspaceStore'
import {useWorkspaceStore} from './workspaceStore'
import type {AppSettings} from '@shared/types'
import {DEFAULT_AUTO_SLICE} from '@shared/types'

const FAKE_SETTINGS: AppSettings = {
  baseDir: '/tmp/test',
  defaultSliceHeight: 2000,
  naming: { defaultPrefix: 'test_prefix', filenamePadding: 3 },
  autoSlice: {
    whiteThreshold: 240,
    minWhiteRun: 30,
    minSliceHeight: 300,
    cutPosition: 'before-color'
  },
  pdfScale: 2.0,
  export: { jpgQuality: 90 },
  preview: { defaultDeviceId: 'iphone_16', imageGap: 0, scrollAmount: 300 },
  locale: 'en',
  theme: 'dark'
}

const PDF_A = '/path/to/a.pdf'
const PDF_B = '/path/to/b.pdf'
const PDF_C = '/path/to/c.pdf'

function resetStore() {
  useWorkspaceStore.setState({ optionsMap: {}, _settings: null })
}

/** Helper: init + get options for a PDF */
function initAndGet(pdfPath: string): PdfOptions {
  const store = useWorkspaceStore.getState()
  store.initOptions(pdfPath)
  return store.getOptions(pdfPath)!
}

describe('workspaceStore', () => {
  beforeEach(() => {
    resetStore()
  })

  describe('getOptions — returns null before init', () => {
    it('should return null for an uninitialized PDF', () => {
      expect(useWorkspaceStore.getState().getOptions(PDF_A)).toBeNull()
    })
  })

  describe('initOptions — defaults (no settings cached)', () => {
    it('should create default options for a new PDF', () => {
      const opts = initAndGet(PDF_A)

      expect(opts.mode).toBe('auto')
      expect(opts.prefix).toBe('')
      expect(opts.sliceHeight).toBe(1280)
      expect(opts.startOffset).toBe(0)
      expect(opts.pdfScale).toBe(4.0)
      expect(opts.whiteThreshold).toBe(DEFAULT_AUTO_SLICE.whiteThreshold)
      expect(opts.minWhiteRun).toBe(DEFAULT_AUTO_SLICE.minWhiteRun)
      expect(opts.minSliceHeight).toBe(DEFAULT_AUTO_SLICE.minSliceHeight)
      expect(opts.cutPosition).toBe(DEFAULT_AUTO_SLICE.cutPosition)
    })

    it('should persist options in optionsMap after init', () => {
      initAndGet(PDF_A)
      const map = useWorkspaceStore.getState().optionsMap
      expect(map[PDF_A]).toBeDefined()
    })

    it('should return the same options on repeated calls', () => {
      const first = initAndGet(PDF_A)
      const second = useWorkspaceStore.getState().getOptions(PDF_A)
      expect(first).toEqual(second)
    })

    it('should not overwrite existing options on repeated initOptions', () => {
      initAndGet(PDF_A)
      useWorkspaceStore.getState().updateOption(PDF_A, 'sliceHeight', 999)
      useWorkspaceStore.getState().initOptions(PDF_A)
      expect(useWorkspaceStore.getState().getOptions(PDF_A)!.sliceHeight).toBe(999)
    })
  })

  describe('initOptions — with cached settings', () => {
    beforeEach(() => {
      useWorkspaceStore.getState().setSettings(FAKE_SETTINGS)
    })

    it('should create options from settings for new PDFs', () => {
      const opts = initAndGet(PDF_A)

      expect(opts.sliceHeight).toBe(2000)
      expect(opts.pdfScale).toBe(2.0)
      expect(opts.whiteThreshold).toBe(240)
      expect(opts.minWhiteRun).toBe(30)
      expect(opts.minSliceHeight).toBe(300)
      expect(opts.cutPosition).toBe('before-color')
    })

    it('should not change existing tab options when settings are updated', () => {
      initAndGet(PDF_A)

      useWorkspaceStore.getState().setSettings({
        ...FAKE_SETTINGS,
        defaultSliceHeight: 9999,
        pdfScale: 1.0
      })

      const opts = useWorkspaceStore.getState().getOptions(PDF_A)!
      expect(opts.sliceHeight).toBe(2000)
      expect(opts.pdfScale).toBe(2.0)

      const optsB = initAndGet(PDF_B)
      expect(optsB.sliceHeight).toBe(9999)
      expect(optsB.pdfScale).toBe(1.0)
    })
  })

  describe('updateOption — per-tab isolation', () => {
    it('should update a single field for a specific PDF', () => {
      initAndGet(PDF_A)
      useWorkspaceStore.getState().updateOption(PDF_A, 'sliceHeight', 500)

      expect(useWorkspaceStore.getState().getOptions(PDF_A)!.sliceHeight).toBe(500)
    })

    it('should not affect other PDFs when updating one', () => {
      initAndGet(PDF_A)
      initAndGet(PDF_B)

      useWorkspaceStore.getState().updateOption(PDF_A, 'sliceHeight', 500)
      useWorkspaceStore.getState().updateOption(PDF_A, 'mode', 'fixed')
      useWorkspaceStore.getState().updateOption(PDF_A, 'pdfScale', 1.0)

      const optsA = useWorkspaceStore.getState().getOptions(PDF_A)!
      const optsB = useWorkspaceStore.getState().getOptions(PDF_B)!

      expect(optsA.sliceHeight).toBe(500)
      expect(optsA.mode).toBe('fixed')
      expect(optsA.pdfScale).toBe(1.0)

      expect(optsB.sliceHeight).toBe(1280)
      expect(optsB.mode).toBe('auto')
      expect(optsB.pdfScale).toBe(4.0)
    })

    it('should preserve other fields when updating one field', () => {
      initAndGet(PDF_A)
      useWorkspaceStore.getState().updateOption(PDF_A, 'sliceHeight', 999)

      const opts = useWorkspaceStore.getState().getOptions(PDF_A)!
      expect(opts.sliceHeight).toBe(999)
      expect(opts.mode).toBe('auto')
      expect(opts.pdfScale).toBe(4.0)
    })

    it('should create options if updating a PDF that was never accessed', () => {
      useWorkspaceStore.getState().updateOption(PDF_A, 'mode', 'fixed')

      const opts = useWorkspaceStore.getState().optionsMap[PDF_A]
      expect(opts).toBeDefined()
      expect(opts.mode).toBe('fixed')
    })

    it('should support updating all option fields', () => {
      initAndGet(PDF_A)

      const updates: Partial<PdfOptions> = {
        mode: 'fixed',
        prefix: 'custom',
        sliceHeight: 600,
        startOffset: 100,
        pdfScale: 2.0,
        whiteThreshold: 245,
        minWhiteRun: 15,
        minSliceHeight: 200,
        cutPosition: 'before-color'
      }

      for (const [key, value] of Object.entries(updates)) {
        useWorkspaceStore.getState().updateOption(PDF_A, key as keyof PdfOptions, value as never)
      }

      const opts = useWorkspaceStore.getState().getOptions(PDF_A)!
      for (const [key, value] of Object.entries(updates)) {
        expect(opts[key as keyof PdfOptions]).toBe(value)
      }
    })
  })

  describe('setPrefix', () => {
    it('should set prefix for a specific PDF', () => {
      initAndGet(PDF_A)
      useWorkspaceStore.getState().setPrefix(PDF_A, 'episode_01')

      expect(useWorkspaceStore.getState().getOptions(PDF_A)!.prefix).toBe('episode_01')
    })

    it('should not affect other PDFs', () => {
      initAndGet(PDF_A)
      initAndGet(PDF_B)

      useWorkspaceStore.getState().setPrefix(PDF_A, 'ep_a')
      useWorkspaceStore.getState().setPrefix(PDF_B, 'ep_b')

      expect(useWorkspaceStore.getState().getOptions(PDF_A)!.prefix).toBe('ep_a')
      expect(useWorkspaceStore.getState().getOptions(PDF_B)!.prefix).toBe('ep_b')
    })
  })

  describe('removeOptions', () => {
    it('should remove options for a closed PDF tab', () => {
      initAndGet(PDF_A)
      initAndGet(PDF_B)

      useWorkspaceStore.getState().removeOptions(PDF_A)

      const map = useWorkspaceStore.getState().optionsMap
      expect(map[PDF_A]).toBeUndefined()
      expect(map[PDF_B]).toBeDefined()
    })

    it('should not fail when removing non-existent PDF', () => {
      useWorkspaceStore.getState().removeOptions('/does/not/exist.pdf')
      expect(useWorkspaceStore.getState().optionsMap).toEqual({})
    })

    it('should allow re-creating options after removal', () => {
      initAndGet(PDF_A)
      useWorkspaceStore.getState().updateOption(PDF_A, 'sliceHeight', 999)
      useWorkspaceStore.getState().removeOptions(PDF_A)

      // Re-init should create fresh defaults
      const opts = initAndGet(PDF_A)
      expect(opts.sliceHeight).toBe(1280)
    })
  })

  describe('multi-tab workflow', () => {
    it('should support 3 independent tabs with different options', () => {
      initAndGet(PDF_A)
      initAndGet(PDF_B)
      initAndGet(PDF_C)

      useWorkspaceStore.getState().updateOption(PDF_A, 'mode', 'fixed')
      useWorkspaceStore.getState().updateOption(PDF_A, 'sliceHeight', 500)

      useWorkspaceStore.getState().updateOption(PDF_B, 'mode', 'auto')
      useWorkspaceStore.getState().updateOption(PDF_B, 'whiteThreshold', 240)

      useWorkspaceStore.getState().updateOption(PDF_C, 'pdfScale', 1.0)
      useWorkspaceStore.getState().updateOption(PDF_C, 'sliceHeight', 999)

      const a = useWorkspaceStore.getState().getOptions(PDF_A)!
      const b = useWorkspaceStore.getState().getOptions(PDF_B)!
      const c = useWorkspaceStore.getState().getOptions(PDF_C)!

      expect(a.mode).toBe('fixed')
      expect(a.sliceHeight).toBe(500)
      expect(a.whiteThreshold).toBe(DEFAULT_AUTO_SLICE.whiteThreshold)

      expect(b.mode).toBe('auto')
      expect(b.whiteThreshold).toBe(240)
      expect(b.sliceHeight).toBe(1280)

      expect(c.pdfScale).toBe(1.0)
      expect(c.sliceHeight).toBe(999)
      expect(c.mode).toBe('auto')
    })

    it('should survive closing one tab without affecting others', () => {
      initAndGet(PDF_A)
      initAndGet(PDF_B)
      useWorkspaceStore.getState().updateOption(PDF_B, 'sliceHeight', 777)

      useWorkspaceStore.getState().removeOptions(PDF_A)

      expect(useWorkspaceStore.getState().optionsMap[PDF_A]).toBeUndefined()
      expect(useWorkspaceStore.getState().getOptions(PDF_B)!.sliceHeight).toBe(777)
    })
  })

  describe('setSettings', () => {
    it('should store settings for future tab creation', () => {
      useWorkspaceStore.getState().setSettings(FAKE_SETTINGS)
      expect(useWorkspaceStore.getState()._settings).toBe(FAKE_SETTINGS)
    })

    it('should allow overriding settings', () => {
      useWorkspaceStore.getState().setSettings(FAKE_SETTINGS)
      const newSettings = { ...FAKE_SETTINGS, pdfScale: 3.0 }
      useWorkspaceStore.getState().setSettings(newSettings)

      expect(useWorkspaceStore.getState()._settings?.pdfScale).toBe(3.0)
    })
  })
})
