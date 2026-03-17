import type {NavigateFunction} from 'react-router-dom'
import type {JobMeta, StoragePdfInfo} from '@shared/types'
import type {TranslationKeys} from '../i18n/en'
import {JobResultCard} from './JobResultCard'
import {formatBytes} from '@shared/utils'

type ResultsPanelProps = {
  activeJobs: JobMeta[]
  activePdfName: string | undefined
  activePdfStorage: StoragePdfInfo | null
  navigate: NavigateFunction
  onDeleteJob: (jobId: string) => Promise<void>
  t: TranslationKeys
}

export function ResultsPanel(props: ResultsPanelProps) {
  const { activeJobs, activePdfName, activePdfStorage, navigate, onDeleteJob, t } = props

  if (activeJobs.length === 0) {
    return (
      <div className="flex-1 overflow-y-auto p-6">
        <div className="text-center py-20 text-muted">
          <p className="text-lg mb-2">{t.noResultsTitle}</p>
          <p className="text-sm">{t.noResultsDesc}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <h3 className="text-sm font-semibold text-secondary mb-3 flex items-center gap-2">
        <span className="bg-elevated px-2 py-0.5 rounded text-xs">PDF</span>
        {activePdfName}
        <span className="text-muted text-xs">{t.runCount(activeJobs.length)}</span>
        {activePdfStorage && (
          <span className="text-muted text-xs">· {formatBytes(activePdfStorage.size)}</span>
        )}
      </h3>

      <div className="space-y-4">
        {activeJobs.map((job) => (
          <JobResultCard key={job.id} job={job} navigate={navigate} onDelete={onDeleteJob} t={t} />
        ))}
      </div>
    </div>
  )
}
