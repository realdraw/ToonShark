import {beforeEach, describe, expect, it, vi} from 'vitest'
import {useJobStore} from './jobStore'
import {useWorkspaceStore} from './workspaceStore'

const PDF_A = '/path/to/a.pdf'
const PDF_B = '/path/to/b.pdf'
const PDF_C = '/path/to/c.pdf'

function resetStore() {
  useJobStore.setState({
    pdfList: [],
    activePdfPath: null,
    recentJobs: [],
    currentJob: null,
    sessionResults: [],
    isLoading: false,
    isRunning: false,
    runningPdfPath: null,
    progress: null,
    error: null,
    isExporting: false,
    exportProgress: null,
    exportResult: null
  })
  useWorkspaceStore.setState({ optionsMap: {}, _settings: null })
}

function installWindowApiMocks() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(globalThis as any).window = {
    api: {
      selectSourcePdf: vi.fn(),
      deleteJobsByPdf: vi.fn(),
      deleteAllJobs: vi.fn()
    }
  }
}

describe('jobStore — pdfList management', () => {
  beforeEach(() => {
    resetStore()
    installWindowApiMocks()
  })

  describe('addPdfByPath', () => {
    it('should add a PDF and set it as active', () => {
      useJobStore.getState().addPdfByPath(PDF_A)

      const { pdfList, activePdfPath } = useJobStore.getState()
      expect(pdfList).toHaveLength(1)
      expect(pdfList[0].path).toBe(PDF_A)
      expect(pdfList[0].name).toBe('a')
      expect(activePdfPath).toBe(PDF_A)
    })

    it('should add multiple PDFs', () => {
      useJobStore.getState().addPdfByPath(PDF_A)
      useJobStore.getState().addPdfByPath(PDF_B)

      const { pdfList, activePdfPath } = useJobStore.getState()
      expect(pdfList).toHaveLength(2)
      expect(activePdfPath).toBe(PDF_B)
    })

    it('should not duplicate an existing PDF', () => {
      useJobStore.getState().addPdfByPath(PDF_A)
      useJobStore.getState().addPdfByPath(PDF_B)
      useJobStore.getState().addPdfByPath(PDF_A)

      const { pdfList, activePdfPath } = useJobStore.getState()
      expect(pdfList).toHaveLength(2)
      expect(activePdfPath).toBe(PDF_A)
    })
  })

  describe('setActivePdf', () => {
    it('should change the active PDF', () => {
      useJobStore.getState().addPdfByPath(PDF_A)
      useJobStore.getState().addPdfByPath(PDF_B)
      useJobStore.getState().setActivePdf(PDF_A)

      expect(useJobStore.getState().activePdfPath).toBe(PDF_A)
    })
  })

  describe('removePdf', () => {
    it('should remove a PDF from the list', () => {
      useJobStore.getState().addPdfByPath(PDF_A)
      useJobStore.getState().addPdfByPath(PDF_B)
      useJobStore.getState().removePdf(PDF_A)

      const { pdfList } = useJobStore.getState()
      expect(pdfList).toHaveLength(1)
      expect(pdfList[0].path).toBe(PDF_B)
    })

    it('should switch active to first remaining PDF when active is removed', () => {
      useJobStore.getState().addPdfByPath(PDF_A)
      useJobStore.getState().addPdfByPath(PDF_B)
      useJobStore.getState().addPdfByPath(PDF_C)
      useJobStore.getState().setActivePdf(PDF_B)

      useJobStore.getState().removePdf(PDF_B)

      expect(useJobStore.getState().activePdfPath).toBe(PDF_A)
    })

    it('should set active to null when last PDF is removed', () => {
      useJobStore.getState().addPdfByPath(PDF_A)
      useJobStore.getState().removePdf(PDF_A)

      expect(useJobStore.getState().pdfList).toHaveLength(0)
      expect(useJobStore.getState().activePdfPath).toBeNull()
    })

    it('should keep active unchanged when a non-active PDF is removed', () => {
      useJobStore.getState().addPdfByPath(PDF_A)
      useJobStore.getState().addPdfByPath(PDF_B)
      useJobStore.getState().setActivePdf(PDF_A)

      useJobStore.getState().removePdf(PDF_B)

      expect(useJobStore.getState().activePdfPath).toBe(PDF_A)
      expect(useJobStore.getState().pdfList).toHaveLength(1)
    })

    it('should do nothing when removing a PDF not in the list', () => {
      useJobStore.getState().addPdfByPath(PDF_A)
      useJobStore.getState().removePdf('/nonexistent.pdf')

      expect(useJobStore.getState().pdfList).toHaveLength(1)
      expect(useJobStore.getState().activePdfPath).toBe(PDF_A)
    })
  })

  describe('addPdf (dialog cancel)', () => {
    it('should not change pdfList when dialog is cancelled', async () => {
      // Pre-add a PDF so list is non-empty
      useJobStore.getState().addPdfByPath(PDF_A)
      ;(window.api.selectSourcePdf as ReturnType<typeof vi.fn>).mockResolvedValue(null)

      const prevLength = useJobStore.getState().pdfList.length
      await useJobStore.getState().addPdf()

      const { pdfList } = useJobStore.getState()
      expect(pdfList).toHaveLength(prevLength)
      expect(pdfList[0].path).toBe(PDF_A)
    })

    it('should add PDF when dialog returns a path', async () => {
      ;(window.api.selectSourcePdf as ReturnType<typeof vi.fn>).mockResolvedValue(PDF_B)

      await useJobStore.getState().addPdf()

      const { pdfList, activePdfPath } = useJobStore.getState()
      expect(pdfList).toHaveLength(1)
      expect(pdfList[0].path).toBe(PDF_B)
      expect(activePdfPath).toBe(PDF_B)
    })
  })

  describe('pdfList + workspaceStore removeOptions coordination', () => {
    it('removePdf followed by re-add should work cleanly', () => {
      useJobStore.getState().addPdfByPath(PDF_A)
      useJobStore.getState().removePdf(PDF_A)

      expect(useJobStore.getState().pdfList).toHaveLength(0)

      useJobStore.getState().addPdfByPath(PDF_A)
      expect(useJobStore.getState().pdfList).toHaveLength(1)
      expect(useJobStore.getState().activePdfPath).toBe(PDF_A)
    })
  })

  describe('deleteJobsByPdf — pdfList cleanup (simulated)', () => {
    it('should remove the PDF from pdfList when its jobs are deleted', async () => {
      useJobStore.getState().addPdfByPath(PDF_A)
      useJobStore.getState().addPdfByPath(PDF_B)
      useJobStore.getState().setActivePdf(PDF_A)
      useWorkspaceStore.getState().initOptions(PDF_A)
      ;(window.api.deleteJobsByPdf as ReturnType<typeof vi.fn>).mockResolvedValue(1)

      await useJobStore.getState().deleteJobsByPdf(PDF_A)

      expect(useJobStore.getState().pdfList).toHaveLength(1)
      expect(useJobStore.getState().pdfList[0].path).toBe(PDF_B)
      expect(useJobStore.getState().activePdfPath).toBe(PDF_B)
      expect(useWorkspaceStore.getState().getOptions(PDF_A)).toBeNull()
    })

    it('should set activePdfPath to null when last PDF is deleted', async () => {
      useJobStore.getState().addPdfByPath(PDF_A)
      useWorkspaceStore.getState().initOptions(PDF_A)
      ;(window.api.deleteJobsByPdf as ReturnType<typeof vi.fn>).mockResolvedValue(1)

      await useJobStore.getState().deleteJobsByPdf(PDF_A)

      expect(useJobStore.getState().pdfList).toHaveLength(0)
      expect(useJobStore.getState().activePdfPath).toBeNull()
      expect(useWorkspaceStore.getState().getOptions(PDF_A)).toBeNull()
    })

    it('should set error when deleteJobsByPdf fails', async () => {
      useJobStore.getState().addPdfByPath(PDF_A)
      ;(window.api.deleteJobsByPdf as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('delete failed'))

      await useJobStore.getState().deleteJobsByPdf(PDF_A)

      expect(useJobStore.getState().error).toBe('delete failed')
    })
  })

  describe('deleteAllJobs — actual action', () => {
    it('should clear pdfList when all jobs are deleted', async () => {
      useJobStore.getState().addPdfByPath(PDF_A)
      useJobStore.getState().addPdfByPath(PDF_B)
      useJobStore.getState().addPdfByPath(PDF_C)
      useWorkspaceStore.getState().initOptions(PDF_A)
      useWorkspaceStore.getState().initOptions(PDF_B)
      useWorkspaceStore.getState().initOptions(PDF_C)
      ;(window.api.deleteAllJobs as ReturnType<typeof vi.fn>).mockResolvedValue(3)

      await useJobStore.getState().deleteAllJobs()

      expect(useJobStore.getState().pdfList).toHaveLength(0)
      expect(useJobStore.getState().activePdfPath).toBeNull()
      expect(useWorkspaceStore.getState().optionsMap).toEqual({})
    })

    it('should set error when deleteAllJobs fails', async () => {
      useJobStore.getState().addPdfByPath(PDF_A)
      ;(window.api.deleteAllJobs as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('delete all failed'))

      await useJobStore.getState().deleteAllJobs()

      expect(useJobStore.getState().error).toBe('delete all failed')
    })
  })

})
