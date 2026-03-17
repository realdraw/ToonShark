import {useCallback, useEffect, useMemo} from 'react'
import {useNavigate} from 'react-router-dom'
import {useJobStore} from '../stores/jobStore'
import {useTranslation} from '../i18n'
import type {JobMeta} from '@shared/types'
import {extractPdfName, formatBytes} from '@shared/utils'
import {usePdfDrop} from '../hooks/usePdfDrop'
import logo from '../assets/logo.svg'
import {useMergedJobs} from '../hooks/useMergedJobs'
import {useStorageInfo} from '../hooks/useStorageInfo'
import {useDeleteActions} from '../hooks/useDeleteActions'
import {DropOverlay} from '../components/DropOverlay'

const STORAGE_WARNING_THRESHOLD = 10 * 1024 * 1024 * 1024 // 10GB

export default function HomePage() {
  const navigate = useNavigate()
  const t = useTranslation()
  const { pdfList, sessionResults, recentJobs, isLoading, isRunning, runningPdfPath, fetchRecentJobs, addPdf, addPdfByPath, setActivePdf, removePdf } = useJobStore()
  const { storageInfo, refreshStorage } = useStorageInfo()
  const { confirmDeleteJobsByPdf, confirmDeleteAll } = useDeleteActions(t, refreshStorage)

  useEffect(() => {
    fetchRecentJobs()
  }, [fetchRecentJobs])

  const allJobs = useMergedJobs(sessionResults, recentJobs)

  // Group jobs by source PDF
  const groupedByPdf = useMemo(() => {
    const map = new Map<string, { name: string; jobs: JobMeta[] }>()
    for (const job of allJobs) {
      const key = job.sourcePdfPath
      if (!map.has(key)) {
        map.set(key, { name: extractPdfName(key), jobs: [] })
      }
      map.get(key)!.jobs.push(job)
    }
    return Array.from(map.entries())
  }, [allJobs])

  // Map sourcePdfPath -> size from storage info
  const pdfSizeMap = useMemo(() => {
    const map = new Map<string, number>()
    if (storageInfo) {
      for (const pdf of storageInfo.pdfs) {
        map.set(pdf.sourcePdfPath, pdf.size)
      }
    }
    return map
  }, [storageInfo])

  // Map jobId -> size from storage info
  const jobSizeMap = useMemo(() => {
    const map = new Map<string, number>()
    if (storageInfo) {
      for (const pdf of storageInfo.pdfs) {
        for (const job of pdf.jobs) {
          map.set(job.jobId, job.size)
        }
      }
    }
    return map
  }, [storageInfo])

  const handleSelectPdf = async () => {
    const prevCount = useJobStore.getState().pdfList.length
    await addPdf()
    const { pdfList } = useJobStore.getState()
    if (pdfList.length > prevCount) {
      navigate('/workspace')
    }
  }

  const handleOpenFromHistory = (pdfPath: string) => {
    addPdfByPath(pdfPath)
    navigate('/workspace')
  }

  const handleOpenFolder = async () => {
    try {
      const settings = await window.api.loadSettings()
      if (settings.baseDir) await window.api.openPath(settings.baseDir)
    } catch (err) {
      window.api.log('warn', 'Failed to open folder', String(err))
    }
  }

  const handlePdfDrop = useCallback((paths: string[]) => {
    for (const path of paths) addPdfByPath(path)
    navigate('/workspace')
  }, [addPdfByPath, navigate])

  const { isDragging, dropProps } = usePdfDrop({ onDrop: handlePdfDrop })

  return (
    <div
      className="p-6 max-w-5xl mx-auto min-h-screen relative"
      {...dropProps}
    >
      {isDragging && <DropOverlay />}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <img src={logo} alt="" className="w-8 h-8" />
          <h1 className="text-2xl font-bold text-primary">{t.appTitle}</h1>
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleOpenFolder}
            className="px-4 py-2 bg-elevated hover:bg-hover-elevated rounded-lg text-sm transition"
          >
            {t.openFolder}
          </button>
          <button
            onClick={() => navigate('/settings')}
            className="px-4 py-2 bg-elevated hover:bg-hover-elevated rounded-lg text-sm transition"
          >
            {t.settings}
          </button>
          <button
            onClick={handleSelectPdf}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-medium transition text-white"
          >
            {t.openPdf}
          </button>
        </div>
      </div>

      {storageInfo && storageInfo.totalSize > STORAGE_WARNING_THRESHOLD && (
        <div className="mb-6 flex items-center justify-between bg-warning-bg border border-warning-border rounded-lg px-4 py-3">
          <span className="text-sm text-warning-text">
            {t.storageWarning(formatBytes(storageInfo.totalSize))}
          </span>
          <button
            onClick={confirmDeleteAll}
            className="px-3 py-1.5 bg-amber-700 hover:bg-amber-600 text-white rounded text-xs font-medium transition flex-shrink-0 ml-4"
          >
            {t.storageWarningAction}
          </button>
        </div>
      )}

      {pdfList.length > 0 && (
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-secondary mb-3">{t.openPdfs}</h2>
          <div className="flex flex-wrap gap-2">
            {pdfList.map((pdf) => (
              <button
                key={pdf.path}
                className="group flex items-center gap-2 px-3 py-2 bg-blue-600/20 border border-blue-500/30 rounded-lg hover:bg-blue-600/30 transition cursor-pointer"
                onClick={() => {
                  setActivePdf(pdf.path)
                  navigate('/workspace')
                }}
              >
                {isRunning && runningPdfPath === pdf.path ? (
                  <span className="flex-shrink-0 w-3.5 h-3.5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <span className="text-xs text-blue-400 font-medium">PDF</span>
                )}
                <span className="text-sm text-primary truncate max-w-[200px]">{pdf.name}</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    removePdf(pdf.path)
                  }}
                  className="opacity-0 group-hover:opacity-100 text-muted hover:text-primary transition text-xs ml-1 bg-transparent border-none p-0 cursor-pointer"
                >
                  x
                </button>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-secondary">{t.recentJobs}</h2>
        <div className="flex items-center gap-3">
          {storageInfo && storageInfo.totalSize > 0 && (
            <span className="text-xs text-muted">
              {t.totalUsage}: {formatBytes(storageInfo.totalSize)}
            </span>
          )}
          {allJobs.length > 0 && (
            <button
              onClick={confirmDeleteAll}
              className="px-3 py-1 bg-error-bg hover:bg-red-700 text-error-text hover:text-white rounded text-xs transition"
            >
              {t.deleteAll}
            </button>
          )}
        </div>
      </div>

      {isLoading && <p className="text-tertiary">{t.loading}</p>}

      {!isLoading && allJobs.length === 0 && (
        <div className="text-center py-20 text-muted border-2 border-dashed border-border-subtle rounded-xl bg-surface-dim hover:border-blue-500/50 hover:bg-blue-600/5 transition-colors cursor-default">
          <div className="text-4xl mb-4 opacity-40">PDF</div>
          <p className="text-lg mb-2">{t.noJobsTitle}</p>
          <p className="text-sm mb-4">{t.noJobsDesc}</p>
          <p className="text-xs text-faint">{t.dropPdfHere}</p>
        </div>
      )}

      <div className="space-y-6">
        {!isLoading && allJobs.length > 0 && (
          <div className="text-center py-4 border-2 border-dashed border-border rounded-lg text-faint text-xs hover:border-blue-500/40 hover:text-muted transition-colors cursor-default">
            {t.dropPdfHere}
          </div>
        )}
        {groupedByPdf.map(([pdfPath, group]) => (
          <div key={pdfPath} className="bg-surface-t rounded-lg border border-border p-4">
            {/* PDF Header */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="bg-blue-600/20 text-blue-400 px-2 py-0.5 rounded text-xs font-medium">
                  PDF
                </span>
                <h3 className="font-medium text-primary">{group.name}</h3>
                <span className="text-xs text-muted">
                  {t.runs(group.jobs.length)}
                </span>
                {pdfSizeMap.has(pdfPath) && (
                  <span className="text-xs text-muted">
                    · {formatBytes(pdfSizeMap.get(pdfPath)!)}
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => confirmDeleteJobsByPdf(pdfPath, group.name)}
                  className="px-3 py-1.5 bg-error-bg hover:bg-red-700 text-error-text hover:text-white rounded text-sm transition"
                >
                  {t.deletePdf}
                </button>
                <button
                  onClick={() => handleOpenFromHistory(pdfPath)}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 rounded text-sm font-medium transition text-white"
                >
                  {t.open}
                </button>
              </div>
            </div>

            {/* Job list under this PDF */}
            <div className="space-y-2">
              {group.jobs.map((job) => (
                <button
                  key={job.id}
                  className="flex items-center justify-between py-2 px-3 bg-surface rounded hover:bg-hover transition cursor-pointer w-full text-left"
                  onClick={() => navigate(`/job/${job.id}`)}
                >
                  <div className="flex gap-4 text-sm text-tertiary">
                    <span className="text-secondary">
                      {new Date(job.createdAt).toLocaleString()}
                    </span>
                    <span>{t.slices(job.sliceCount)}</span>
                    <span>{job.mode === 'fixed' ? t.fixed : t.auto}</span>
                    {jobSizeMap.has(job.id) && (
                      <span>{formatBytes(jobSizeMap.get(job.id)!)}</span>
                    )}
                  </div>
                  <span className="text-xs text-faint">&#9654;</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
