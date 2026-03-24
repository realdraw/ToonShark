import {useMemo} from 'react'
import type {JobMeta} from '@shared/types'

export function useMergedJobs(
  sessionResults: JobMeta[],
  recentJobs: JobMeta[],
  filterFilePath?: string | null
): JobMeta[] {
  return useMemo(() => {
    const seen = new Set<string>()
    const merged: JobMeta[] = []
    for (const job of [...sessionResults, ...recentJobs]) {
      if (seen.has(job.id)) continue
      if (filterFilePath && job.sourceFilePath !== filterFilePath) continue
      seen.add(job.id)
      merged.push(job)
    }
    return merged.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
  }, [sessionResults, recentJobs, filterFilePath])
}
