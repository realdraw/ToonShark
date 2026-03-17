import type {JobMeta} from '@shared/types'
import type {TranslationKeys} from '../i18n/en'
import {toLocalFileUrl} from '@shared/utils'

function OptionTag({ children }: { children: React.ReactNode }) {
  return (
    <span className="px-1.5 py-0.5 bg-elevated rounded text-[10px] text-secondary">
      {children}
    </span>
  )
}

function OptionsSummary({ job, t }: { job: JobMeta; t: TranslationKeys }) {
  const { options, mode } = job
  return (
    <div className="flex flex-wrap gap-1 mt-1.5">
      <OptionTag>{mode === 'fixed' ? t.fixed : t.auto}</OptionTag>
      {mode === 'fixed' && options.sliceHeight != null && (
        <OptionTag>{options.sliceHeight}px</OptionTag>
      )}
      {mode === 'fixed' && options.startOffset != null && options.startOffset > 0 && (
        <OptionTag>offset {options.startOffset}</OptionTag>
      )}
      {mode === 'auto' && options.whiteThreshold != null && (
        <OptionTag>threshold {options.whiteThreshold}</OptionTag>
      )}
      {mode === 'auto' && options.minWhiteRun != null && (
        <OptionTag>minRun {options.minWhiteRun}</OptionTag>
      )}
      {mode === 'auto' && options.minSliceHeight != null && (
        <OptionTag>minH {options.minSliceHeight}</OptionTag>
      )}
      {mode === 'auto' && options.cutPosition && (
        <OptionTag>{options.cutPosition === 'middle' ? t.cutMiddle : t.cutBeforeColor}</OptionTag>
      )}
      {options.pdfScale != null && (
        <OptionTag>{options.pdfScale}x</OptionTag>
      )}
      <OptionTag>{job.prefix}</OptionTag>
    </div>
  )
}

export function JobResultCard({
  job,
  navigate,
  onDelete,
  t
}: {
  job: JobMeta
  navigate: (path: string) => void
  onDelete: (jobId: string) => Promise<void>
  t: TranslationKeys
}) {
  return (
    <div className="bg-surface rounded-lg border border-border p-4">
      <div className="flex items-center justify-between mb-1">
        <div className="text-sm">
          <span className="text-primary font-medium">
            {new Date(job.createdAt).toLocaleTimeString()}
          </span>
          <span className="text-tertiary ml-3">{t.slices(job.sliceCount)}</span>
          <span className="text-tertiary ml-3">{job.pageCount} {t.pages}</span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => navigate(`/preview/${job.id}`)}
            className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 rounded text-xs transition text-white"
          >
            {t.preview}
          </button>
          <button
            onClick={() => window.api.openSourcePdf(job.id).catch(() => {})}
            className="px-3 py-1 bg-elevated hover:bg-hover-elevated rounded text-xs transition"
          >
            {t.sourcePdf}
          </button>
          <button
            onClick={() => window.api.openPath(job.versionPath).catch(() => {})}
            className="px-3 py-1 bg-elevated hover:bg-hover-elevated rounded text-xs transition"
          >
            {t.folder}
          </button>
          <button
            onClick={() => navigate(`/job/${job.id}`)}
            className="px-3 py-1 bg-elevated hover:bg-hover-elevated rounded text-xs transition"
          >
            {t.detail}
          </button>
          <button
            onClick={() => navigate(`/job/${job.id}/export`)}
            className="px-3 py-1 bg-emerald-700 hover:bg-emerald-600 rounded text-xs transition text-white"
          >
            {t.exportButton}
          </button>
          <button
            onClick={() => onDelete(job.id)}
            className="px-3 py-1 bg-error-bg hover:bg-red-700 text-error-text hover:text-white rounded text-xs transition"
          >
            {t.delete}
          </button>
        </div>
      </div>

      <OptionsSummary job={job} t={t} />

      <div className="flex gap-2 overflow-x-auto pb-2 mt-3">
        {job.files.slice(0, 12).map((file) => (
          <button
            key={file.index}
            onClick={() => navigate(`/job/${job.id}/slice?index=${file.index}&from=workspace`)}
            className="flex-shrink-0 w-16 bg-elevated rounded overflow-hidden cursor-pointer hover:ring-2 hover:ring-blue-500 transition"
          >
            <img
              src={toLocalFileUrl(file.thumbnailPath ?? file.path)}
              alt={file.name}
              className="w-full aspect-[3/4] object-cover"
              loading="lazy"
            />
            <div className="text-center py-0.5">
              <span className="text-[10px] text-muted">{file.index}</span>
            </div>
          </button>
        ))}
        {job.files.length > 12 && (
          <button
            onClick={() => navigate(`/job/${job.id}`)}
            className="flex-shrink-0 w-16 bg-elevated rounded flex items-center justify-center text-xs text-tertiary cursor-pointer hover:bg-hover-elevated transition"
          >
            +{job.files.length - 12}
          </button>
        )}
      </div>
    </div>
  )
}
