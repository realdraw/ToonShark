import {beforeEach, describe, expect, it, vi} from 'vitest'
import {useJobStore} from './jobStore'
import {useWorkspaceStore} from './workspaceStore'

const PDF_A = '/path/to/a.pdf'
const PDF_B = '/path/to/b.pdf'
const PDF_C = '/path/to/c.pdf'

function resetStore() {
  useJobStore.setState({
    fileList: [],
    activeFilePath: null,
    recentJobs: [],
    currentJob: null,
    sessionResults: [],
    isLoading: false,
    isRunning: false,
    runningFilePath: null,
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
      selectSourceFile: vi.fn(),
      deleteJobsBySource: vi.fn(),
      deleteAllJobs: vi.fn()
    }
  }
}

describe('jobStore — fileList management', () => {
  beforeEach(() => {
    resetStore()
    installWindowApiMocks()
  })

  describe('addFileByPath', () => {
    it('should add a PDF and set it as active', () => {
      useJobStore.getState().addFileByPath(PDF_A)

      const { fileList, activeFilePath } = useJobStore.getState()
      expect(fileList).toHaveLength(1)
      expect(fileList[0].path).toBe(PDF_A)
      expect(fileList[0].name).toBe('a')
      expect(activeFilePath).toBe(PDF_A)
    })

    it('should add multiple PDFs', () => {
      useJobStore.getState().addFileByPath(PDF_A)
      useJobStore.getState().addFileByPath(PDF_B)

      const { fileList, activeFilePath } = useJobStore.getState()
      expect(fileList).toHaveLength(2)
      expect(activeFilePath).toBe(PDF_B)
    })

    it('should not duplicate an existing PDF', () => {
      useJobStore.getState().addFileByPath(PDF_A)
      useJobStore.getState().addFileByPath(PDF_B)
      useJobStore.getState().addFileByPath(PDF_A)

      const { fileList, activeFilePath } = useJobStore.getState()
      expect(fileList).toHaveLength(2)
      expect(activeFilePath).toBe(PDF_A)
    })
  })

  describe('setActiveFile', () => {
    it('should change the active PDF', () => {
      useJobStore.getState().addFileByPath(PDF_A)
      useJobStore.getState().addFileByPath(PDF_B)
      useJobStore.getState().setActiveFile(PDF_A)

      expect(useJobStore.getState().activeFilePath).toBe(PDF_A)
    })
  })

  describe('removeFile', () => {
    it('should remove a PDF from the list', () => {
      useJobStore.getState().addFileByPath(PDF_A)
      useJobStore.getState().addFileByPath(PDF_B)
      useJobStore.getState().removeFile(PDF_A)

      const { fileList } = useJobStore.getState()
      expect(fileList).toHaveLength(1)
      expect(fileList[0].path).toBe(PDF_B)
    })

    it('should switch active to first remaining PDF when active is removed', () => {
      useJobStore.getState().addFileByPath(PDF_A)
      useJobStore.getState().addFileByPath(PDF_B)
      useJobStore.getState().addFileByPath(PDF_C)
      useJobStore.getState().setActiveFile(PDF_B)

      useJobStore.getState().removeFile(PDF_B)

      expect(useJobStore.getState().activeFilePath).toBe(PDF_A)
    })

    it('should set active to null when last PDF is removed', () => {
      useJobStore.getState().addFileByPath(PDF_A)
      useJobStore.getState().removeFile(PDF_A)

      expect(useJobStore.getState().fileList).toHaveLength(0)
      expect(useJobStore.getState().activeFilePath).toBeNull()
    })

    it('should keep active unchanged when a non-active PDF is removed', () => {
      useJobStore.getState().addFileByPath(PDF_A)
      useJobStore.getState().addFileByPath(PDF_B)
      useJobStore.getState().setActiveFile(PDF_A)

      useJobStore.getState().removeFile(PDF_B)

      expect(useJobStore.getState().activeFilePath).toBe(PDF_A)
      expect(useJobStore.getState().fileList).toHaveLength(1)
    })

    it('should do nothing when removing a PDF not in the list', () => {
      useJobStore.getState().addFileByPath(PDF_A)
      useJobStore.getState().removeFile('/nonexistent.pdf')

      expect(useJobStore.getState().fileList).toHaveLength(1)
      expect(useJobStore.getState().activeFilePath).toBe(PDF_A)
    })
  })

  describe('addFile (dialog cancel)', () => {
    it('should not change fileList when dialog is cancelled', async () => {
      // Pre-add a PDF so list is non-empty
      useJobStore.getState().addFileByPath(PDF_A)
      ;(window.api.selectSourceFile as ReturnType<typeof vi.fn>).mockResolvedValue(null)

      const prevLength = useJobStore.getState().fileList.length
      await useJobStore.getState().addFile()

      const { fileList } = useJobStore.getState()
      expect(fileList).toHaveLength(prevLength)
      expect(fileList[0].path).toBe(PDF_A)
    })

    it('should add PDF when dialog returns a path', async () => {
      ;(window.api.selectSourceFile as ReturnType<typeof vi.fn>).mockResolvedValue(PDF_B)

      await useJobStore.getState().addFile()

      const { fileList, activeFilePath } = useJobStore.getState()
      expect(fileList).toHaveLength(1)
      expect(fileList[0].path).toBe(PDF_B)
      expect(activeFilePath).toBe(PDF_B)
    })
  })

  describe('fileList + workspaceStore removeOptions coordination', () => {
    it('removeFile followed by re-add should work cleanly', () => {
      useJobStore.getState().addFileByPath(PDF_A)
      useJobStore.getState().removeFile(PDF_A)

      expect(useJobStore.getState().fileList).toHaveLength(0)

      useJobStore.getState().addFileByPath(PDF_A)
      expect(useJobStore.getState().fileList).toHaveLength(1)
      expect(useJobStore.getState().activeFilePath).toBe(PDF_A)
    })
  })

  describe('deleteJobsBySource — fileList cleanup (simulated)', () => {
    it('should remove the PDF from fileList when its jobs are deleted', async () => {
      useJobStore.getState().addFileByPath(PDF_A)
      useJobStore.getState().addFileByPath(PDF_B)
      useJobStore.getState().setActiveFile(PDF_A)
      useWorkspaceStore.getState().initOptions(PDF_A)
      ;(window.api.deleteJobsBySource as ReturnType<typeof vi.fn>).mockResolvedValue(1)

      await useJobStore.getState().deleteJobsBySource(PDF_A)

      expect(useJobStore.getState().fileList).toHaveLength(1)
      expect(useJobStore.getState().fileList[0].path).toBe(PDF_B)
      expect(useJobStore.getState().activeFilePath).toBe(PDF_B)
      expect(useWorkspaceStore.getState().getOptions(PDF_A)).toBeNull()
    })

    it('should set activeFilePath to null when last PDF is deleted', async () => {
      useJobStore.getState().addFileByPath(PDF_A)
      useWorkspaceStore.getState().initOptions(PDF_A)
      ;(window.api.deleteJobsBySource as ReturnType<typeof vi.fn>).mockResolvedValue(1)

      await useJobStore.getState().deleteJobsBySource(PDF_A)

      expect(useJobStore.getState().fileList).toHaveLength(0)
      expect(useJobStore.getState().activeFilePath).toBeNull()
      expect(useWorkspaceStore.getState().getOptions(PDF_A)).toBeNull()
    })

    it('should set error when deleteJobsBySource fails', async () => {
      useJobStore.getState().addFileByPath(PDF_A)
      ;(window.api.deleteJobsBySource as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('delete failed'))

      await useJobStore.getState().deleteJobsBySource(PDF_A)

      expect(useJobStore.getState().error).toBe('delete failed')
    })
  })

  describe('deleteAllJobs — actual action', () => {
    it('should clear fileList when all jobs are deleted', async () => {
      useJobStore.getState().addFileByPath(PDF_A)
      useJobStore.getState().addFileByPath(PDF_B)
      useJobStore.getState().addFileByPath(PDF_C)
      useWorkspaceStore.getState().initOptions(PDF_A)
      useWorkspaceStore.getState().initOptions(PDF_B)
      useWorkspaceStore.getState().initOptions(PDF_C)
      ;(window.api.deleteAllJobs as ReturnType<typeof vi.fn>).mockResolvedValue(3)

      await useJobStore.getState().deleteAllJobs()

      expect(useJobStore.getState().fileList).toHaveLength(0)
      expect(useJobStore.getState().activeFilePath).toBeNull()
      expect(useWorkspaceStore.getState().optionsMap).toEqual({})
    })

    it('should set error when deleteAllJobs fails', async () => {
      useJobStore.getState().addFileByPath(PDF_A)
      ;(window.api.deleteAllJobs as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('delete all failed'))

      await useJobStore.getState().deleteAllJobs()

      expect(useJobStore.getState().error).toBe('delete all failed')
    })
  })

})
