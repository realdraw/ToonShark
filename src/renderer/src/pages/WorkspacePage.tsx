import {useCallback, useEffect} from 'react'
import {useNavigate} from 'react-router-dom'
import {useJobStore} from '../stores/jobStore'
import {useSettingsStore} from '../stores/settingsStore'
import {type PdfOptions, useWorkspaceStore} from '../stores/workspaceStore'
import {useTranslation} from '../i18n'
import {useToastStore} from '../stores/toastStore'
import {usePdfDrop} from '../hooks/usePdfDrop'
import {useMergedJobs} from '../hooks/useMergedJobs'
import {useStorageInfo} from '../hooks/useStorageInfo'
import {useDeleteActions} from '../hooks/useDeleteActions'
import {OptionPanel} from '../components/OptionPanel'
import {ResultsPanel} from '../components/ResultsPanel'
import {DropOverlay} from '../components/DropOverlay'

export default function WorkspacePage() {
  const navigate = useNavigate()
  const t = useTranslation()
  const {
    pdfList,
    activePdfPath,
    addPdf,
    addPdfByPath,
    setActivePdf,
    removePdf,
    sessionResults,
    recentJobs,
    fetchRecentJobs,
    runSliceJob,
    isRunning,
    runningPdfPath,
    progress,
    error
  } = useJobStore()
  const { settings, loadSettings } = useSettingsStore()
  const { getOptions, initOptions, updateOption, setPrefix, setSettings } = useWorkspaceStore()

  const { storageInfo, refreshStorage } = useStorageInfo()
  const { confirmDeleteJob } = useDeleteActions(t, refreshStorage)
  const activeJobs = useMergedJobs(sessionResults, recentJobs, activePdfPath)

  useEffect(() => {
    loadSettings()
    fetchRecentJobs()
  }, [loadSettings, fetchRecentJobs])

  // Store settings reference for new tab defaults
  useEffect(() => {
    if (settings) setSettings(settings)
  }, [settings, setSettings])

  // Initialize options for active PDF when it changes
  useEffect(() => {
    if (activePdfPath) initOptions(activePdfPath)
  }, [activePdfPath, initOptions])

  // Get current tab's options
  const opts = activePdfPath ? getOptions(activePdfPath) : null

  // Update prefix when active PDF changes (only if prefix is empty)
  const activePdf = pdfList.find((p) => p.path === activePdfPath)
  useEffect(() => {
    if (activePdf && activePdfPath && opts && !opts.prefix) {
      const defaultPrefix = settings?.naming.defaultPrefix
      if (defaultPrefix) {
        setPrefix(activePdfPath, defaultPrefix)
      } else {
        setPrefix(
          activePdfPath,
          activePdf.name.replace(/\s+/g, '_').replace(/[^\p{L}\p{N}_-]/gu, '')
        )
      }
    }
  }, [activePdf, activePdfPath, opts, settings, setPrefix])

  // Redirect if no PDFs
  useEffect(() => {
    if (pdfList.length === 0) navigate('/')
  }, [pdfList.length, navigate])

  const activePdfStorage = storageInfo?.pdfs.find((p) => p.sourcePdfPath === activePdfPath) ?? null

  const addToast = useToastStore((s) => s.addToast)

  const handleRun = async () => {
    if (!activePdfPath || !activePdf || !opts) return

    const prefix = opts.prefix || activePdf.name
    const options =
      opts.mode === 'fixed'
        ? { sliceHeight: opts.sliceHeight, startOffset: opts.startOffset }
        : { whiteThreshold: opts.whiteThreshold, minWhiteRun: opts.minWhiteRun, minSliceHeight: opts.minSliceHeight, cutPosition: opts.cutPosition }

    // Duplicate detection: check if a job with the same settings already exists
    const isDuplicate = activeJobs.some((job) => {
      if (job.mode !== opts.mode) return false
      if (job.prefix !== prefix) return false
      if ((job.options.pdfScale ?? 4) !== opts.pdfScale) return false
      if (opts.mode === 'fixed') {
        return job.options.sliceHeight === opts.sliceHeight
          && job.options.startOffset === opts.startOffset
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
        sourcePdfPath: activePdfPath,
        title: activePdf.name,
        prefix,
        mode: opts.mode,
        pdfScale: opts.pdfScale,
        options
      })
      addToast('success', t.toastJobSuccess(meta.sliceCount))
      refreshStorage()
    } catch {
      addToast('error', t.toastJobFailed)
    }
  }

  const handleClosePdf = (path: string, e: React.MouseEvent) => {
    e.stopPropagation()
    removePdf(path)
  }

  const handleOptionChange = useCallback(<K extends keyof PdfOptions>(key: K, value: PdfOptions[K]) => {
    if (activePdfPath) updateOption(activePdfPath, key, value)
  }, [activePdfPath, updateOption])

  const handlePdfDrop = useCallback((paths: string[]) => {
    for (const path of paths) addPdfByPath(path)
  }, [addPdfByPath])

  const { isDragging, dropProps } = usePdfDrop({ onDrop: handlePdfDrop })

  if (pdfList.length === 0 || !opts || !activePdfPath) return null

  return (
    <div
      className="flex h-screen flex-col relative"
      {...dropProps}
    >
      {isDragging && <DropOverlay />}
      {/* Top: PDF Tabs */}
      <div className="flex-shrink-0 bg-surface border-b border-border flex items-center">
        <div className="flex overflow-x-auto flex-1">
          {pdfList.map((pdf) => (
            <button
              key={pdf.path}
              onClick={() => setActivePdf(pdf.path)}
              className={`group flex items-center gap-2 px-4 py-2.5 text-sm cursor-pointer border-b-2 transition whitespace-nowrap ${
                pdf.path === activePdfPath
                  ? 'border-blue-500 text-primary bg-base'
                  : 'border-transparent text-tertiary hover:text-secondary hover:bg-hover'
              }`}
            >
              {isRunning && runningPdfPath === pdf.path && (
                <span className="flex-shrink-0 w-3.5 h-3.5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
              )}
              <span className="truncate max-w-[200px]">{pdf.name}.pdf</span>
              <button
                type="button"
                onClick={(e) => handleClosePdf(pdf.path, e)}
                className="opacity-0 group-hover:opacity-100 text-muted hover:text-primary transition ml-1 text-xs bg-transparent border-none p-0 cursor-pointer"
              >
                x
              </button>
            </button>
          ))}
        </div>
        <button
          onClick={addPdf}
          className="flex-shrink-0 px-4 py-2.5 text-tertiary hover:text-primary hover:bg-hover transition text-sm border-l border-border"
        >
          {t.addPdf}
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
          pdfPath={activePdfPath}
          options={opts}
          onOptionChange={handleOptionChange}
          isRunning={isRunning} canRun={!!activePdfPath} progress={progress} error={error}
          runningPdfName={runningPdfPath ? pdfList.find(p => p.path === runningPdfPath)?.name : undefined}
          onRun={handleRun} t={t}
        />

        <ResultsPanel
          activeJobs={activeJobs}
          activePdfName={activePdf?.name}
          activePdfStorage={activePdfStorage}
          navigate={navigate}
          onDeleteJob={confirmDeleteJob}
          t={t}
        />
      </div>
    </div>
  )
}
