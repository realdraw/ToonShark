import {useEffect} from 'react'
import {useNavigate, useParams} from 'react-router-dom'
import {useJobStore} from '../stores/jobStore'
import {useTranslation} from '../i18n'
import {toLocalFileUrl} from '@shared/utils'
import {LazyImage} from '../components/LazyImage'

export default function JobDetailPage() {
  const { jobId } = useParams<{ jobId: string }>()
  const navigate = useNavigate()
  const t = useTranslation()
  const { currentJob, isLoading, fetchJobDetail } = useJobStore()

  useEffect(() => {
    if (jobId) fetchJobDetail(jobId)
  }, [jobId, fetchJobDetail])

  if (isLoading) {
    return <div className="p-6 text-tertiary">{t.loading}</div>
  }

  if (!currentJob || currentJob.id !== jobId) {
    return <div className="p-6 text-tertiary">{t.jobNotFound}</div>
  }

  const handleOpenFolder = () => {
    window.api.openPath(currentJob.versionPath).catch(() => {})
  }

return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => navigate('/')}
          className="text-tertiary hover:text-primary transition"
        >
          {t.back}
        </button>
        <h1 className="text-2xl font-bold text-primary">{currentJob.title}</h1>
      </div>

      {/* Meta Info */}
      <div className="bg-surface rounded-lg p-4 mb-6 border border-border">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <span className="text-tertiary">{t.createdAt}</span>
            <p className="text-primary">{new Date(currentJob.createdAt).toLocaleString()}</p>
          </div>
          <div>
            <span className="text-tertiary">{t.pages}</span>
            <p className="text-primary">{currentJob.pageCount}</p>
          </div>
          <div>
            <span className="text-tertiary">{t.slicesLabel}</span>
            <p className="text-primary">{currentJob.sliceCount}</p>
          </div>
          <div>
            <span className="text-tertiary">{t.mode}</span>
            <p className="text-primary">{currentJob.mode === 'fixed' ? t.fixedInterval : t.auto}</p>
          </div>
          <div>
            <span className="text-tertiary">{t.prefixLabel}</span>
            <p className="text-primary">{currentJob.prefix}</p>
          </div>
          <div className="col-span-2">
            <span className="text-tertiary">{t.sourcePdfLabel}</span>
            <p className="text-primary truncate">{currentJob.sourcePdfPath.split(/[\\/]/).pop()}</p>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3 mb-6">
        <button
          onClick={() => navigate(`/preview/${currentJob.id}`)}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm font-medium transition text-white"
        >
          {t.preview}
        </button>
        <button
          onClick={() => navigate(`/job/${currentJob.id}/export`)}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-sm font-medium transition text-white"
        >
          {t.exportButton}
        </button>
        <button
          onClick={() => window.api.openSourcePdf(currentJob.id).catch(() => {})}
          className="px-4 py-2 bg-elevated hover:bg-hover-elevated rounded-lg text-sm transition"
        >
          {t.openSourcePdf}
        </button>
        <button
          onClick={handleOpenFolder}
          className="px-4 py-2 bg-elevated hover:bg-hover-elevated rounded-lg text-sm transition"
        >
          {t.openFolder}
        </button>
      </div>

      {/* Slice Thumbnails */}
      <h2 className="text-lg font-semibold mb-4 text-secondary">
        {t.slicesLabel} ({currentJob.files.length})
      </h2>
      <div className="columns-4 md:columns-6 lg:columns-8 gap-3">
        {currentJob.files.map((file) => (
          <button
            key={file.index}
            onClick={() => navigate(`/job/${currentJob.id}/slice?index=${file.index}`)}
            className="mb-3 break-inside-avoid bg-surface rounded-lg overflow-hidden border border-border cursor-pointer hover:border-blue-500 transition text-left w-full"
          >
            <LazyImage
              src={toLocalFileUrl(file.thumbnailPath ?? file.path)}
              alt={file.name}
              className="w-full h-auto"
            />
            <div className="p-2 text-center">
              <p className="text-xs text-tertiary truncate">{file.name}</p>
              <p className="text-xs text-muted">
                {file.width}x{file.height}
              </p>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
