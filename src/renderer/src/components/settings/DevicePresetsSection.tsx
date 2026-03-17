import type {DevicePreset} from '@shared/types'
import type {TranslationKeys} from '../../i18n/en'

type Props = {
  devices: DevicePreset[]
  setDevices: React.Dispatch<React.SetStateAction<DevicePreset[]>>
  setInitialDevices: React.Dispatch<React.SetStateAction<DevicePreset[]>>
  addToast: (type: 'success' | 'error' | 'info', message: string) => void
  t: TranslationKeys
}

export function DevicePresetsSection({ devices, setDevices, setInitialDevices, addToast, t }: Props) {
  const updateDevice = (index: number, field: keyof DevicePreset, value: string | number) => {
    setDevices((prev) => {
      const next = [...prev]
      next[index] = { ...next[index], [field]: value }
      if (field === 'name') {
        next[index].id = String(value).toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
      }
      return next
    })
  }

  const addDevice = () => {
    setDevices((prev) => [
      ...prev,
      { id: `device_${Date.now()}`, name: '', cssViewportWidth: 393, cssViewportHeight: 852 }
    ])
  }

  const removeDevice = (index: number) => {
    setDevices((prev) => prev.filter((_, i) => i !== index))
  }

  const resetDevices = async () => {
    const defaults = await window.api.getDefaultDevicePresets()
    setDevices(defaults)
  }

  const handleImport = async () => {
    try {
      const result = await window.api.importPresets()
      if (result) {
        setDevices(result.devices)
        setInitialDevices(result.devices)
        addToast('success', t.importPresetsSuccess)
      }
    } catch {
      addToast('error', t.importPresetsFailed)
    }
  }

  const handleExport = async () => {
    try {
      const exported = await window.api.exportPresets()
      if (exported) addToast('success', t.exportPresetsSuccess)
    } catch {
      addToast('error', t.exportPresetsFailed)
    }
  }

  return (
    <div className="px-4 pb-4">
      <div className="flex justify-end gap-2 mb-3">
        <button
          onClick={handleImport}
          className="px-3 py-1 bg-elevated hover:bg-hover-elevated rounded text-xs transition"
        >
          {t.importPresets}
        </button>
        <button
          onClick={handleExport}
          className="px-3 py-1 bg-elevated hover:bg-hover-elevated rounded text-xs transition"
        >
          {t.exportPresets}
        </button>
        <button
          onClick={resetDevices}
          className="px-3 py-1 bg-elevated hover:bg-hover-elevated rounded text-xs transition"
        >
          {t.resetDefaults}
        </button>
      </div>
      <div className="space-y-3">
        {devices.map((device, index) => (
          <div
            key={device.id}
            className="flex items-center gap-2 bg-input border border-border rounded p-3"
          >
            <div className="flex-1 grid grid-cols-3 gap-2">
              <div>
                <label className="block text-[10px] text-muted mb-0.5">{t.deviceName}</label>
                <input
                  type="text"
                  value={device.name}
                  onChange={(e) => updateDevice(index, 'name', e.target.value)}
                  className="w-full px-2 py-1.5 bg-input border border-border-subtle rounded text-sm"
                />
              </div>
              <div>
                <label className="block text-[10px] text-muted mb-0.5">{t.viewportWidth}</label>
                <input
                  type="number"
                  value={device.cssViewportWidth}
                  onChange={(e) => updateDevice(index, 'cssViewportWidth', Number(e.target.value))}
                  className="w-full px-2 py-1.5 bg-input border border-border-subtle rounded text-sm"
                />
              </div>
              <div>
                <label className="block text-[10px] text-muted mb-0.5">{t.viewportHeight}</label>
                <input
                  type="number"
                  value={device.cssViewportHeight}
                  onChange={(e) => updateDevice(index, 'cssViewportHeight', Number(e.target.value))}
                  className="w-full px-2 py-1.5 bg-input border border-border-subtle rounded text-sm"
                />
              </div>
            </div>
            <button
              onClick={() => removeDevice(index)}
              className="flex-shrink-0 w-8 h-8 bg-error-bg hover:bg-red-700 text-error-text hover:text-white rounded text-xs transition flex items-center justify-center"
            >
              x
            </button>
          </div>
        ))}
        <button
          onClick={addDevice}
          className="w-full py-2 bg-input hover:bg-hover border border-dashed border-border-subtle rounded text-sm text-tertiary hover:text-primary transition"
        >
          {t.addDevice}
        </button>
      </div>
    </div>
  )
}
