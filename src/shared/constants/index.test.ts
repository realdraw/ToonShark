import {describe, expect, it} from 'vitest'
import {readFileSync} from 'fs'
import {resolve} from 'path'
import {DEFAULT_SETTINGS} from './index'
import type {Country, DevicePreset} from '../types'
import {DEFAULT_AUTO_SLICE} from '../types'

describe('DEFAULT_SETTINGS auto-slice consistency', () => {
  it('whiteThreshold should be within UI slider range (230-255)', () => {
    expect(DEFAULT_SETTINGS.autoSlice.whiteThreshold).toBeGreaterThanOrEqual(230)
    expect(DEFAULT_SETTINGS.autoSlice.whiteThreshold).toBeLessThanOrEqual(255)
  })

  it('DEFAULT_SETTINGS.autoSlice should match DEFAULT_AUTO_SLICE', () => {
    expect(DEFAULT_SETTINGS.autoSlice).toEqual(DEFAULT_AUTO_SLICE)
  })

  it('workspaceStore should use DEFAULT_AUTO_SLICE for auto-slice initial values, not hardcoded', () => {
    const source = readFileSync(
      resolve(__dirname, '../../renderer/src/stores/workspaceStore.ts'),
      'utf-8'
    )
    expect(source).toContain('DEFAULT_AUTO_SLICE.whiteThreshold')
    expect(source).toContain('DEFAULT_AUTO_SLICE.minWhiteRun')
    expect(source).toContain('DEFAULT_AUTO_SLICE.minSliceHeight')
    expect(source).toContain('DEFAULT_AUTO_SLICE.cutPosition')
  })
})

describe('DEFAULT_SETTINGS value ranges', () => {
  it('defaultSliceHeight should be positive', () => {
    expect(DEFAULT_SETTINGS.defaultSliceHeight).toBeGreaterThan(0)
  })

  it('naming.filenamePadding should be positive', () => {
    expect(DEFAULT_SETTINGS.naming.filenamePadding).toBeGreaterThan(0)
  })

  it('preview.imageGap should be non-negative', () => {
    expect(DEFAULT_SETTINGS.preview.imageGap).toBeGreaterThanOrEqual(0)
  })

  it('autoSlice.minWhiteRun should be non-negative', () => {
    expect(DEFAULT_SETTINGS.autoSlice.minWhiteRun).toBeGreaterThanOrEqual(0)
  })

  it('autoSlice.minSliceHeight should be 250 by default', () => {
    expect(DEFAULT_SETTINGS.autoSlice.minSliceHeight).toBe(250)
  })

  it('autoSlice.cutPosition should be a valid option', () => {
    expect(['middle', 'before-color']).toContain(DEFAULT_SETTINGS.autoSlice.cutPosition)
  })
})

describe('SettingsPage reset and unsaved changes features', () => {
  it('SettingsPage should use getDefaultSettings for reset', () => {
    const source = readFileSync(
      resolve(__dirname, '../../renderer/src/pages/SettingsPage.tsx'),
      'utf-8'
    )
    expect(source).toContain('getDefaultSettings')
    expect(source).toContain('resetAllSettings')
  })

  it('SettingsPage should have unsaved changes detection', () => {
    const source = readFileSync(
      resolve(__dirname, '../../renderer/src/pages/SettingsPage.tsx'),
      'utf-8'
    )
    expect(source).toContain('hasChanges')
    expect(source).toContain('unsavedChanges')
  })

  it('SettingsPage should show different button text when changes exist', () => {
    const source = readFileSync(
      resolve(__dirname, '../../renderer/src/pages/SettingsPage.tsx'),
      'utf-8'
    )
    expect(source).toContain('saveChanges')
    expect(source).toContain('saveSettings')
  })

  it('preload should expose getDefaultSettings API', () => {
    const source = readFileSync(
      resolve(__dirname, '../../preload/index.ts'),
      'utf-8'
    )
    expect(source).toContain('getDefaultSettings')
    expect(source).toContain('get-default-settings')
  })

  it('IPC handlers should register get-default-settings', () => {
    const source = readFileSync(
      resolve(__dirname, '../../main/ipc/handlers.ts'),
      'utf-8'
    )
    expect(source).toContain("'get-default-settings'")
    expect(source).toContain('DEFAULT_SETTINGS')
  })
})

describe('i18n keys for new features', () => {
  it('en.ts should have all reset and unsaved changes keys', () => {
    const source = readFileSync(
      resolve(__dirname, '../../renderer/src/i18n/en.ts'),
      'utf-8'
    )
    expect(source).toContain('resetAllSettings')
    expect(source).toContain('resetAllSettingsConfirm')
    expect(source).toContain('resetAllSettingsSaveReminder')
    expect(source).toContain('unsavedChanges')
    expect(source).toContain('saveChanges')
  })

  it('ko.ts should have all reset and unsaved changes keys', () => {
    const source = readFileSync(
      resolve(__dirname, '../../renderer/src/i18n/ko.ts'),
      'utf-8'
    )
    expect(source).toContain('resetAllSettings')
    expect(source).toContain('resetAllSettingsConfirm')
    expect(source).toContain('resetAllSettingsSaveReminder')
    expect(source).toContain('unsavedChanges')
    expect(source).toContain('saveChanges')
  })
})

describe('Drag-and-drop: pointer-events-none on overlay', () => {
  it('DropOverlay component should have pointer-events-none', () => {
    const source = readFileSync(
      resolve(__dirname, '../../renderer/src/components/DropOverlay.tsx'),
      'utf-8'
    )
    expect(source).toContain('pointer-events-none')
  })

  it('HomePage should use DropOverlay with isDragging', () => {
    const source = readFileSync(
      resolve(__dirname, '../../renderer/src/pages/HomePage.tsx'),
      'utf-8'
    )
    expect(source).toContain('DropOverlay')
    expect(source).toContain('isDragging')
  })

  it('WorkspacePage should use DropOverlay with isDragging', () => {
    const source = readFileSync(
      resolve(__dirname, '../../renderer/src/pages/WorkspacePage.tsx'),
      'utf-8'
    )
    expect(source).toContain('DropOverlay')
    expect(source).toContain('isDragging')
  })

  it('usePdfDrop hook should have drag-and-drop handlers with preventDefault', () => {
    const source = readFileSync(
      resolve(__dirname, '../../renderer/src/hooks/usePdfDrop.ts'),
      'utf-8'
    )
    expect(source).toContain('onDrop')
    expect(source).toContain('onDragOver')
    expect(source).toContain('onDragLeave')
    expect(source).toContain('e.preventDefault()')
    expect(source).toContain('setIsDragging')
  })

  it('usePdfDrop hook should filter for .pdf files on drop', () => {
    const source = readFileSync(
      resolve(__dirname, '../../renderer/src/hooks/usePdfDrop.ts'),
      'utf-8'
    )
    expect(source).toContain(".endsWith('.pdf')")
    expect(source).toContain('getPathForFile')
  })

  it('HomePage and WorkspacePage should use usePdfDrop hook', () => {
    const home = readFileSync(
      resolve(__dirname, '../../renderer/src/pages/HomePage.tsx'),
      'utf-8'
    )
    const workspace = readFileSync(
      resolve(__dirname, '../../renderer/src/pages/WorkspacePage.tsx'),
      'utf-8'
    )
    expect(home).toContain('usePdfDrop')
    expect(workspace).toContain('usePdfDrop')
    expect(home).toContain('dropProps')
    expect(workspace).toContain('dropProps')
  })

  it('main.tsx should NOT have document-level drag/drop handlers', () => {
    const source = readFileSync(
      resolve(__dirname, '../../renderer/src/main.tsx'),
      'utf-8'
    )
    expect(source).not.toContain('addEventListener')
    expect(source).not.toContain('document.ondragover')
    expect(source).not.toContain('document.ondrop')
  })
})

describe('DevTools: dev mode only', () => {
  it('main/index.ts should enable DevTools only in dev mode', () => {
    const source = readFileSync(
      resolve(__dirname, '../../main/index.ts'),
      'utf-8'
    )
    expect(source).toContain('ELECTRON_RENDERER_URL')
    expect(source).toContain('toggleDevTools')
    expect(source).toContain('before-input-event')
  })

  it('main/index.ts should support F12 and Ctrl+Shift+I shortcuts', () => {
    const source = readFileSync(
      resolve(__dirname, '../../main/index.ts'),
      'utf-8'
    )
    expect(source).toContain('F12')
    expect(source).toContain('input.control')
    expect(source).toContain('input.shift')
  })

  it('main/index.ts should hide application menu', () => {
    const source = readFileSync(
      resolve(__dirname, '../../main/index.ts'),
      'utf-8'
    )
    expect(source).toContain('Menu.setApplicationMenu(null)')
  })
})

describe('Windows compatibility: local-file protocol', () => {
  it('main/index.ts should handle Windows paths in local-file protocol', () => {
    const source = readFileSync(
      resolve(__dirname, '../../main/index.ts'),
      'utf-8'
    )
    expect(source).toContain("process.platform === 'win32'")
    expect(source).toContain('decodeURIComponent')
    expect(source).toContain('normalize')
  })

  it('main/index.ts should use pathToFileURL for cross-platform file URLs', () => {
    const source = readFileSync(
      resolve(__dirname, '../../main/index.ts'),
      'utf-8'
    )
    expect(source).toContain('pathToFileURL')
    expect(source).toContain("import {pathToFileURL} from 'url'")
  })

  it('main/index.ts should have sandbox: true in webPreferences', () => {
    const source = readFileSync(
      resolve(__dirname, '../../main/index.ts'),
      'utf-8'
    )
    expect(source).toContain('sandbox: true')
  })

  it('main/index.ts should prevent navigation via will-navigate', () => {
    const source = readFileSync(
      resolve(__dirname, '../../main/index.ts'),
      'utf-8'
    )
    expect(source).toContain('will-navigate')
    expect(source).toContain('event.preventDefault()')
  })

  it('main/index.ts should restrict local-file to baseDir', () => {
    const source = readFileSync(
      resolve(__dirname, '../../main/index.ts'),
      'utf-8'
    )
    expect(source).toContain('filePath.startsWith(currentBaseDir + sep)')
    expect(source).toContain("'Forbidden'")
    expect(source).toContain('status: 403')
  })
})

describe('Windows compatibility: path separators', () => {
  it('JobDetailPage should split paths with both / and \\ for Windows', () => {
    const source = readFileSync(
      resolve(__dirname, '../../renderer/src/pages/JobDetailPage.tsx'),
      'utf-8'
    )
    expect(source).toContain('split(/[')
    expect(source).toContain('\\\\')
    expect(source).not.toMatch(/split\('\/'/)
  })
})

describe('Preload: getPathForFile with fallback', () => {
  it('preload should have getPathForFile with try/catch fallback', () => {
    const source = readFileSync(
      resolve(__dirname, '../../preload/index.ts'),
      'utf-8'
    )
    expect(source).toContain('getPathForFile')
    expect(source).toContain('webUtils.getPathForFile')
    expect(source).toContain('catch')
    // Fallback for older Electron / Windows
    expect(source).toContain('.path')
  })
})

describe('ToastContainer info type', () => {
  it('ToastContainer should support info toast type with blue color', () => {
    const source = readFileSync(
      resolve(__dirname, '../../renderer/src/components/ToastContainer.tsx'),
      'utf-8'
    )
    expect(source).toContain('info')
    expect(source).toContain('bg-blue-600')
  })
})

describe('Job state: isRunning separated from isLoading', () => {
  it('jobStore should have separate isRunning state', () => {
    const source = readFileSync(
      resolve(__dirname, '../../renderer/src/stores/jobStore.ts'),
      'utf-8'
    )
    expect(source).toContain('isRunning: boolean')
    expect(source).toContain('isRunning: false')
  })

  it('runSliceJob should set isRunning: true', () => {
    const source = readFileSync(
      resolve(__dirname, '../../renderer/src/stores/jobStore.ts'),
      'utf-8'
    )
    // Extract runSliceJob implementation (skip the type definition)
    const runSliceStart = source.indexOf('runSliceJob: async')
    const runSliceBody = source.slice(runSliceStart, runSliceStart + 300)
    expect(runSliceBody).toContain('isRunning: true')
    expect(runSliceBody).not.toContain('isLoading: true')
  })

  it('fetchJobDetail should set isLoading: true', () => {
    const source = readFileSync(
      resolve(__dirname, '../../renderer/src/stores/jobStore.ts'),
      'utf-8'
    )
    const fetchStart = source.indexOf('fetchJobDetail: async')
    const fetchBody = source.slice(fetchStart, fetchStart + 300)
    expect(fetchBody).toContain('isLoading: true')
    expect(fetchBody).not.toContain('isRunning: true')
  })

  it('OptionPanel should use isRunning for run button and progress', () => {
    const source = readFileSync(
      resolve(__dirname, '../../renderer/src/components/OptionPanel.tsx'),
      'utf-8'
    )
    expect(source).toContain('isRunning')
    expect(source).toContain('disabled={!canRun || isRunning}')
    expect(source).toContain('{isRunning && progress && (')
  })

  it('OptionPanel should NOT use isLoading for run button', () => {
    const source = readFileSync(
      resolve(__dirname, '../../renderer/src/components/OptionPanel.tsx'),
      'utf-8'
    )
    expect(source).not.toContain('disabled={!activePdfPath || isLoading}')
    expect(source).not.toContain('{isLoading && progress && (')
  })
})

describe('default preset JSON files', () => {
  const defaultDevices: DevicePreset[] = JSON.parse(
    readFileSync(resolve(__dirname, '../../../resources/defaults/devices.json'), 'utf-8')
  )
  const defaultCountries: Country[] = JSON.parse(
    readFileSync(resolve(__dirname, '../../../resources/defaults/countries.json'), 'utf-8')
  )

  it('devices should have at least one device', () => {
    expect(defaultDevices.length).toBeGreaterThan(0)
  })

  it('all devices should have required fields', () => {
    for (const device of defaultDevices) {
      expect(device.id).toBeTruthy()
      expect(device.name).toBeTruthy()
      expect(device.cssViewportWidth).toBeGreaterThan(0)
      expect(device.cssViewportHeight).toBeGreaterThan(0)
    }
  })

  it('should have unique device IDs', () => {
    const ids = defaultDevices.map((d) => d.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('preview defaultDeviceId should reference an existing device', () => {
    const ids = defaultDevices.map((d) => d.id)
    expect(ids).toContain(DEFAULT_SETTINGS.preview.defaultDeviceId)
  })

  it('countries should have at least one country', () => {
    expect(defaultCountries.length).toBeGreaterThan(0)
  })

  it('all countries should have required fields', () => {
    for (const country of defaultCountries) {
      expect(country.id).toBeTruthy()
      expect(country.platforms.length).toBeGreaterThan(0)
      for (const p of country.platforms) {
        expect(p.id).toBeTruthy()
        expect(p.episode).toBeTruthy()
        expect(p.episode.width).toBeGreaterThan(0)
        expect(['jpg', 'png']).toContain(p.episode.format)
        if (p.thumbnail) {
          expect(p.thumbnail.width).toBeGreaterThan(0)
          expect(p.thumbnail.height).toBeGreaterThan(0)
          expect(['jpg', 'png']).toContain(p.thumbnail.format)
        }
      }
    }
  })
})
