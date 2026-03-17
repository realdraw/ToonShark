import {useEffect, useMemo, useState} from 'react'
import {useParams} from 'react-router-dom'
import {useGoBack} from '../hooks/useGoBack'
import {useJobStore} from '../stores/jobStore'
import {useTranslation} from '../i18n'
import {useToastStore} from '../stores/toastStore'
import type {Country, ExportHistoryEntry, ExportPlatformEntry} from '@shared/types'

export default function ExportPage() {
  const { jobId } = useParams<{ jobId: string }>()
  const goBack = useGoBack(`/job/${jobId}`)
  const t = useTranslation()
  const { currentJob, fetchJobDetail, isLoading, isExporting, exportProgress, exportResult, runExport, clearExportResult, error } = useJobStore()
  const addToast = useToastStore((s) => s.addToast)

  const [countries, setCountries] = useState<Country[]>([])
  const [expandedCountries, setExpandedCountries] = useState<Set<string>>(new Set())
  const [selectedPlatforms, setSelectedPlatforms] = useState<Set<string>>(new Set())
  const [exportHistory, setExportHistory] = useState<Map<string, ExportHistoryEntry>>(new Map())

  const historyKey = (countryId: string, platformId: string) => `${countryId}/${platformId}`

  useEffect(() => {
    if (jobId) {
      fetchJobDetail(jobId)
      window.api.getExportHistory(jobId).then((entries) => {
        setExportHistory(new Map(entries.map((e) => [historyKey(e.countryId, e.platformId), e])))
      })
    }
    window.api.getCountryPresets().then((c) => {
      setCountries(c)
      setExpandedCountries(new Set(c.map((cc) => cc.id)))
    })
    return () => { clearExportResult() }
  }, [jobId, fetchJobDetail, clearExportResult])

  const toggleCountry = (countryId: string) => {
    setExpandedCountries((prev) => {
      const next = new Set(prev)
      if (next.has(countryId)) next.delete(countryId)
      else next.add(countryId)
      return next
    })
  }

  const togglePlatform = (countryId: string, platformId: string) => {
    const key = historyKey(countryId, platformId)
    if (exportHistory.has(key)) return
    setSelectedPlatforms((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const toggleAllInCountry = (country: Country) => {
    const selectablePlatforms = country.platforms.filter((p) => !exportHistory.has(historyKey(country.id, p.id)))
    if (selectablePlatforms.length === 0) return
    const allSelected = selectablePlatforms.every((p) => selectedPlatforms.has(historyKey(country.id, p.id)))
    setSelectedPlatforms((prev) => {
      const next = new Set(prev)
      for (const p of selectablePlatforms) {
        const key = historyKey(country.id, p.id)
        if (allSelected) next.delete(key)
        else next.add(key)
      }
      return next
    })
  }

  const selectedEntries = useMemo((): ExportPlatformEntry[] => {
    const entries: ExportPlatformEntry[] = []
    for (const country of countries) {
      for (const p of country.platforms) {
        if (selectedPlatforms.has(historyKey(country.id, p.id))) {
          entries.push({ countryId: country.id, platform: p })
        }
      }
    }
    return entries
  }, [countries, selectedPlatforms])

  const handleExport = async () => {
    if (!jobId || selectedEntries.length === 0) return

    try {
      const result = await runExport({ jobId, entries: selectedEntries })
      // Refresh history after export
      const historyEntries = await window.api.getExportHistory(jobId)
      setExportHistory(new Map(historyEntries.map((e) => [historyKey(e.countryId, e.platformId), e])))
      // Clear selection for newly exported platforms
      setSelectedPlatforms((prev) => {
        const next = new Set(prev)
        for (const entry of selectedEntries) next.delete(historyKey(entry.countryId, entry.platform.id))
        return next
      })
      addToast(
        result.totalWarnings > 0 ? 'info' : 'success',
        t.toastExportSuccess(result.totalFiles)
      )
    } catch {
      addToast('error', t.toastExportFailed)
    }
  }

  if (isLoading) return <div className="p-6 text-tertiary">{t.loading}</div>
  if (!currentJob || currentJob.id !== jobId) return <div className="p-6 text-tertiary">{t.jobNotFound}</div>

  if (currentJob.files.length === 0) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <button onClick={goBack} className="text-tertiary hover:text-primary transition">{t.back}</button>
          <h1 className="text-2xl font-bold text-primary">{t.exportTitle}</h1>
        </div>
        <p className="text-tertiary">{t.exportNoSlices}</p>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <button onClick={goBack} className="text-tertiary hover:text-primary transition">{t.back}</button>
        <h1 className="text-2xl font-bold text-primary">{t.exportTitle}</h1>
        <span className="text-sm text-tertiary">{currentJob.title} — {t.slices(currentJob.sliceCount)}</span>
      </div>

      {/* Country / Platform Selection */}
      <div className="space-y-3 mb-6">
        {countries.map((country) => {
          const isExpanded = expandedCountries.has(country.id)
          const selectablePlatforms = country.platforms.filter((p) => !exportHistory.has(historyKey(country.id, p.id)))
          const allSelected = selectablePlatforms.length > 0 && selectablePlatforms.every((p) => selectedPlatforms.has(historyKey(country.id, p.id)))
          const someSelected = selectablePlatforms.some((p) => selectedPlatforms.has(historyKey(country.id, p.id)))
          const allExported = selectablePlatforms.length === 0 && country.platforms.length > 0

          return (
            <div key={country.id} className="bg-surface rounded-lg border border-border overflow-hidden">
              <button
                onClick={() => toggleCountry(country.id)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-hover transition text-left"
              >
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted">{isExpanded ? '\u25BC' : '\u25B6'}</span>
                  <input
                    type="checkbox"
                    checked={allSelected}
                    disabled={allExported}
                    ref={(el) => { if (el) el.indeterminate = someSelected && !allSelected }}
                    onChange={(e) => { e.stopPropagation(); toggleAllInCountry(country) }}
                    onClick={(e) => e.stopPropagation()}
                    className="rounded"
                  />
                  <span className="text-primary font-medium">{t.countryName(country.id)}</span>
                  <span className="text-xs text-muted">{t.platformCount(country.platforms.length)}</span>
                  {allExported && (
                    <span className="text-xs text-success-text bg-success-bg px-2 py-0.5 rounded">{t.exportedBadge}</span>
                  )}
                </div>
              </button>

              {isExpanded && (
                <div className="border-t border-border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-muted text-xs">
                        <th className="px-4 py-2 text-left w-8"></th>
                        <th className="px-4 py-2 text-left">{t.exportPlatform}</th>
                        <th className="px-4 py-2 text-left">{t.exportWidth}</th>
                        <th className="px-4 py-2 text-left">{t.exportFormat}</th>
                        <th className="px-4 py-2 text-left">{t.exportMaxSize}</th>
                        <th className="px-4 py-2 text-left"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {country.platforms.map((platform) => {
                        const key = historyKey(country.id, platform.id)
                        const historyEntry = exportHistory.get(key)
                        const isExported = !!historyEntry

                        return (
                          <tr
                            key={platform.id}
                            className={`transition ${isExported ? 'opacity-60' : 'hover:bg-hover cursor-pointer'}`}
                            onClick={() => togglePlatform(country.id, platform.id)}
                          >
                            <td className="px-4 py-2">
                              <input
                                type="checkbox"
                                checked={isExported || selectedPlatforms.has(key)}
                                disabled={isExported}
                                onChange={() => togglePlatform(country.id, platform.id)}
                                onClick={(e) => e.stopPropagation()}
                                className="rounded"
                              />
                            </td>
                            <td className="px-4 py-2 text-secondary">{t.platformName(platform.id)}</td>
                            <td className="px-4 py-2 text-tertiary">{platform.episode.width}px</td>
                            <td className="px-4 py-2 text-tertiary uppercase">{platform.episode.format}</td>
                            <td className="px-4 py-2 text-tertiary">
                              {platform.episode.maxFileSizeMB ? `${platform.episode.maxFileSizeMB}MB` : '-'}
                            </td>
                            <td className="px-4 py-2">
                              {isExported && (
                                <span className="text-xs text-success-text bg-success-bg px-2 py-0.5 rounded whitespace-nowrap">
                                  {t.exportedAt(new Date(historyEntry.exportedAt).toLocaleDateString())}
                                </span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Run Export Button */}
      <button
        onClick={handleExport}
        disabled={selectedPlatforms.size === 0 || isExporting}
        className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-elevated disabled:text-muted rounded-lg font-medium transition mb-4 text-white"
      >
        {isExporting ? t.exportRunning : selectedPlatforms.size === 0 ? t.exportNoPlatforms : t.exportRun}
      </button>

      {/* Progress */}
      {isExporting && exportProgress && (
        <div className="mb-4">
          <div className="flex items-center justify-between text-xs text-tertiary mb-1">
            <span>{t[exportProgress.stepKey]} ({exportProgress.current}/{exportProgress.total})</span>
            <span>{exportProgress.percent}%</span>
          </div>
          <div className="w-full bg-elevated rounded-full h-2 overflow-hidden">
            <div
              className="bg-blue-500 h-full rounded-full transition-all duration-300"
              style={{ width: `${exportProgress.percent}%` }}
            />
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-error-bg border border-error-border rounded p-3 mb-4 text-error-text text-sm">
          {error}
        </div>
      )}

      {/* Export Result (just completed) */}
      {exportResult && (
        <div className="space-y-3 mb-6">
          <div className="flex items-center gap-3 text-sm">
            <span className="text-success-text font-medium">{t.exportSuccess}</span>
            <span className="text-tertiary">{t.exportFiles(exportResult.totalFiles)}</span>
            {exportResult.totalWarnings > 0 && (
              <span className="text-warning-text">{t.exportWarnings(exportResult.totalWarnings)}</span>
            )}
          </div>

          {exportResult.platforms.map((pr) => (
            <div key={pr.platformId} className="bg-surface rounded-lg border border-border p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-primary font-medium">{t.platformName(pr.platformId)}</span>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-tertiary">{t.exportFiles(pr.fileCount)}</span>
                  <button
                    onClick={() => window.api.openPath(pr.outputDir)}
                    className="px-3 py-1 bg-elevated hover:bg-hover-elevated rounded text-xs transition"
                  >
                    {t.exportOpenFolder}
                  </button>
                </div>
              </div>

              {pr.warnings.length > 0 && (
                <div className="space-y-1 mt-2">
                  {pr.warnings.map((w, i) => (
                    <div key={i} className="text-xs text-warning-text bg-warning-bg rounded px-2 py-1">
                      {w.file}: {w.message}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Export History (persisted) */}
      {exportHistory.size > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-tertiary">{t.exportedBadge}</h2>
          {Array.from(exportHistory.values())
            .filter((entry) => !exportResult?.platforms.some((pr) => pr.countryId === entry.countryId && pr.platformId === entry.platformId))
            .map((entry) => (
            <div key={historyKey(entry.countryId, entry.platformId)} className="bg-surface rounded-lg border border-border p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-primary font-medium">{t.platformName(entry.platformId)}</span>
                  <span className="text-xs text-muted">
                    {t.exportedAt(new Date(entry.exportedAt).toLocaleDateString())}
                  </span>
                  <span className="text-xs text-tertiary">{t.exportFiles(entry.fileCount)}</span>
                </div>
                <button
                  onClick={() => window.api.openPath(entry.outputDir)}
                  className="px-3 py-1 bg-elevated hover:bg-hover-elevated rounded text-xs transition"
                >
                  {t.exportOpenFolder}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
