import {create} from 'zustand'
import type {ExportJobPayload, ExportResult, JobMeta, JobProgress, RunSliceJobPayload} from '@shared/types'
import {extractPdfName, toErrorMessage} from '@shared/utils'
import {useWorkspaceStore} from './workspaceStore'

type PdfEntry = {
  path: string
  name: string
}

type JobStore = {
  // Multi-PDF workspace
  pdfList: PdfEntry[]
  activePdfPath: string | null

  recentJobs: JobMeta[]
  currentJob: JobMeta | null
  sessionResults: JobMeta[]
  isLoading: boolean
  isSelectingPdf: boolean
  isRunning: boolean
  runningPdfPath: string | null
  progress: JobProgress | null
  error: string | null

  // Export state
  isExporting: boolean
  exportProgress: JobProgress | null
  exportResult: ExportResult | null

  addPdf: () => Promise<void>
  addPdfByPath: (path: string) => void
  setActivePdf: (path: string) => void
  removePdf: (path: string) => void
  fetchRecentJobs: () => Promise<void>
  fetchJobDetail: (jobId: string) => Promise<void>
  runSliceJob: (payload: RunSliceJobPayload) => Promise<JobMeta>
  deleteJob: (jobId: string) => Promise<void>
  deleteJobsByPdf: (sourcePdfPath: string) => Promise<void>
  deleteAllJobs: () => Promise<void>
  // Export actions
  runExport: (payload: ExportJobPayload) => Promise<ExportResult>
  clearExportResult: () => void
}

export const useJobStore = create<JobStore>((set, get) => ({
  pdfList: [],
  activePdfPath: null,

  recentJobs: [],
  currentJob: null,
  sessionResults: [],
  isLoading: false,
  isSelectingPdf: false,
  isRunning: false,
  runningPdfPath: null,
  progress: null,
  error: null,

  isExporting: false,
  exportProgress: null,
  exportResult: null,

  addPdf: async () => {
    if (get().isSelectingPdf) return
    set({ isSelectingPdf: true })
    try {
      const path = await window.api.selectSourcePdf()
      if (!path) return
      get().addPdfByPath(path)
    } finally {
      set({ isSelectingPdf: false })
    }
  },

  addPdfByPath: (path: string) => {
    const { pdfList } = get()
    const exists = pdfList.some((p) => p.path === path)
    if (!exists) {
      set({
        pdfList: [...pdfList, { path, name: extractPdfName(path) }],
        activePdfPath: path
      })
    } else {
      set({ activePdfPath: path })
    }
  },

  setActivePdf: (path: string) => {
    set({ activePdfPath: path })
  },

  removePdf: (path: string) => {
    const { pdfList, activePdfPath } = get()
    const next = pdfList.filter((p) => p.path !== path)
    const newActive =
      activePdfPath === path
        ? next.length > 0
          ? next[0].path
          : null
        : activePdfPath
    useWorkspaceStore.getState().removeOptions(path)
    set({ pdfList: next, activePdfPath: newActive })
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
    set({ isRunning: true, runningPdfPath: payload.sourcePdfPath, error: null, progress: null })
    const unsubscribe = window.api.onJobProgress((progress) => {
      if (progress.operation === 'slice') set({ progress })
    })
    try {
      const meta = await window.api.runSliceJob(payload)
      set((state) => ({
        isRunning: false,
        runningPdfPath: null,
        progress: null,
        sessionResults: [meta, ...state.sessionResults]
      }))
      return meta
    } catch (err: unknown) {
      set({ error: toErrorMessage(err), isRunning: false, runningPdfPath: null, progress: null })
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

  deleteJobsByPdf: async (sourcePdfPath: string) => {
    try {
      await window.api.deleteJobsByPdf(sourcePdfPath)
      useWorkspaceStore.getState().removeOptions(sourcePdfPath)
      set((state) => {
        const pdfList = state.pdfList.filter((p) => p.path !== sourcePdfPath)
        const activePdfPath =
          state.activePdfPath === sourcePdfPath
            ? pdfList.length > 0 ? pdfList[0].path : null
            : state.activePdfPath
        return {
          recentJobs: state.recentJobs.filter((j) => j.sourcePdfPath !== sourcePdfPath),
          sessionResults: state.sessionResults.filter((j) => j.sourcePdfPath !== sourcePdfPath),
          pdfList,
          activePdfPath
        }
      })
    } catch (err: unknown) {
      set({ error: toErrorMessage(err) })
    }
  },

  deleteAllJobs: async () => {
    try {
      await window.api.deleteAllJobs()
      const { pdfList } = get()
      const ws = useWorkspaceStore.getState()
      for (const pdf of pdfList) {
        ws.removeOptions(pdf.path)
      }
      set({ recentJobs: [], sessionResults: [], pdfList: [], activePdfPath: null })
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
