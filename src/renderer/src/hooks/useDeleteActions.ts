import {useCallback} from 'react'
import {useJobStore} from '../stores/jobStore'
import type {TranslationKeys} from '../i18n/en'

export function useDeleteActions(t: TranslationKeys, refreshStorage: () => void) {
  const { deleteJob, deleteJobsByPdf, deleteAllJobs } = useJobStore()

  const confirmDeleteJob = useCallback(
    async (jobId: string) => {
      if (!confirm(t.confirmDeleteJob)) return
      await deleteJob(jobId)
      refreshStorage()
    },
    [t, deleteJob, refreshStorage]
  )

  const confirmDeleteJobsByPdf = useCallback(
    async (pdfPath: string, pdfName: string) => {
      if (!confirm(t.confirmDeletePdf(pdfName))) return
      await deleteJobsByPdf(pdfPath)
      refreshStorage()
    },
    [t, deleteJobsByPdf, refreshStorage]
  )

  const confirmDeleteAll = useCallback(
    async () => {
      if (!confirm(t.confirmDeleteAll)) return
      await deleteAllJobs()
      refreshStorage()
    },
    [t, deleteAllJobs, refreshStorage]
  )

  return { confirmDeleteJob, confirmDeleteJobsByPdf, confirmDeleteAll }
}
