import {create} from 'zustand'
import type {ExportJobPayload, ExportResult, JobMeta, JobProgress, RunSliceJobPayload} from '@shared/types'
import {extractSourceName, toErrorMessage} from '@shared/utils'
import {useWorkspaceStore} from './workspaceStore'

type FileEntry = {
  path: string
  name: string
}

type JobStore = {
  // Multi-file workspace
  fileList: FileEntry[]
  activeFilePath: string | null

  recentJobs: JobMeta[]
  currentJob: JobMeta | null
  sessionResults: JobMeta[]
  isLoading: boolean
  isSelectingFile: boolean
  isRunning: boolean
  runningFilePath: string | null
  progress: JobProgress | null
  error: string | null

  // Export state
  isExporting: boolean
  exportProgress: JobProgress | null
  exportResult: ExportResult | null

  addFile: () => Promise<void>
  addFileByPath: (path: string) => void
  setActiveFile: (path: string) => void
  removeFile: (path: string) => void
  fetchRecentJobs: () => Promise<void>
  fetchJobDetail: (jobId: string) => Promise<void>
  runSliceJob: (payload: RunSliceJobPayload) => Promise<JobMeta>
  deleteJob: (jobId: string) => Promise<void>
  deleteJobsBySource: (sourceFilePath: string) => Promise<void>
  deleteAllJobs: () => Promise<void>
  // Export actions
  runExport: (payload: ExportJobPayload) => Promise<ExportResult>
  clearExportResult: () => void
}

export const useJobStore = create<JobStore>((set, get) => ({
  fileList: [],
  activeFilePath: null,

  recentJobs: [],
  currentJob: null,
  sessionResults: [],
  isLoading: false,
  isSelectingFile: false,
  isRunning: false,
  runningFilePath: null,
  progress: null,
  error: null,

  isExporting: false,
  exportProgress: null,
  exportResult: null,

  addFile: async () => {
    if (get().isSelectingFile) return
    set({ isSelectingFile: true })
    try {
      const path = await window.api.selectSourceFile()
      if (!path) return
      get().addFileByPath(path)
    } finally {
      set({ isSelectingFile: false })
    }
  },

  addFileByPath: (path: string) => {
    const { fileList } = get()
    const exists = fileList.some((p) => p.path === path)
    if (!exists) {
      set({
        fileList: [...fileList, { path, name: extractSourceName(path) }],
        activeFilePath: path
      })
    } else {
      set({ activeFilePath: path })
    }
  },

  setActiveFile: (path: string) => {
    set({ activeFilePath: path })
  },

  removeFile: (path: string) => {
    const { fileList, activeFilePath } = get()
    const next = fileList.filter((p) => p.path !== path)
    const newActive =
      activeFilePath === path
        ? next.length > 0
          ? next[0].path
          : null
        : activeFilePath
    useWorkspaceStore.getState().removeOptions(path)
    set({ fileList: next, activeFilePath: newActive })
  },

  fetchRecentJobs: async () => {
    set({ isLoading: true, error: null })
    try {
      const jobs = await window.api.getRecentJobs()
      set({ recentJobs: jobs, isLoading: false })
    } catch (err: unknown) {
      set({ error: toErrorMessage(err), isLoading: false })
    }
  },

  fetchJobDetail: async (jobId: string) => {
    set({ isLoading: true, error: null, currentJob: null })
    try {
      const job = await window.api.getJobDetail(jobId)
      set({ currentJob: job, isLoading: false })
    } catch (err: unknown) {
      set({ error: toErrorMessage(err), isLoading: false })
    }
  },

  runSliceJob: async (payload: RunSliceJobPayload) => {
    set({ isRunning: true, runningFilePath: payload.sourceFilePath, error: null, progress: null })
    const unsubscribe = window.api.onJobProgress((progress) => {
      if (progress.operation === 'slice') set({ progress })
    })
    try {
      const meta = await window.api.runSliceJob(payload)
      set((state) => ({
        isRunning: false,
        runningFilePath: null,
        progress: null,
        sessionResults: [meta, ...state.sessionResults]
      }))
      return meta
    } catch (err: unknown) {
      set({ error: toErrorMessage(err), isRunning: false, runningFilePath: null, progress: null })
      throw err
    } finally {
      unsubscribe()
    }
  },

  deleteJob: async (jobId: string) => {
    try {
      await window.api.deleteJob(jobId)
      set((state) => ({
        recentJobs: state.recentJobs.filter((j) => j.id !== jobId),
        sessionResults: state.sessionResults.filter((j) => j.id !== jobId)
      }))
    } catch (err: unknown) {
      set({ error: toErrorMessage(err) })
    }
  },

  deleteJobsBySource: async (sourceFilePath: string) => {
    try {
      await window.api.deleteJobsBySource(sourceFilePath)
      useWorkspaceStore.getState().removeOptions(sourceFilePath)
      set((state) => {
        const fileList = state.fileList.filter((p) => p.path !== sourceFilePath)
        const activeFilePath =
          state.activeFilePath === sourceFilePath
            ? fileList.length > 0 ? fileList[0].path : null
            : state.activeFilePath
        return {
          recentJobs: state.recentJobs.filter((j) => j.sourceFilePath !== sourceFilePath),
          sessionResults: state.sessionResults.filter((j) => j.sourceFilePath !== sourceFilePath),
          fileList,
          activeFilePath
        }
      })
    } catch (err: unknown) {
      set({ error: toErrorMessage(err) })
    }
  },

  deleteAllJobs: async () => {
    try {
      await window.api.deleteAllJobs()
      const { fileList } = get()
      const ws = useWorkspaceStore.getState()
      for (const file of fileList) {
        ws.removeOptions(file.path)
      }
      set({ recentJobs: [], sessionResults: [], fileList: [], activeFilePath: null })
    } catch (err: unknown) {
      set({ error: toErrorMessage(err) })
    }
  },

  runExport: async (payload: ExportJobPayload) => {
    set({ isExporting: true, exportProgress: null, exportResult: null, error: null })
    const unsubscribe = window.api.onJobProgress((progress) => {
      if (progress.operation === 'export') set({ exportProgress: progress })
    })
    try {
      const result = await window.api.runExport(payload)
      set({ isExporting: false, exportProgress: null, exportResult: result })
      return result
    } catch (err: unknown) {
      set({ error: toErrorMessage(err), isExporting: false, exportProgress: null })
      throw err
    } finally {
      unsubscribe()
    }
  },

  clearExportResult: () => set({ exportResult: null })
}))
