import {useCallback, useEffect} from 'react'
import {useNavigate} from 'react-router-dom'
import {useJobStore} from '../stores/jobStore'
import {useSettingsStore} from '../stores/settingsStore'
import {type PdfOptions, useWorkspaceStore} from '../stores/workspaceStore'
import {useTranslation} from '../i18n'
import {useToastStore} from '../stores/toastStore'
import {useFileDrop} from '../hooks/useFileDrop'
import {useMergedJobs} from '../hooks/useMergedJobs'
import {useStorageInfo} from '../hooks/useStorageInfo'
import {useDeleteActions} from '../hooks/useDeleteActions'
import {OptionPanel} from '../components/OptionPanel'
import {ResultsPanel} from '../components/ResultsPanel'
import {DropOverlay} from '../components/DropOverlay'
import {isPdfFile, getFileExtension} from '@shared/constants'

export default function WorkspacePage() {
  const navigate = useNavigate()
  const t = useTranslation()
  const {
    fileList,
    activeFilePath,
    addFile,
    addFileByPath,
    setActiveFile,
    removeFile,
    sessionResults,
    recentJobs,
    fetchRecentJobs,
    runSliceJob,
    isRunning,
    runningFilePath,
    progress,
    error
  } = useJobStore()
  const { settings, loadSettings } = useSettingsStore()
  const { getOptions, initOptions, updateOption, setPrefix, setSettings } = useWorkspaceStore()

  const { storageInfo, refreshStorage } = useStorageInfo()
  const { confirmDeleteJob } = useDeleteActions(t, refreshStorage)
  const activeJobs = useMergedJobs(sessionResults, recentJobs, activeFilePath)

  useEffect(() => {
    loadSettings()
    fetchRecentJobs()
  }, [loadSettings, fetchRecentJobs])

  // Store settings reference for new tab defaults
  useEffect(() => {
    if (settings) setSettings(settings)
  }, [settings, setSettings])

  // Initialize options for active file when it changes
  useEffect(() => {
    if (activeFilePath) initOptions(activeFilePath)
  }, [activeFilePath, initOptions])

  // Get current tab's options
  const opts = activeFilePath ? getOptions(activeFilePath) : null

  // Update prefix when active file changes (only if prefix is empty)
  const activeFile = fileList.find((p) => p.path === activeFilePath)
  useEffect(() => {
    if (activeFile && activeFilePath && opts && !opts.prefix) {
      const defaultPrefix = settings?.naming.defaultPrefix
      if (defaultPrefix) {
        setPrefix(activeFilePath, defaultPrefix)
      } else {
        setPrefix(
          activeFilePath,
          activeFile.name.replace(/\s+/g, '_').replace(/[^\p{L}\p{N}_-]/gu, '')
        )
      }
    }
  }, [activeFile, activeFilePath, opts, settings, setPrefix])

  // Redirect if no files
  useEffect(() => {
    if (fileList.length === 0) navigate('/')
  }, [fileList.length, navigate])

  const activeFileStorage = storageInfo?.sources.find((p) => p.sourceFilePath === activeFilePath) ?? null

  const addToast = useToastStore((s) => s.addToast)

  const handleRun = async () => {
    if (!activeFilePath || !activeFile || !opts) return

    const prefix = opts.prefix || activeFile.name
    const options =
      opts.mode === 'fixed'
        ? { sliceHeight: opts.sliceHeight, startOffset: opts.startOffset, minSliceHeight: opts.minSliceHeight }
        : { whiteThreshold: opts.whiteThreshold, minWhiteRun: opts.minWhiteRun, minSliceHeight: opts.minSliceHeight, cutPosition: opts.cutPosition }

    // Duplicate detection: check if a job with the same settings already exists
    const isDuplicate = activeJobs.some((job) => {
      if (job.mode !== opts.mode) return false
      if (job.prefix !== prefix) return false
      if ((job.options.pdfScale ?? 4) !== opts.pdfScale) return false
      if (opts.mode === 'fixed') {
        return job.options.sliceHeight === opts.sliceHeight
          && job.options.startOffset === opts.startOffset
          && job.options.minSliceHeight === opts.minSliceHeight
      }
      return job.options.whiteThreshold === opts.whiteThreshold
        && job.options.minWhiteRun === opts.minWhiteRun
        && job.options.minSliceHeight === opts.minSliceHeight
        && job.options.cutPosition === opts.cutPosition
    })

    if (isDuplicate) {
      addToast('error', t.toastDuplicateJob)
      return
    }

    try {
      const meta = await runSliceJob({
        sourceFilePath: activeFilePath,
        title: activeFile.name,
        prefix,
        mode: opts.mode,
        pdfScale: isPdfFile(activeFilePath) ? opts.pdfScale : undefined,
        options
      })
      addToast('success', t.toastJobSuccess(meta.sliceCount))
      refreshStorage()
    } catch {
      addToast('error', t.toastJobFailed)
    }
  }

  const handleCloseFile = (path: string, e: React.MouseEvent) => {
    e.stopPropagation()
    removeFile(path)
  }

  const handleOptionChange = useCallback(<K extends keyof PdfOptions>(key: K, value: PdfOptions[K]) => {
    if (activeFilePath) updateOption(activeFilePath, key, value)
  }, [activeFilePath, updateOption])

  const handleFileDrop = useCallback((paths: string[]) => {
    for (const path of paths) addFileByPath(path)
  }, [addFileByPath])

  const { isDragging, dropProps } = useFileDrop({ onDrop: handleFileDrop })

  if (fileList.length === 0 || !opts || !activeFilePath) return null

  /** Display name with extension for tab label */
  const tabLabel = (file: { path: string; name: string }) => {
    const ext = getFileExtension(file.path).replace('.', '').toUpperCase()
    return `${file.name}.${ext.toLowerCase()}`
  }

  return (
    <div
      className="flex h-screen flex-col relative"
      {...dropProps}
    >
      {isDragging && <DropOverlay />}
      {/* Top: File Tabs */}
      <div className="flex-shrink-0 bg-surface border-b border-border flex items-center">
        <div className="flex overflow-x-auto flex-1">
          {fileList.map((file) => (
            <div
              key={file.path}
              role="button"
              tabIndex={0}
              onClick={() => setActiveFile(file.path)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') setActiveFile(file.path)
              }}
              className={`group flex items-center gap-2 px-4 py-2.5 text-sm cursor-pointer border-b-2 transition whitespace-nowrap ${
                file.path === activeFilePath
                  ? 'border-blue-500 text-primary bg-base'
                  : 'border-transparent text-tertiary hover:text-secondary hover:bg-hover'
              }`}
            >
              {isRunning && runningFilePath === file.path && (
                <span className="flex-shrink-0 w-3.5 h-3.5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
              )}
              <span className="truncate max-w-[200px]">{tabLabel(file)}</span>
              <button
                type="button"
                onClick={(e) => handleCloseFile(file.path, e)}
                className="opacity-0 group-hover:opacity-100 text-muted hover:text-primary transition ml-1 text-xs bg-transparent border-none p-0 cursor-pointer"
              >
                x
              </button>
            </div>
          ))}
        </div>
        <button
          onClick={addFile}
          className="flex-shrink-0 px-4 py-2.5 text-tertiary hover:text-primary hover:bg-hover transition text-sm border-l border-border"
        >
          {t.addFile}
        </button>
        <button
          onClick={() => navigate('/')}
          className="flex-shrink-0 px-4 py-2.5 text-tertiary hover:text-primary hover:bg-hover transition text-sm border-l border-border"
        >
          {t.home}
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <OptionPanel
          filePath={activeFilePath}
          options={opts}
          onOptionChange={handleOptionChange}
          isRunning={isRunning} canRun={!!activeFilePath} progress={progress} error={error}
          runningFileName={runningFilePath ? fileList.find(p => p.path === runningFilePath)?.name : undefined}
          onRun={handleRun} t={t}
        />

        <ResultsPanel
          activeJobs={activeJobs}
          activePdfName={activeFile?.name}
          activePdfStorage={activeFileStorage}
          navigate={navigate}
          onDeleteJob={confirmDeleteJob}
          t={t}
        />
      </div>
    </div>
  )
}
