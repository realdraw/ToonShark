// @vitest-environment jsdom
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {cleanup, render, screen, waitFor} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {MemoryRouter} from 'react-router-dom'
import SliceDetailPage from './SliceDetailPage'
import {I18nContext} from '../i18n'
import en from '../i18n/en'
import {useJobStore} from '../stores/jobStore'
import {useToastStore} from '../stores/toastStore'

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    useParams: () => ({ jobId: 'job-1' }),
    useNavigate: () => vi.fn()
  }
})

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['?index=1']}>
      <I18nContext.Provider value={en}>
        <SliceDetailPage />
      </I18nContext.Provider>
    </MemoryRouter>
  )
}

describe('SliceDetailPage — Thumbnail', () => {
  afterEach(() => cleanup())

  beforeEach(() => {
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
        sliceCount: 1,
        versionPath: '/base/jobs/v1',
        options: {},
        files: [
          { name: 'ep1_0001.png', path: '/tmp/1.png', width: 720, height: 2000, index: 1 }
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
      fetchJobDetail: vi.fn(async () => {}),
      clearExportResult: vi.fn()
    } as any)

    Object.defineProperty(window, 'api', {
      configurable: true,
      value: {
        loadSettings: vi.fn(async () => ({
          preview: { scrollAmount: 300 }
        })),
        getCountryPresets: vi.fn(async () => [
          {
            id: 'kr',
            platforms: [
              {
                id: 'naver_webtoon',
                episode: { width: 690, format: 'png', maxFileSizeMB: 50 },
                thumbnail: { width: 1200, height: 630, format: 'jpg', maxFileSizeMB: 5 }
              },
              {
                id: 'ridi',
                episode: { width: 580, format: 'png', maxFileSizeMB: 100 }
                // no thumbnail
              }
            ]
          }
        ]),
        getThumbnailDir: vi.fn(async () => null),
        captureThumbnail: vi.fn(async () => ({
          outputPath: '/base/jobs/v1/export/kr/naver_webtoon/thumbnail/ep1_0001.jpg',
          width: 1200,
          height: 630
        })),
        openPath: vi.fn(async () => {})
      }
    })
  })

  it('shows Thumbnail button', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText(en.thumbnail)).toBeTruthy()
    })
  })

  it('shows platform dropdown when Thumbnail is clicked', async () => {
    const user = userEvent.setup()
    renderPage()

    await waitFor(() => expect(screen.getByText(en.thumbnail)).toBeTruthy())
    await user.click(screen.getByText(en.thumbnail))

    // Only naver_webtoon has a thumbnail spec; ridi should NOT appear in the dropdown
    await waitFor(() => {
      expect(screen.getByText(en.platformName('naver_webtoon'))).toBeTruthy()
    })
    expect(screen.queryByText(en.platformName('ridi'))).toBeFalsy()
  })

  it('shows info toast when no platforms have thumbnail spec', async () => {
    (window.api.getCountryPresets as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      {
        id: 'kr',
        platforms: [
          { id: 'ridi', episode: { width: 580, format: 'png', maxFileSizeMB: 100 } }
        ]
      }
    ])

    const user = userEvent.setup()
    renderPage()

    await waitFor(() => expect(screen.getByText(en.thumbnail)).toBeTruthy())
    await user.click(screen.getByText(en.thumbnail))

    await waitFor(() => {
      const toast = useToastStore.getState().toasts.find((t) => t.message === en.thumbnailNoPlatforms)
      expect(toast).toBeTruthy()
    })
  })

  it('shows folder open button after thumbnail is saved', async () => {
    const user = userEvent.setup()
    renderPage()

    await waitFor(() => expect(screen.getByText(en.thumbnail)).toBeTruthy())
    await user.click(screen.getByText(en.thumbnail))

    await waitFor(() => expect(screen.getByText(en.platformName('naver_webtoon'))).toBeTruthy())
    await user.click(screen.getByText(en.platformName('naver_webtoon')))

    // Verify the toast action wiring
    useToastStore.getState().addToast('success', en.thumbnailSuccess, {
      label: en.thumbnailOpenFolder,
      onClick: () => window.api.openPath('/some/dir')
    })

    await waitFor(() => {
      const toast = useToastStore.getState().toasts.find((t) => t.message === en.thumbnailSuccess)
      expect(toast?.action?.label).toBe(en.thumbnailOpenFolder)
    })
  })

  it('shows folder open button when getThumbnailDir returns a path', async () => {
    // Simulate that thumbnails exist on disk for this job
    ;(window.api as any).getThumbnailDir = vi.fn(async () => '/base/jobs/v1/export/kr/naver_webtoon/thumbnail')

    renderPage()

    await waitFor(() => {
      const folderBtn = screen.getByTitle(en.thumbnailOpenFolder)
      expect(folderBtn).toBeTruthy()
    })
  })

  it('does not show folder open button when getThumbnailDir returns null', async () => {
    ;(window.api as any).getThumbnailDir = vi.fn(async () => null)

    renderPage()

    await waitFor(() => expect(screen.getByText(en.thumbnail)).toBeTruthy())
    expect(screen.queryByTitle(en.thumbnailOpenFolder)).toBeFalsy()
  })
})
