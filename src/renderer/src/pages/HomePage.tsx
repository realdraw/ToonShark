import {useCallback, useEffect, useMemo, useState} from 'react'
import {useNavigate} from 'react-router-dom'
import {useJobStore} from '../stores/jobStore'
import {useTranslation} from '../i18n'
import type {JobMeta} from '@shared/types'
import {extractSourceName, formatBytes} from '@shared/utils'
import {getFileExtension, isPsdFile} from '@shared/constants'
import {useFileDrop} from '../hooks/useFileDrop'
import logo from '../assets/logo.svg'
import {useMergedJobs} from '../hooks/useMergedJobs'
import {useStorageInfo} from '../hooks/useStorageInfo'
import {useDeleteActions} from '../hooks/useDeleteActions'
import {DropOverlay} from '../components/DropOverlay'
import {MergePsdModal} from '../components/MergePsdModal'

const STORAGE_WARNING_THRESHOLD = 10 * 1024 * 1024 * 1024 // 10GB

export default function HomePage() {
  const navigate = useNavigate()
  const t = useTranslation()
  const { fileList, sessionResults, recentJobs, isLoading, isRunning, runningFilePath, fetchRecentJobs, addFile, addFileByPath, setActiveFile, removeFile } = useJobStore()
  const { storageInfo, refreshStorage } = useStorageInfo()
  const { confirmDeleteJobsBySource, confirmDeleteAll } = useDeleteActions(t, refreshStorage)
  const [mergeModalPaths, setMergeModalPaths] = useState<string[] | null>(null)

  useEffect(() => {
    fetchRecentJobs()
  }, [fetchRecentJobs])

  const allJobs = useMergedJobs(sessionResults, recentJobs)

  // Group jobs by source file
  const groupedBySource = useMemo(() => {
    const map = new Map<string, { name: string; jobs: JobMeta[] }>()
    for (const job of allJobs) {
      const key = job.sourceFilePath
      if (!map.has(key)) {
        map.set(key, { name: extractSourceName(key), jobs: [] })
      }
      map.get(key)!.jobs.push(job)
    }
    return Array.from(map.entries())
  }, [allJobs])

  // Map sourceFilePath -> size from storage info
  const sourceSizeMap = useMemo(() => {
    const map = new Map<string, number>()
    if (storageInfo) {
      for (const src of storageInfo.sources) {
        map.set(src.sourceFilePath, src.size)
      }
    }
    return map
  }, [storageInfo])

  // Map jobId -> size from storage info
  const jobSizeMap = useMemo(() => {
    const map = new Map<string, number>()
    if (storageInfo) {
      for (const src of storageInfo.sources) {
        for (const job of src.jobs) {
          map.set(job.jobId, job.size)
        }
      }
    }
    return map
  }, [storageInfo])

  const handleSelectFile = async () => {
    const prevCount = useJobStore.getState().fileList.length
    await addFile()
    const { fileList } = useJobStore.getState()
    if (fileList.length > prevCount) {
      navigate('/workspace')
    }
  }

  const handleOpenFromHistory = (filePath: string) => {
    addFileByPath(filePath)
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

  const handleFileDrop = useCallback((paths: string[]) => {
    if (paths.length >= 2 && paths.every(isPsdFile)) {
      setMergeModalPaths(paths)
      return
    }
    for (const path of paths) addFileByPath(path)
    navigate('/workspace')
  }, [addFileByPath, navigate])

  const { isDragging, dropProps } = useFileDrop({ onDrop: handleFileDrop })

  /** Format extension badge label */
  const extBadge = (filePath: string) => getFileExtension(filePath).replace('.', '').toUpperCase() || 'FILE'

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
            onClick={handleSelectFile}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-medium transition text-white"
          >
            {t.openFile}
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

      {fileList.length > 0 && (
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-secondary mb-3">{t.openFiles}</h2>
          <div className="flex flex-wrap gap-2">
            {fileList.map((file) => (
              <div
                key={file.path}
                role="button"
                tabIndex={0}
                className="group flex items-center gap-2 px-3 py-2 bg-blue-600/20 border border-blue-500/30 rounded-lg hover:bg-blue-600/30 transition cursor-pointer"
                onClick={() => {
                  setActiveFile(file.path)
                  navigate('/workspace')
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    setActiveFile(file.path)
                    navigate('/workspace')
                  }
                }}
              >
                {isRunning && runningFilePath === file.path ? (
                  <span className="flex-shrink-0 w-3.5 h-3.5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <span className="text-xs text-blue-400 font-medium">{extBadge(file.path)}</span>
                )}
                <span className="text-sm text-primary truncate max-w-[200px]">{file.name}</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    removeFile(file.path)
                  }}
                  className="opacity-0 group-hover:opacity-100 text-muted hover:text-primary transition text-xs ml-1 bg-transparent border-none p-0 cursor-pointer"
                >
                  x
                </button>
              </div>
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
          <div className="text-4xl mb-4 opacity-40">PDF / JPG / PNG / PSD</div>
          <p className="text-lg mb-2">{t.noJobsTitle}</p>
          <p className="text-sm mb-4">{t.noJobsDesc}</p>
          <p className="text-xs text-faint">{t.dropFileHere}</p>
        </div>
      )}

      <div className="space-y-6">
        {!isLoading && allJobs.length > 0 && (
          <div className="text-center py-4 border-2 border-dashed border-border rounded-lg text-faint text-xs hover:border-blue-500/40 hover:text-muted transition-colors cursor-default">
            {t.dropFileHere}
          </div>
        )}
        {groupedBySource.map(([filePath, group]) => (
          <div key={filePath} className="bg-surface-t rounded-lg border border-border p-4">
            {/* Source Header */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="bg-blue-600/20 text-blue-400 px-2 py-0.5 rounded text-xs font-medium">
                  {extBadge(filePath)}
                </span>
                <h3 className="font-medium text-primary">{group.name}</h3>
                <span className="text-xs text-muted">
                  {t.runs(group.jobs.length)}
                </span>
                {sourceSizeMap.has(filePath) && (
                  <span className="text-xs text-muted">
                    · {formatBytes(sourceSizeMap.get(filePath)!)}
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => confirmDeleteJobsBySource(filePath, group.name)}
                  className="px-3 py-1.5 bg-error-bg hover:bg-red-700 text-error-text hover:text-white rounded text-sm transition"
                >
                  {t.deleteSource}
                </button>
                <button
                  onClick={() => handleOpenFromHistory(filePath)}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 rounded text-sm font-medium transition text-white"
                >
                  {t.open}
                </button>
              </div>
            </div>

            {/* Job list under this source */}
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

      {mergeModalPaths && (
        <MergePsdModal
          open
          filePaths={mergeModalPaths}
          onCancel={() => setMergeModalPaths(null)}
          onMerged={(result) => {
            setMergeModalPaths(null)
            addFileByPath(result.outputPath)
            navigate('/workspace')
          }}
        />
      )}
    </div>
  )
}
