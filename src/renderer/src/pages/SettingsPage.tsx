import {useCallback, useEffect, useMemo, useRef, useState} from 'react'
import {useNavigate} from 'react-router-dom'
import {useSettingsStore} from '../stores/settingsStore'
import {useTranslation} from '../i18n'
import type {AppSettings, CutPosition, DevicePreset, Locale, Theme} from '@shared/types'
import {PDF_SCALE_MAX, PDF_SCALE_MIN} from '@shared/constants'
import {useToastStore} from '../stores/toastStore'
import {DevicePresetsSection} from '../components/settings/DevicePresetsSection'

export default function SettingsPage() {
  const navigate = useNavigate()
  const t = useTranslation()
  const { settings, loadSettings, saveSettings, error: settingsError } = useSettingsStore()
  const addToast = useToastStore((s) => s.addToast)
  const [form, setForm] = useState<AppSettings | null>(null)
  const [saved, setSaved] = useState(false)
  const savedTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const [devices, setDevices] = useState<DevicePreset[]>([])
  const [initialDevices, setInitialDevices] = useState<DevicePreset[]>([])

  useEffect(() => {
    loadSettings()
    window.api.getDevicePresets().then((d) => {
      setDevices(d)
      setInitialDevices(d)
    })
  }, [loadSettings])

  useEffect(() => {
    if (settings) setForm({ ...settings })
  }, [settings])

  useEffect(() => {
    return () => { clearTimeout(savedTimerRef.current) }
  }, [])

  const hasChanges = useMemo(() => {
    if (!form || !settings) return false
    return JSON.stringify(form) !== JSON.stringify(settings) ||
      JSON.stringify(devices) !== JSON.stringify(initialDevices)
  }, [form, settings, devices, initialDevices])

  const handleBack = useCallback(() => {
    if (hasChanges && !confirm(t.unsavedChanges)) return
    navigate('/')
  }, [hasChanges, navigate, t])

  const [openSection, setOpenSection] = useState<string | null>('language')

  const toggleSection = (id: string) => {
    setOpenSection((prev) => (prev === id ? null : id))
  }

  if (settingsError) return <div className="p-6 text-error-text">{settingsError}</div>
  if (!form) return <div className="p-6 text-tertiary">{t.loading}</div>

  const update = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev))
  }

  const updateNaming = <K extends keyof AppSettings['naming']>(key: K, value: AppSettings['naming'][K]) => {
    setForm((prev) =>
      prev ? { ...prev, naming: { ...prev.naming, [key]: value } } : prev
    )
  }

  const updateAutoSlice = <K extends keyof AppSettings['autoSlice']>(key: K, value: AppSettings['autoSlice'][K]) => {
    setForm((prev) =>
      prev ? { ...prev, autoSlice: { ...prev.autoSlice, [key]: value } } : prev
    )
  }

  const updatePreview = <K extends keyof AppSettings['preview']>(key: K, value: AppSettings['preview'][K]) => {
    setForm((prev) =>
      prev ? { ...prev, preview: { ...prev.preview, [key]: value } } : prev
    )
  }

  const resetAllSettings = async () => {
    if (!confirm(t.resetAllSettingsConfirm)) return
    const defaults = await window.api.getDefaultSettings()
    setForm(defaults)
    const defaultDevices = await window.api.getDefaultDevicePresets()
    setDevices(defaultDevices)
    addToast('info', t.resetAllSettingsSaveReminder)
  }

  const handleSave = async () => {
    if (!form) return
    try {
      await saveSettings(form)
      await window.api.saveDevicePresets(devices)
      setInitialDevices([...devices])
      setSaved(true)
      clearTimeout(savedTimerRef.current)
      savedTimerRef.current = setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      addToast('error', t.saveSettingsFailed ?? `Failed to save: ${String(err)}`)
    }
  }

  const handleSelectBaseDir = async () => {
    const dir = await window.api.selectBaseDir()
    if (dir) update('baseDir', dir)
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-4 mb-8">
        <button
          onClick={handleBack}
          className="text-tertiary hover:text-primary transition"
        >
          {t.back}
        </button>
        <h1 className="text-2xl font-bold text-primary">{t.settingsTitle}</h1>
      </div>

      <div className="space-y-2">
        {/* Language */}
        <section className="bg-surface border border-border rounded-lg overflow-hidden">
          <button
            onClick={() => toggleSection('language')}
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-hover transition text-left"
          >
            <h2 className="text-sm font-semibold text-secondary">{t.languageSection}</h2>
            <span className="text-xs text-muted">{openSection === 'language' ? '\u25BC' : '\u25B6'}</span>
          </button>
          {openSection === 'language' && (
            <div className="px-4 pb-4 border-t border-border pt-3">
              <label className="block text-sm text-tertiary mb-1">{t.language}</label>
              <select
                value={form.locale}
                onChange={(e) => update('locale', e.target.value as Locale)}
                className="w-full px-3 py-2 bg-input border border-border-subtle rounded text-sm"
              >
                <option value="en">{t.english}</option>
                <option value="ko">{t.korean}</option>
              </select>
            </div>
          )}
        </section>

        {/* Theme */}
        <section className="bg-surface border border-border rounded-lg overflow-hidden">
          <button
            onClick={() => toggleSection('theme')}
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-hover transition text-left"
          >
            <h2 className="text-sm font-semibold text-secondary">{t.themeSection}</h2>
            <span className="text-xs text-muted">{openSection === 'theme' ? '\u25BC' : '\u25B6'}</span>
          </button>
          {openSection === 'theme' && (
            <div className="px-4 pb-4 border-t border-border pt-3">
              <label className="block text-sm text-tertiary mb-1">{t.themeLabel}</label>
              <select
                value={form.theme}
                onChange={(e) => update('theme', e.target.value as Theme)}
                className="w-full px-3 py-2 bg-input border border-border-subtle rounded text-sm"
              >
                <option value="light">{t.themeLight}</option>
                <option value="dark">{t.themeDark}</option>
                <option value="system">{t.themeSystem}</option>
              </select>
            </div>
          )}
        </section>

        {/* Storage */}
        <section className="bg-surface border border-border rounded-lg overflow-hidden">
          <button
            onClick={() => toggleSection('storage')}
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-hover transition text-left"
          >
            <h2 className="text-sm font-semibold text-secondary">{t.storage}</h2>
            <span className="text-xs text-muted">{openSection === 'storage' ? '\u25BC' : '\u25B6'}</span>
          </button>
          {openSection === 'storage' && (
            <div className="px-4 pb-4 border-t border-border pt-3">
              <label className="block text-sm text-tertiary mb-1">{t.baseDir}</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={form.baseDir}
                  readOnly
                  className="flex-1 px-3 py-2 bg-input border border-border-subtle rounded text-sm"
                />
                <button
                  onClick={handleSelectBaseDir}
                  className="px-4 py-2 bg-elevated hover:bg-hover-elevated rounded text-sm transition"
                >
                  {t.browse}
                </button>
                <button
                  onClick={() => form.baseDir && window.api.openPath(form.baseDir)}
                  className="px-4 py-2 bg-elevated hover:bg-hover-elevated rounded text-sm transition"
                >
                  {t.open}
                </button>
              </div>
            </div>
          )}
        </section>

        {/* Slice Defaults */}
        <section className="bg-surface border border-border rounded-lg overflow-hidden">
          <button
            onClick={() => toggleSection('sliceDefaults')}
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-hover transition text-left"
          >
            <h2 className="text-sm font-semibold text-secondary">{t.sliceDefaults}</h2>
            <span className="text-xs text-muted">{openSection === 'sliceDefaults' ? '\u25BC' : '\u25B6'}</span>
          </button>
          {openSection === 'sliceDefaults' && (
            <div className="px-4 pb-4 border-t border-border pt-3">
              <label className="block text-sm text-tertiary mb-1">{t.defaultHeight}</label>
              <input
                type="number"
                value={form.defaultSliceHeight}
                onChange={(e) => update('defaultSliceHeight', Number(e.target.value))}
                min={100}
                max={5000}
                className="w-full px-3 py-2 bg-input border border-border-subtle rounded text-sm"
              />
            </div>
          )}
        </section>

        {/* Auto Slice */}
        <section className="bg-surface border border-border rounded-lg overflow-hidden">
          <button
            onClick={() => toggleSection('autoSlice')}
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-hover transition text-left"
          >
            <h2 className="text-sm font-semibold text-secondary">{t.autoSlice}</h2>
            <span className="text-xs text-muted">{openSection === 'autoSlice' ? '\u25BC' : '\u25B6'}</span>
          </button>
          {openSection === 'autoSlice' && (
            <div className="px-4 pb-4 border-t border-border pt-3">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-tertiary mb-1">{t.marginSensitivity}</label>
                  <input
                    type="range"
                    min={230}
                    max={255}
                    value={form.autoSlice.whiteThreshold}
                    onChange={(e) => updateAutoSlice('whiteThreshold', Number(e.target.value))}
                    className="w-full mt-2"
                  />
                  <div className="flex justify-between text-xs text-muted mt-1">
                    <span>{t.loose}</span>
                    <span
                      className="px-1.5 py-0.5 rounded"
                      style={{ background: `rgb(${form.autoSlice.whiteThreshold},${form.autoSlice.whiteThreshold},${form.autoSlice.whiteThreshold})`, color: '#000' }}
                    >
                      {form.autoSlice.whiteThreshold === 255 ? t.whiteOnly : `${form.autoSlice.whiteThreshold}`}
                    </span>
                    <span>{t.strict}</span>
                  </div>
                </div>
                <div>
                  <label className="block text-sm text-tertiary mb-1">{t.minMarginHeight}</label>
                  <input
                    type="number"
                    value={form.autoSlice.minWhiteRun}
                    onChange={(e) => updateAutoSlice('minWhiteRun', Number(e.target.value))}
                    min={1}
                    max={500}
                    className="w-full px-3 py-2 bg-input border border-border-subtle rounded text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm text-tertiary mb-1">{t.minSliceHeightSetting}</label>
                  <input
                    type="number"
                    value={form.autoSlice.minSliceHeight}
                    onChange={(e) => updateAutoSlice('minSliceHeight', Number(e.target.value))}
                    min={0}
                    max={2000}
                    className="w-full px-3 py-2 bg-input border border-border-subtle rounded text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm text-tertiary mb-1">{t.cutPositionSetting}</label>
                  <select
                    value={form.autoSlice.cutPosition}
                    onChange={(e) => updateAutoSlice('cutPosition', e.target.value as CutPosition)}
                    className="w-full px-3 py-2 bg-input border border-border-subtle rounded text-sm"
                  >
                    <option value="middle">{t.cutMiddle}</option>
                    <option value="before-color">{t.cutBeforeColor}</option>
                  </select>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* PDF Scale */}
        <section className="bg-surface border border-border rounded-lg overflow-hidden">
          <button
            onClick={() => toggleSection('pdfScale')}
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-hover transition text-left"
          >
            <h2 className="text-sm font-semibold text-secondary">{t.pdfScaleSetting}</h2>
            <span className="text-xs text-muted">{openSection === 'pdfScale' ? '\u25BC' : '\u25B6'}</span>
          </button>
          {openSection === 'pdfScale' && (
            <div className="px-4 pb-4 border-t border-border pt-3">
              <input
                type="range"
                min={PDF_SCALE_MIN}
                max={PDF_SCALE_MAX}
                step={0.5}
                value={form.pdfScale ?? 1.0}
                onChange={(e) => update('pdfScale', Number(e.target.value))}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-muted mt-1">
                <span>{PDF_SCALE_MIN}x</span>
                <span className="text-secondary font-medium">{form.pdfScale ?? 1.0}x</span>
                <span>{PDF_SCALE_MAX}x</span>
              </div>
            </div>
          )}
        </section>

        {/* Export */}
        <section className="bg-surface border border-border rounded-lg overflow-hidden">
          <button
            onClick={() => toggleSection('export')}
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-hover transition text-left"
          >
            <h2 className="text-sm font-semibold text-secondary">{t.exportSection}</h2>
            <span className="text-xs text-muted">{openSection === 'export' ? '\u25BC' : '\u25B6'}</span>
          </button>
          {openSection === 'export' && (
            <div className="px-4 pb-4 border-t border-border pt-3">
              <label className="block text-sm text-tertiary mb-1">
                {t.jpgQuality} ({form.export.jpgQuality})
              </label>
              <input
                type="range"
                min={60}
                max={100}
                step={5}
                value={form.export.jpgQuality}
                onChange={(e) => setForm((prev) =>
                  prev ? { ...prev, export: { ...prev.export, jpgQuality: Number(e.target.value) } } : prev
                )}
                className="w-full accent-blue-500"
              />
              <div className="flex justify-between text-xs text-muted mt-1">
                <span>60</span>
                <span>100</span>
              </div>
              <p className="text-xs text-muted mt-2">{t.jpgQualityDesc}</p>
            </div>
          )}
        </section>

        {/* Naming */}
        <section className="bg-surface border border-border rounded-lg overflow-hidden">
          <button
            onClick={() => toggleSection('naming')}
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-hover transition text-left"
          >
            <h2 className="text-sm font-semibold text-secondary">{t.naming}</h2>
            <span className="text-xs text-muted">{openSection === 'naming' ? '\u25BC' : '\u25B6'}</span>
          </button>
          {openSection === 'naming' && (
            <div className="px-4 pb-4 border-t border-border pt-3">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-tertiary mb-1">{t.defaultPrefix}</label>
                  <input
                    type="text"
                    value={form.naming.defaultPrefix}
                    onChange={(e) => updateNaming('defaultPrefix', e.target.value)}
                    className="w-full px-3 py-2 bg-input border border-border-subtle rounded text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm text-tertiary mb-1">{t.filenamePadding}</label>
                  <input
                    type="number"
                    value={form.naming.filenamePadding}
                    onChange={(e) => updateNaming('filenamePadding', Number(e.target.value))}
                    min={1}
                    max={10}
                    className="w-full px-3 py-2 bg-input border border-border-subtle rounded text-sm"
                  />
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Preview */}
        <section className="bg-surface border border-border rounded-lg overflow-hidden">
          <button
            onClick={() => toggleSection('preview')}
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-hover transition text-left"
          >
            <h2 className="text-sm font-semibold text-secondary">{t.previewSection}</h2>
            <span className="text-xs text-muted">{openSection === 'preview' ? '\u25BC' : '\u25B6'}</span>
          </button>
          {openSection === 'preview' && (
            <div className="px-4 pb-4 border-t border-border pt-3">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-tertiary mb-1">{t.imageGap}</label>
                  <input
                    type="number"
                    value={form.preview.imageGap}
                    onChange={(e) => updatePreview('imageGap', Number(e.target.value))}
                    min={0}
                    className="w-full px-3 py-2 bg-input border border-border-subtle rounded text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm text-tertiary mb-1">
                    {t.scrollAmountSetting} ({form.preview.scrollAmount}px)
                  </label>
                  <input
                    type="range"
                    value={form.preview.scrollAmount}
                    onChange={(e) => updatePreview('scrollAmount', Number(e.target.value))}
                    min={50}
                    max={1000}
                    step={50}
                    className="w-full accent-blue-500"
                  />
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Device Presets */}
        <section className="bg-surface border border-border rounded-lg overflow-hidden">
          <button
            onClick={() => toggleSection('devices')}
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-hover transition text-left"
          >
            <h2 className="text-sm font-semibold text-secondary">{t.devicePresets}</h2>
            <span className="text-xs text-muted">{openSection === 'devices' ? '\u25BC' : '\u25B6'}</span>
          </button>
          {openSection === 'devices' && (
            <div className="border-t border-border pt-3">
              <DevicePresetsSection devices={devices} setDevices={setDevices} setInitialDevices={setInitialDevices} addToast={addToast} t={t} />
            </div>
          )}
        </section>
      </div>

      {/* Save / Reset — always visible */}
      <div className="flex gap-3 mt-6">
        <button
          onClick={handleSave}
          className={`flex-1 py-3 rounded-lg font-medium transition text-white ${
            hasChanges
              ? 'bg-amber-600 hover:bg-amber-500 animate-pulse'
              : 'bg-blue-600 hover:bg-blue-500'
          }`}
        >
          {saved ? t.saved : hasChanges ? t.saveChanges : t.saveSettings}
        </button>
        <button
          onClick={resetAllSettings}
          className="px-6 py-3 bg-elevated hover:bg-hover-elevated rounded-lg font-medium text-secondary transition"
        >
          {t.resetAllSettings}
        </button>
      </div>
    </div>
  )
}
