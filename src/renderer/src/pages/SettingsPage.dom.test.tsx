// @vitest-environment jsdom
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {cleanup, render, screen, waitFor} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {MemoryRouter} from 'react-router-dom'
import SettingsPage from './SettingsPage'
import {I18nContext} from '../i18n'
import en from '../i18n/en'
import {useSettingsStore} from '../stores/settingsStore'
import {useToastStore} from '../stores/toastStore'
import type {AppSettings, DevicePreset} from '@shared/types'

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    useNavigate: () => vi.fn()
  }
})

const baseSettings: AppSettings = {
  baseDir: '/current/base',
  defaultSliceHeight: 1280,
  naming: { defaultPrefix: 'untitled', filenamePadding: 4 },
  autoSlice: {
    whiteThreshold: 255,
    minWhiteRun: 20,
    minSliceHeight: 250,
    cutPosition: 'middle'
  },
  pdfScale: 4,
  export: { jpgQuality: 90 },
  preview: {
    defaultDeviceId: 'iphone_16_pro',
    imageGap: 0,
    scrollAmount: 300
  },
  locale: 'en',
  theme: 'dark'
}

const defaultSettings: AppSettings = {
  ...baseSettings,
  baseDir: '/default/base',
  naming: { ...baseSettings.naming, defaultPrefix: 'default_prefix' }
}

const devices: DevicePreset[] = [
  { id: 'iphone_16_pro', name: 'iPhone 16 Pro', cssViewportWidth: 393, cssViewportHeight: 852 }
]

function renderPage() {
  return render(
    <MemoryRouter>
      <I18nContext.Provider value={en}>
        <SettingsPage />
      </I18nContext.Provider>
    </MemoryRouter>
  )
}

async function openStorageSection(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: /Storage/ }))
}

describe('SettingsPage', () => {
  afterEach(() => {
    cleanup()
  })

  beforeEach(() => {
    useSettingsStore.setState({
      settings: null,
      isLoading: false,
      error: null
    })
    useToastStore.setState({ toasts: [] })

    Object.defineProperty(window, 'api', {
      configurable: true,
      value: {
        loadSettings: vi.fn(async () => baseSettings),
        saveSettings: vi.fn(async () => {}),
        getDevicePresets: vi.fn(async () => devices),
        saveDevicePresets: vi.fn(async () => {}),
        getDefaultSettings: vi.fn(async () => defaultSettings),
        getDefaultDevicePresets: vi.fn(async () => devices),
        selectBaseDir: vi.fn(async () => null),
        openPath: vi.fn(async () => {}),
        log: vi.fn(),
        importPresets: vi.fn(async () => null),
        exportPresets: vi.fn(async () => true)
      }
    })

    Object.defineProperty(window, 'confirm', {
      configurable: true,
      value: vi.fn(() => true)
    })
  })

  it('loads and displays current baseDir', async () => {
    const user = userEvent.setup()
    renderPage()

    await openStorageSection(user)
    await waitFor(() => {
      expect(screen.getByDisplayValue('/current/base')).toBeTruthy()
    })
  })

  it('resets baseDir to the default settings value', async () => {
    const user = userEvent.setup()
    renderPage()

    await openStorageSection(user)
    await waitFor(() => {
      expect(screen.getByDisplayValue('/current/base')).toBeTruthy()
    })

    await user.click(screen.getByRole('button', { name: en.resetAllSettings }))

    await waitFor(() => {
      expect(screen.getByDisplayValue('/default/base')).toBeTruthy()
    })
  })

  it('renders JPG quality slider in export section', async () => {
    const user = userEvent.setup()
    renderPage()

    // Wait for settings to load, then open Export section
    await waitFor(() => {
      expect(screen.getByText(/Export/)).toBeTruthy()
    })
    await user.click(screen.getByRole('button', { name: /Export/ }))

    await waitFor(() => {
      expect(screen.getByText(/JPG Quality/)).toBeTruthy()
    })
    const slider = screen.getByRole('slider')
    expect(slider.getAttribute('min')).toBe('60')
    expect(slider.getAttribute('max')).toBe('100')
  })

  it('saves reset settings and device presets', async () => {
    const user = userEvent.setup()
    renderPage()

    await openStorageSection(user)
    await waitFor(() => {
      expect(screen.getByDisplayValue('/current/base')).toBeTruthy()
    })

    await user.click(screen.getByRole('button', { name: en.resetAllSettings }))
    await user.click(screen.getByRole('button', { name: en.saveChanges }))

    await waitFor(() => {
      expect(window.api.saveSettings).toHaveBeenCalledWith(defaultSettings)
      expect(window.api.saveDevicePresets).toHaveBeenCalledWith(devices)
    })
  })
})
