// @vitest-environment jsdom
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {cleanup, render, screen, waitFor} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {MemoryRouter} from 'react-router-dom'
import HomePage from './HomePage'
import {I18nContext} from '../i18n'
import en from '../i18n/en'
import {useJobStore} from '../stores/jobStore'
import type {StorageInfo} from '@shared/types'

const navigate = vi.fn()
const deleteAll = vi.fn()
const confirmDeleteJobsByPdf = vi.fn()
let storageInfo: StorageInfo | null = { totalSize: 0, pdfs: [] }

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => navigate }
})

vi.mock('../hooks/usePdfDrop', () => ({
  usePdfDrop: () => ({ isDragging: false, dropProps: {} })
}))

vi.mock('../hooks/useStorageInfo', () => ({
  useStorageInfo: () => ({
    storageInfo,
    refreshStorage: vi.fn()
  })
}))

vi.mock('../hooks/useDeleteActions', () => ({
  useDeleteActions: () => ({
    confirmDeleteJobsByPdf,
    confirmDeleteAll: deleteAll
  })
}))

function renderPage() {
  return render(
    <MemoryRouter>
      <I18nContext.Provider value={en}>
        <HomePage />
      </I18nContext.Provider>
    </MemoryRouter>
  )
}

describe('HomePage', () => {
  afterEach(() => cleanup())

  beforeEach(() => {
    navigate.mockReset()
    deleteAll.mockReset()
    confirmDeleteJobsByPdf.mockReset()
    storageInfo = { totalSize: 0, pdfs: [] }
    useJobStore.setState({
      pdfList: [],
      activePdfPath: null,
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
        selectSourcePdf: vi.fn(async () => '/books/episode1.pdf'),
        loadSettings: vi.fn(async () => ({ baseDir: '/base/dir' })),
        getRecentJobs: vi.fn(async () => []),
        openPath: vi.fn(async () => {}),
        log: vi.fn()
      }
    })
  })

  it('opens the configured base folder', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: en.openFolder }))

    await waitFor(() => {
      expect(window.api.loadSettings).toHaveBeenCalled()
      expect(window.api.openPath).toHaveBeenCalledWith('/base/dir')
    })
  })

  it('navigates to workspace after selecting a pdf', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: en.openPdf }))

    await waitFor(() => {
      expect(useJobStore.getState().pdfList).toHaveLength(1)
      expect(navigate).toHaveBeenCalledWith('/workspace')
    })
  })

  it('opens a pdf from history', async () => {
    const recentJob = {
      id: 'job-1',
      title: 'episode1',
      prefix: 'episode1',
      sourcePdfPath: '/books/episode1.pdf',
      copiedPdfPath: '/base/source.pdf',
      createdAt: new Date().toISOString(),
      mode: 'auto' as const,
      pageCount: 1,
      sliceCount: 3,
      versionPath: '/base/jobs/v1',
      options: { pdfScale: 4, whiteThreshold: 255, minWhiteRun: 20, minSliceHeight: 250, cutPosition: 'middle' },
      files: []
    }
    ;(window.api.getRecentJobs as ReturnType<typeof vi.fn>).mockResolvedValue([recentJob])
    storageInfo = {
      totalSize: 1234,
      pdfs: [{ sourcePdfPath: '/books/episode1.pdf', name: 'episode1', size: 1234, jobs: [{ jobId: 'job-1', title: 'episode1', createdAt: '2026-01-01T00:00:00Z', size: 512 }] }]
    }

    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByRole('button', { name: en.open }))

    await waitFor(() => {
      expect(useJobStore.getState().pdfList).toEqual([{ path: '/books/episode1.pdf', name: 'episode1' }])
      expect(navigate).toHaveBeenCalledWith('/workspace')
    })
  })

  it('triggers delete by pdf from history row', async () => {
    const recentJob = {
      id: 'job-1',
      title: 'episode1',
      prefix: 'episode1',
      sourcePdfPath: '/books/episode1.pdf',
      copiedPdfPath: '/base/source.pdf',
      createdAt: new Date().toISOString(),
      mode: 'auto' as const,
      pageCount: 1,
      sliceCount: 3,
      versionPath: '/base/jobs/v1',
      options: { pdfScale: 4, whiteThreshold: 255, minWhiteRun: 20, minSliceHeight: 250, cutPosition: 'middle' },
      files: []
    }
    ;(window.api.getRecentJobs as ReturnType<typeof vi.fn>).mockResolvedValue([recentJob])

    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByRole('button', { name: en.deletePdf }))

    expect(confirmDeleteJobsByPdf).toHaveBeenCalledWith('/books/episode1.pdf', 'episode1')
  })

  it('triggers delete all from storage warning action', async () => {
    storageInfo = { totalSize: 11 * 1024 * 1024 * 1024, pdfs: [] }
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: en.storageWarningAction }))

    expect(deleteAll).toHaveBeenCalled()
  })
})
