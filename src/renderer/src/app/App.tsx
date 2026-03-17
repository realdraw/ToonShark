import {useEffect} from 'react'
import {Route, Routes} from 'react-router-dom'
import HomePage from '../pages/HomePage'
import WorkspacePage from '../pages/WorkspacePage'
import JobDetailPage from '../pages/JobDetailPage'
import PreviewPage from '../pages/PreviewPage'
import SliceDetailPage from '../pages/SliceDetailPage'
import SettingsPage from '../pages/SettingsPage'
import ExportPage from '../pages/ExportPage'
import {useSettingsStore} from '../stores/settingsStore'
import {getTranslations, I18nContext} from '../i18n'
import {ToastContainer} from '../components/ToastContainer'

function useTheme(theme: 'light' | 'dark' | 'system') {
  useEffect(() => {
    const apply = (isDark: boolean) => {
      document.documentElement.classList.toggle('dark', isDark)
    }

    if (theme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)')
      apply(mq.matches)
      const handler = (e: MediaQueryListEvent) => apply(e.matches)
      mq.addEventListener('change', handler)
      return () => mq.removeEventListener('change', handler)
    }

    apply(theme === 'dark')
  }, [theme])
}

export default function App() {
  const { settings, loadSettings } = useSettingsStore()

  useEffect(() => {
    loadSettings()
  }, [loadSettings])

  const locale = settings?.locale ?? 'en'
  const theme = settings?.theme ?? 'dark'
  const t = getTranslations(locale)

  useTheme(theme)

  return (
    <I18nContext.Provider value={t}>
      <div className="min-h-screen bg-base">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/workspace" element={<WorkspacePage />} />
          <Route path="/job/:jobId" element={<JobDetailPage />} />
          <Route path="/job/:jobId/slice" element={<SliceDetailPage />} />
          <Route path="/job/:jobId/export" element={<ExportPage />} />
          <Route path="/preview/:jobId" element={<PreviewPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
        <ToastContainer />
      </div>
    </I18nContext.Provider>
  )
}
