// @vitest-environment jsdom
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {cleanup, render, screen, waitFor} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {MemoryRouter} from 'react-router-dom'
import ExportPage from './ExportPage'
import {I18nContext} from '../i18n'
import en from '../i18n/en'
import {useJobStore} from '../stores/jobStore'
import {useToastStore} from '../stores/toastStore'

const goBack = vi.fn()
let exportHistoryEntries: Array<{ countryId: string, platformId: string, exportedAt: string, outputDir: string, fileCount: number }> = []

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    useParams: () => ({ jobId: 'job-1' })
  }
})

vi.mock('../hooks/useGoBack', () => ({
  useGoBack: () => goBack
}))

function renderPage() {
  return render(
    <MemoryRouter>
      <I18nContext.Provider value={en}>
        <ExportPage />
      </I18nContext.Provider>
    </MemoryRouter>
  )
}

describe('ExportPage', () => {
  afterEach(() => cleanup())

  beforeEach(() => {
    goBack.mockReset()
    exportHistoryEntries = []
    useToastStore.setState({ toasts: [] })
    useJobStore.setState({
      pdfList: [],
      activePdfPath: null,
      recentJobs: [],
      currentJob: {
        id: 'job-1',
        title: 'Episode 1',
        prefix: 'ep1',
        sourcePdfPath: '/pdfs/ep1.pdf',
        copiedPdfPath: '/base/jobs/source.pdf',
        createdAt: new Date().toISOString(),
        mode: 'fixed',
        pageCount: 1,
        sliceCount: 2,
        versionPath: '/base/jobs/v1',
        options: {},
        files: [
          { name: 'ep1_0001.png', path: '/tmp/1.png', width: 720, height: 1000, index: 1 }
        ]
      },
      sessionResults: [],
      isLoading: false,
      isRunning: false,
      runningPdfPath: null,
      progress: null,
      error: null,
      isExporting: false,
      exportProgress: null,
      exportResult: null,
    } as any)
    const exportResult = {
      jobId: 'job-1',
      platforms: [{ countryId: 'kr', platformId: 'naver', outputDir: '/exports/naver', fileCount: 2, warnings: [] }],
      totalFiles: 2,
      totalWarnings: 0
    }
    useJobStore.setState({
      fetchJobDetail: vi.fn(async () => {}),
      clearExportResult: vi.fn(),
      runExport: vi.fn(async () => {
        useJobStore.setState({ exportResult })
        return exportResult
      })
    } as any)
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: {
        getExportHistory: vi.fn(async () => exportHistoryEntries),
        getCountryPresets: vi.fn(async () => [{
          id: 'kr',
          platforms: [{ id: 'naver', episode: { width: 800, format: 'jpg', maxFileSizeMB: 20 } }]
        }]),
        openPath: vi.fn(async () => {})
      }
    })
  })

  it('allows selecting a platform and running export', async () => {
    const user = userEvent.setup()
    renderPage()

    await waitFor(() => {
      expect(screen.getByText(en.countryName('kr'))).toBeTruthy()
    })

    const checkboxes = screen.getAllByRole('checkbox')
    await user.click(checkboxes[1])
    await user.click(screen.getByRole('button', { name: en.exportRun }))

    await waitFor(() => {
      expect(useJobStore.getState().runExport).toHaveBeenCalledWith({
        jobId: 'job-1',
        entries: [{ countryId: 'kr', platform: { id: 'naver', episode: { width: 800, format: 'jpg', maxFileSizeMB: 20 } } }]
      })
    })
  })

  it('renders export result after successful export', async () => {
    const user = userEvent.setup()
    renderPage()

    await waitFor(() => {
      expect(screen.getByText(en.countryName('kr'))).toBeTruthy()
    })

    const checkboxes = screen.getAllByRole('checkbox')
    await user.click(checkboxes[1])
    await user.click(screen.getByRole('button', { name: en.exportRun }))

    await waitFor(() => {
      expect(screen.getByText(en.exportSuccess)).toBeTruthy()
      expect(screen.getByRole('button', { name: en.exportOpenFolder })).toBeTruthy()
    })
  })

  it('disables already exported platforms from history', async () => {
    exportHistoryEntries = [{
      countryId: 'kr',
      platformId: 'naver',
      exportedAt: new Date().toISOString(),
      outputDir: '/exports/naver',
      fileCount: 2
    }]
    renderPage()

    await waitFor(() => {
      expect(screen.getAllByText(en.exportedBadge).length).toBeGreaterThan(0)
    })

    const checkboxes = screen.getAllByRole('checkbox')
    expect((checkboxes[1] as HTMLInputElement).disabled).toBe(true)
    expect(
      screen.getAllByText(en.exportedAt(new Date(exportHistoryEntries[0].exportedAt).toLocaleDateString())).length
    ).toBeGreaterThan(0)
  })

  it('shows failure toast when export fails', async () => {
    useJobStore.setState({
      runExport: vi.fn(async () => {
        throw new Error('fail')
      })
    } as any)

    const user = userEvent.setup()
    renderPage()

    await waitFor(() => {
      expect(screen.getByText(en.countryName('kr'))).toBeTruthy()
    })

    const checkboxes = screen.getAllByRole('checkbox')
    await user.click(checkboxes[1])
    await user.click(screen.getByRole('button', { name: en.exportRun }))

    await waitFor(() => {
      expect(useToastStore.getState().toasts.at(-1)?.message).toBe(en.toastExportFailed)
    })
  })
})
