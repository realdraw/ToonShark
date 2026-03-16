import {useEffect, useState} from 'react'
import {useParams} from 'react-router-dom'
import {useGoBack} from '../hooks/useGoBack'
import {useJobStore} from '../stores/jobStore'
import {useTranslation} from '../i18n'
import type {DevicePreset} from '@shared/types'
import {toLocalFileUrl} from '@shared/utils'

export default function PreviewPage() {
  const { jobId } = useParams<{ jobId: string }>()
  const goBack = useGoBack(`/job/${jobId}`)
  const t = useTranslation()
  const { currentJob, fetchJobDetail, error } = useJobStore()

  const [devices, setDevices] = useState<DevicePreset[]>([])
  const [activeDevice, setActiveDevice] = useState<DevicePreset | null>(null)
  const [customWidth, setCustomWidth] = useState(393)
  const [customHeight, setCustomHeight] = useState(852)
  const [imageGap, setImageGap] = useState(0)
  const [isReady, setIsReady] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    if (jobId) fetchJobDetail(jobId)
    Promise.all([
      window.api.getDevicePresets().then((d) => {
        setDevices(d)
        if (d.length > 0) {
          setActiveDevice(d[0])
          setCustomWidth(d[0].cssViewportWidth)
          setCustomHeight(d[0].cssViewportHeight)
        }
      }),
      window.api.loadSettings().then((s) => {
        setImageGap(s.preview.imageGap)
      })
    ]).catch((err) => {
      const msg = String(err)
      window.api.log('error', 'Failed to load preview data', msg)
      setLoadError(msg)
    }).finally(() => setIsReady(true))
  }, [jobId, fetchJobDetail])

  const handleDeviceChange = (deviceId: string) => {
    const device = devices.find((d) => d.id === deviceId)
    if (device) {
      setActiveDevice(device)
      if (device.id !== 'custom') {
        setCustomWidth(device.cssViewportWidth)
        setCustomHeight(device.cssViewportHeight)
      }
    }
  }

  if (error || loadError) {
      return <div className="p-6 text-error-text">{error || loadError}</div>
  }

  if (!currentJob || !isReady || currentJob.id !== jobId) {
      return <div className="p-6 text-tertiary">{t.loading}</div>
  }

  return (
    <div className="h-screen flex flex-col bg-deep">
      {/* Top bar */}
      <div className="flex-shrink-0 bg-surface border-b border-border px-4 py-2.5 flex items-center gap-4">
        <button
          onClick={goBack}
          className="text-tertiary hover:text-primary transition text-sm"
        >
            &larr; {t.back}
        </button>

        <span className="text-primary text-sm font-medium truncate">
          {currentJob.title}
        </span>

        <div className="h-4 w-px bg-divider" />

        {/* Device selector */}
        <select
          value={activeDevice?.id ?? ''}
          onChange={(e) => handleDeviceChange(e.target.value)}
          className="px-2 py-1 bg-input border border-border-subtle rounded text-xs text-primary"
        >
          {devices.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name} ({d.cssViewportWidth}x{d.cssViewportHeight})
            </option>
          ))}
        </select>

        {/* Custom size */}
        <div className="flex items-center gap-1">
            <label className="text-xs text-tertiary">{t.width}</label>
          <input
            type="number"
            value={customWidth}
            onChange={(e) => {
              setCustomWidth(Math.max(1, Number(e.target.value) || 1))
              setActiveDevice(devices.find((d) => d.id === 'custom') ?? activeDevice)
            }}
            min={1}
            className="w-16 px-1.5 py-1 bg-input border border-border-subtle rounded text-xs text-primary"
          />
            <label className="text-xs text-tertiary ml-1">{t.height}</label>
          <input
            type="number"
            value={customHeight}
            onChange={(e) => {
              setCustomHeight(Math.max(1, Number(e.target.value) || 1))
              setActiveDevice(devices.find((d) => d.id === 'custom') ?? activeDevice)
            }}
            min={1}
            className="w-16 px-1.5 py-1 bg-input border border-border-subtle rounded text-xs text-primary"
          />
        </div>

        <div className="h-4 w-px bg-divider" />

        {/* Gap */}
        <div className="flex items-center gap-1">
            <label className="text-xs text-tertiary">{t.gap}</label>
          <input
            type="number"
            value={imageGap}
            onChange={(e) => setImageGap(Number(e.target.value))}
            min={0}
            className="w-14 px-1.5 py-1 bg-input border border-border-subtle rounded text-xs text-primary"
          />
        </div>

        <div className="flex-1" />

        <span className="text-xs text-muted">
          {t.slices(currentJob.sliceCount)}
        </span>
      </div>

      {/* Preview area - fixed center, no stretch */}
      <div className="flex-1 overflow-hidden flex items-center justify-center">
        <div
          className="rounded-2xl border-2 border-border-subtle overflow-hidden shadow-2xl"
          style={{
            width: customWidth + 4,
            height: customHeight + 4,
            flexShrink: 0,
            flexGrow: 0
          }}
        >
          <div
            className="overflow-y-auto"
            style={{
              width: customWidth,
              height: customHeight,
              background: '#ffffff'
            }}
          >
            {currentJob.files.map((file, i) => (
              <img
                key={file.index}
                src={toLocalFileUrl(file.path)}
                alt={file.name}
                style={{
                  width: '100%',
                  display: 'block',
                  marginBottom: i < currentJob.files.length - 1 ? imageGap : 0
                }}
                loading="lazy"
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
