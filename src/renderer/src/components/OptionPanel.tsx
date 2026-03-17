import {useEffect, useState} from 'react'
import {OptionField} from './OptionField'
import type {CutPosition, JobProgress} from '@shared/types'
import type {PdfOptions} from '../stores/workspaceStore'
import {PDF_SCALE_MAX, PDF_SCALE_MIN} from '@shared/constants'
import type {TranslationKeys} from '../i18n/en'

type OptionPanelProps = {
  pdfPath: string | null
  options: PdfOptions
  onOptionChange: <K extends keyof PdfOptions>(key: K, value: PdfOptions[K]) => void
  isRunning: boolean
  canRun: boolean
  progress: JobProgress | null
  error: string | null
  runningPdfName?: string
  onRun: () => void
  t: TranslationKeys
}

export function OptionPanel({
  pdfPath, options, onOptionChange,
  isRunning, canRun, progress, error, runningPdfName,
  onRun, t
}: OptionPanelProps) {
  const [pageDims, setPageDims] = useState<{ width: number; height: number } | null>(null)

  useEffect(() => {
    setPageDims(null)
    if (!pdfPath) return
    let cancelled = false
    window.api.getPdfPageDimensions(pdfPath)
      .then((dims) => { if (!cancelled) setPageDims(dims) })
      .catch(() => { if (!cancelled) setPageDims(null) })
    return () => { cancelled = true }
  }, [pdfPath])

  const set = <K extends keyof PdfOptions>(key: K) =>
    (value: PdfOptions[K]) => onOptionChange(key, value)

  return (
    <div className="w-72 flex-shrink-0 bg-surface border-r border-border overflow-y-auto p-4">
      {/* Prefix */}
      <OptionField label={t.filePrefix} desc={t.filePrefixDesc}>
        <input
          type="text"
          value={options.prefix}
          onChange={(e) => onOptionChange('prefix', e.target.value)}
          className="w-full px-3 py-1.5 bg-input border border-border-subtle rounded text-sm"
        />
      </OptionField>

      {/* Mode */}
      <OptionField label={t.sliceMode} desc={t.sliceModeDesc}>
        <div className="flex gap-2">
          <button
            onClick={() => onOptionChange('mode', 'auto')}
            className={`flex-1 py-1.5 rounded text-xs font-medium transition ${
              options.mode === 'auto'
                ? 'bg-blue-600 text-white'
                : 'bg-input text-tertiary hover:bg-hover'
            }`}
          >
            {t.auto}
          </button>
          <button
            onClick={() => onOptionChange('mode', 'fixed')}
            className={`flex-1 py-1.5 rounded text-xs font-medium transition ${
              options.mode === 'fixed'
                ? 'bg-blue-600 text-white'
                : 'bg-input text-tertiary hover:bg-hover'
            }`}
          >
            {t.fixed}
          </button>
        </div>
      </OptionField>

      {/* Auto Mode Options */}
      {options.mode === 'auto' && (
        <div className="space-y-3 mb-4 bg-options-bg p-3 rounded border border-border">
          <OptionField compact label={t.whiteThreshold} desc={t.whiteThresholdDesc}>
            <div>
              <input
                type="range"
                min={230}
                max={255}
                value={options.whiteThreshold}
                onChange={(e) => onOptionChange('whiteThreshold', Number(e.target.value))}
                className="w-full"
              />
              <div className="flex justify-between text-[10px] text-muted mt-0.5">
                <span>{t.loose}</span>
                <span
                  className="px-1.5 py-0.5 rounded"
                  style={{ background: `rgb(${options.whiteThreshold},${options.whiteThreshold},${options.whiteThreshold})`, color: '#000' }}
                >
                  {options.whiteThreshold === 255 ? t.whiteOnly : `${options.whiteThreshold}`}
                </span>
                <span>{t.strict}</span>
              </div>
            </div>
          </OptionField>
          <OptionField compact label={t.minWhiteRunLabel} desc={t.minWhiteRunDesc}>
            <input
              type="number"
              value={options.minWhiteRun}
              onChange={(e) => onOptionChange('minWhiteRun', Number(e.target.value))}
              min={1}
              max={500}
              className="w-full px-2 py-1.5 bg-input border border-border-subtle rounded text-sm"
            />
          </OptionField>
          <OptionField compact label={t.minSliceHeightLabel} desc={t.minSliceHeightDesc}>
            <input
              type="number"
              value={options.minSliceHeight}
              onChange={(e) => onOptionChange('minSliceHeight', Number(e.target.value))}
              min={0}
              max={2000}
              className="w-full px-2 py-1.5 bg-input border border-border-subtle rounded text-sm"
            />
          </OptionField>
          <OptionField compact label={t.cutPositionLabel} desc={t.cutPositionDesc}>
            <select
              value={options.cutPosition}
              onChange={(e) => onOptionChange('cutPosition', e.target.value as CutPosition)}
              className="w-full px-2 py-1.5 bg-input border border-border-subtle rounded text-sm"
            >
              <option value="middle">{t.cutMiddle}</option>
              <option value="before-color">{t.cutBeforeColor}</option>
            </select>
          </OptionField>
        </div>
      )}

      {/* Fixed Mode Options */}
      {options.mode === 'fixed' && (
        <div className="space-y-3 mb-4 bg-options-bg p-3 rounded border border-border">
          <OptionField compact label={t.sliceHeightLabel} desc={t.sliceHeightDesc}>
            <input
              type="number"
              value={options.sliceHeight}
              onChange={(e) => onOptionChange('sliceHeight', Number(e.target.value))}
              min={100}
              max={5000}
              className="w-full px-2 py-1.5 bg-input border border-border-subtle rounded text-sm"
            />
          </OptionField>
          <OptionField compact label={t.startOffsetLabel} desc={t.startOffsetDesc}>
            <input
              type="number"
              value={options.startOffset}
              onChange={(e) => onOptionChange('startOffset', Number(e.target.value))}
              min={0}
              className="w-full px-2 py-1.5 bg-input border border-border-subtle rounded text-sm"
            />
          </OptionField>
        </div>
      )}

      {/* PDF Scale */}
      <OptionField label={t.pdfScaleLabel} desc={t.pdfScaleDesc}>
        <div>
          <input
            type="range"
            min={PDF_SCALE_MIN}
            max={PDF_SCALE_MAX}
            step={0.5}
            value={options.pdfScale}
            onChange={(e) => onOptionChange('pdfScale', Number(e.target.value))}
            className="w-full"
          />
          <div className="flex justify-between text-[10px] text-muted mt-0.5">
            <span>{PDF_SCALE_MIN}x</span>
            <span className="text-secondary font-medium">{options.pdfScale}x</span>
            <span>{PDF_SCALE_MAX}x</span>
          </div>
          {pageDims && (
            <div className="text-[10px] text-tertiary mt-1 text-center">
              {Math.floor(pageDims.width * options.pdfScale)} x {Math.floor(pageDims.height * options.pdfScale)}px
            </div>
          )}
        </div>
      </OptionField>

      {error && (
        <div className="bg-error-bg border border-error-border rounded p-2 mb-4 text-error-text text-xs">
          {error}
        </div>
      )}

      {/* Run Button */}
      <button
        onClick={onRun}
        disabled={!canRun || isRunning}
        className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-elevated disabled:text-muted rounded-lg font-medium text-sm transition text-white"
      >
        {isRunning ? t.processing : t.run}
      </button>

      {/* Progress Indicator */}
      {isRunning && progress && (
        <div className="mt-3">
          {runningPdfName && (
            <div className="flex items-center gap-1.5 text-xs text-blue-300 mb-1.5 truncate">
              <span className="flex-shrink-0 w-3 h-3 border-[1.5px] border-blue-400 border-t-transparent rounded-full animate-spin" />
              <span className="truncate">{runningPdfName}.pdf</span>
            </div>
          )}
          <div className="flex items-center justify-between text-xs text-tertiary mb-1">
            <span>
              {t[progress.stepKey]}
              {progress.total > 0 && ` (${progress.current}/${progress.total})`}
            </span>
            <span>{progress.percent}%</span>
          </div>
          <div className="w-full bg-elevated rounded-full h-2 overflow-hidden">
            <div
              className="bg-blue-500 h-full rounded-full transition-all duration-300"
              style={{ width: `${progress.percent}%` }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
