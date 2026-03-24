import {useCallback} from 'react'
import {useJobStore} from '../stores/jobStore'
import type {TranslationKeys} from '../i18n/en'

export function useDeleteActions(t: TranslationKeys, refreshStorage: () => void) {
  const { deleteJob, deleteJobsBySource, deleteAllJobs } = useJobStore()

  const confirmDeleteJob = useCallback(
    async (jobId: string) => {
      if (!confirm(t.confirmDeleteJob)) return
      await deleteJob(jobId)
      refreshStorage()
    },
    [t, deleteJob, refreshStorage]
  )

  const confirmDeleteJobsBySource = useCallback(
    async (filePath: string, fileName: string) => {
      if (!confirm(t.confirmDeleteSource(fileName))) return
      await deleteJobsBySource(filePath)
      refreshStorage()
    },
    [t, deleteJobsBySource, refreshStorage]
  )

  const confirmDeleteAll = useCallback(
    async () => {
      if (!confirm(t.confirmDeleteAll)) return
      await deleteAllJobs()
      refreshStorage()
    },
    [t, deleteAllJobs, refreshStorage]
  )

  return { confirmDeleteJob, confirmDeleteJobsBySource, confirmDeleteAll }
}
