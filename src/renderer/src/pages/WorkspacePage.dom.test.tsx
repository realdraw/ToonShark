// @vitest-environment jsdom
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {cleanup, render, screen, waitFor} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {MemoryRouter} from 'react-router-dom'
import WorkspacePage from './WorkspacePage'
import {I18nContext} from '../i18n'
import en from '../i18n/en'
import {useJobStore} from '../stores/jobStore'
import {useSettingsStore} from '../stores/settingsStore'
import {useWorkspaceStore} from '../stores/workspaceStore'
import {useToastStore} from '../stores/toastStore'

const navigate = vi.fn()
const refreshStorage = vi.fn()
const confirmDeleteJob = vi.fn()

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => navigate }
})

vi.mock('../hooks/usePdfDrop', () => ({
  usePdfDrop: () => ({ isDragging: false, dropProps: {} })
}))

vi.mock('../hooks/useStorageInfo', () => ({
  useStorageInfo: () => ({
    storageInfo: null,
    refreshStorage
  })
}))

vi.mock('../hooks/useDeleteActions', () => ({
  useDeleteActions: () => ({ confirmDeleteJob })
}))

vi.mock('../components/OptionPanel', () => ({
  OptionPanel: ({ options, onRun }: { options: { prefix: string }, onRun: () => void }) => (
    <div>
      <span data-testid="option-prefix">{options.prefix}</span>
      <button onClick={onRun}>Run Slice</button>
    </div>
  )
}))

vi.mock('../components/ResultsPanel', () => ({
  ResultsPanel: ({ activeJobs }: { activeJobs: Array<unknown> }) => <div data-testid="results-count">{activeJobs.length}</div>
}))

function renderPage() {
  return render(
    <MemoryRouter>
      <I18nContext.Provider value={en}>
        <WorkspacePage />
      </I18nContext.Provider>
    </MemoryRouter>
  )
}

describe('WorkspacePage', () => {
  afterEach(() => cleanup())

  beforeEach(() => {
    navigate.mockReset()
    refreshStorage.mockReset()
    confirmDeleteJob.mockReset()
    useToastStore.setState({ toasts: [] })
    useSettingsStore.setState({
      settings: {
        baseDir: '/base',
        defaultSliceHeight: 1280,
        naming: { defaultPrefix: 'preset_prefix', filenamePadding: 4 },
        autoSlice: { whiteThreshold: 255, minWhiteRun: 20, minSliceHeight: 250, cutPosition: 'middle' },
        pdfScale: 4,
        export: { jpgQuality: 90 },
        preview: { defaultDeviceId: 'iphone_16_pro', imageGap: 0, scrollAmount: 300 },
        locale: 'en',
        theme: 'dark'
      },
      isLoading: false,
      error: null
    } as any)
    useWorkspaceStore.setState({ optionsMap: {}, _settings: null })
    useJobStore.setState({
      pdfList: [{ path: '/pdfs/episode1.pdf', name: 'episode1' }],
      activePdfPath: '/pdfs/episode1.pdf',
      recentJobs: [],
      currentJob: null,
      sessionResults: [],
      isLoading: false,
      isRunning: false,
      runningPdfPath: null,
      progress: null,
      error: null,
      isExporting: false,
      exportProgress: null,
      exportResult: null
    })
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: {
        loadSettings: vi.fn(async () => ({
          baseDir: '/base',
          defaultSliceHeight: 1280,
          naming: { defaultPrefix: 'preset_prefix', filenamePadding: 4 },
          autoSlice: { whiteThreshold: 255, minWhiteRun: 20, minSliceHeight: 250, cutPosition: 'middle' },
          pdfScale: 4,
          export: { jpgQuality: 90 },
          preview: { defaultDeviceId: 'iphone_16_pro', imageGap: 0, scrollAmount: 300 },
        locale: 'en',
        theme: 'dark'
      })),
        getRecentJobs: vi.fn(async () => []),
        runSliceJob: vi.fn(async () => ({
          id: 'job-1',
          title: 'episode1',
          prefix: 'preset_prefix',
          sourcePdfPath: '/pdfs/episode1.pdf',
          copiedPdfPath: '/base/jobs/source.pdf',
          createdAt: new Date().toISOString(),
          mode: 'auto',
          pageCount: 1,
          sliceCount: 3,
          versionPath: '/base/jobs/v1',
          options: { pdfScale: 4 },
          files: []
        })),
        onJobProgress: vi.fn(() => () => {})
      }
    })
  })

  it('initializes prefix from settings default prefix', async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByTestId('option-prefix').textContent).toBe('preset_prefix')
    })
  })

  it('shows duplicate toast and skips run when matching job exists', async () => {
    const duplicateJob = {
      id: 'job-existing',
      title: 'episode1',
      prefix: 'preset_prefix',
      sourcePdfPath: '/pdfs/episode1.pdf',
      copiedPdfPath: '/base/jobs/source.pdf',
      createdAt: new Date().toISOString(),
      mode: 'auto' as const,
      pageCount: 1,
      sliceCount: 3,
      versionPath: '/base/jobs/v0',
      options: { pdfScale: 4, whiteThreshold: 255, minWhiteRun: 20, minSliceHeight: 250, cutPosition: 'middle' },
      files: []
    }
    ;(window.api.getRecentJobs as ReturnType<typeof vi.fn>).mockResolvedValue([duplicateJob])

    const user = userEvent.setup()
    renderPage()

    await waitFor(() => {
      expect(screen.getByTestId('option-prefix').textContent).toBe('preset_prefix')
    })
    await user.click(screen.getByRole('button', { name: 'Run Slice' }))

    expect(window.api.runSliceJob).not.toHaveBeenCalled()
    expect(useToastStore.getState().toasts.at(-1)?.message).toBe(en.toastDuplicateJob)
  })

  it('shows failure toast when slice run fails', async () => {
    ;(window.api.runSliceJob as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('boom'))

    const user = userEvent.setup()
    renderPage()

    await waitFor(() => {
      expect(screen.getByTestId('option-prefix').textContent).toBe('preset_prefix')
    })
    await user.click(screen.getByRole('button', { name: 'Run Slice' }))

    await waitFor(() => {
      expect(useToastStore.getState().toasts.at(-1)?.message).toBe(en.toastJobFailed)
    })
  })
})
