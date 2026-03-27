import {useCallback, useEffect, useRef, useState} from 'react'
import {useNavigate, useParams, useSearchParams} from 'react-router-dom'
import {useJobStore} from '../stores/jobStore'
import {useTranslation} from '../i18n'
import {useToastStore} from '../stores/toastStore'
import {extractDir, toLocalFileUrl} from '@shared/utils'
import type {Country, Platform, ThumbnailSpec} from '@shared/types'
import CropOverlay from '../components/CropOverlay'

type CropTarget = {
  countryId: string
  platform: Platform
  thumbnailSpec: ThumbnailSpec
}

export default function SliceDetailPage() {
  const { jobId } = useParams<{ jobId: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const t = useTranslation()
  const { currentJob, fetchJobDetail } = useJobStore()
  const addToast = useToastStore((s) => s.addToast)

  const rawIndex = searchParams.get('index')
  const sliceIndex = rawIndex !== null ? parseInt(rawIndex, 10) : 1
  const from = searchParams.get('from')
  const viewerRef = useRef<HTMLDivElement>(null)
  const [scrollAmount, setScrollAmount] = useState(300)
  const scrollAmountRef = useRef(scrollAmount)

  // Thumbnail state
  const [countries, setCountries] = useState<Country[]>([])
  const [showThumbnailMenu, setShowThumbnailMenu] = useState(false)
  const [cropTarget, setCropTarget] = useState<CropTarget | null>(null)
  const [imageLoaded, setImageLoaded] = useState(false)
  const [displaySize, setDisplaySize] = useState({ width: 0, height: 0 })
  const [thumbnailDir, setThumbnailDir] = useState<string | null>(null)

  // Zoom state
  const [scale, setScale] = useState(1)

  useEffect(() => {
    window.api.loadSettings().then((s) => {
      setScrollAmount(s.preview.scrollAmount ?? 300)
    })
    window.api.getCountryPresets().then(setCountries)
    if (jobId) {
      window.api.getThumbnailDir(jobId).then(setThumbnailDir)
    }
  }, [jobId])

  scrollAmountRef.current = scrollAmount

  const scroll = (direction: 'up' | 'down') => {
    const amount = scrollAmountRef.current
    viewerRef.current?.scrollBy({ top: direction === 'up' ? -amount : amount })
  }

  useEffect(() => {
    viewerRef.current?.focus()
  }, [sliceIndex, currentJob])

  useEffect(() => {
    if (jobId && (!currentJob || currentJob.id !== jobId)) {
      fetchJobDetail(jobId)
    }
  }, [jobId, currentJob, fetchJobDetail])

  // Reset state when slice changes
  useEffect(() => {
    setImageLoaded(false)
    setDisplaySize({ width: 0, height: 0 })
    setCropTarget(null)
    setShowThumbnailMenu(false)
    setScale(1)
  }, [sliceIndex])

  // Zoom handler — native event listener with { passive: false }
  const scaleRef = useRef(scale)
  const displaySizeRef = useRef(displaySize)
  scaleRef.current = scale
  displaySizeRef.current = displaySize

  useEffect(() => {
    const container = viewerRef.current
    if (!container) return

    const handleWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      e.stopPropagation()

      const s = scaleRef.current
      const delta = e.deltaY > 0 ? -0.1 : 0.1
      const newScale = Math.min(5, Math.max(0.25, +(s + delta).toFixed(2)))
      if (newScale === s) return
      const ratio = newScale / s

      // Keep cursor position stable by adjusting scroll
      const rect = container.getBoundingClientRect()
      const cursorX = e.clientX - rect.left + container.scrollLeft
      const cursorY = e.clientY - rect.top + container.scrollTop

      setScale(newScale)

      requestAnimationFrame(() => {
        container.scrollLeft = cursorX * ratio - (e.clientX - rect.left)
        container.scrollTop = cursorY * ratio - (e.clientY - rect.top)
      })
    }

    container.addEventListener('wheel', handleWheel, { passive: false })
    return () => container.removeEventListener('wheel', handleWheel)
  }, [sliceIndex, currentJob])

  const resetZoom = useCallback(() => {
    setScale(1)
  }, [])

  const zoomIn = useCallback(() => {
    const container = viewerRef.current
    if (!container) return
    const oldScale = scaleRef.current
    const newScale = Math.min(5, +(oldScale + 0.25).toFixed(2))
    // Zoom toward center of viewport
    const centerX = container.clientWidth / 2 + container.scrollLeft
    const centerY = container.clientHeight / 2 + container.scrollTop
    const ratio = newScale / oldScale
    setScale(newScale)
    requestAnimationFrame(() => {
      container.scrollLeft = centerX * ratio - container.clientWidth / 2
      container.scrollTop = centerY * ratio - container.clientHeight / 2
    })
  }, [])

  const zoomOut = useCallback(() => {
    const container = viewerRef.current
    if (!container) return
    const oldScale = scaleRef.current
    const newScale = Math.max(0.25, +(oldScale - 0.25).toFixed(2))
    const centerX = container.clientWidth / 2 + container.scrollLeft
    const centerY = container.clientHeight / 2 + container.scrollTop
    const ratio = newScale / oldScale
    setScale(newScale)
    requestAnimationFrame(() => {
      container.scrollLeft = centerX * ratio - container.clientWidth / 2
      container.scrollTop = centerY * ratio - container.clientHeight / 2
    })
  }, [])

  const file = currentJob?.files.find((f) => f.index === sliceIndex)
  const totalSlices = currentJob?.files.length ?? 0

  const goBack = useCallback(() => {
    if (from === 'workspace') {
      navigate('/workspace')
    } else {
      navigate(`/job/${jobId}`)
    }
  }, [from, navigate, jobId])

  const goTo = useCallback(
    (index: number) => {
      const params: Record<string, string> = { index: String(index) }
      if (from) params.from = from
      setSearchParams(params)
      requestAnimationFrame(() => viewerRef.current?.focus())
    },
    [setSearchParams, from]
  )

  // Platforms with thumbnail spec
  const thumbnailPlatforms: { countryId: string; platform: Platform; spec: ThumbnailSpec }[] = []
  for (const country of countries) {
    for (const p of country.platforms) {
      if (p.thumbnail) {
        thumbnailPlatforms.push({ countryId: country.id, platform: p, spec: p.thumbnail })
      }
    }
  }

  const [cropScrollInfo, setCropScrollInfo] = useState<{ scrollTop: number; viewerHeight: number }>({ scrollTop: 0, viewerHeight: 0 })

  const handleSelectPlatform = (countryId: string, platform: Platform, spec: ThumbnailSpec) => {
    setShowThumbnailMenu(false)
    const viewer = viewerRef.current
    setCropScrollInfo({
      scrollTop: viewer?.scrollTop ?? 0,
      viewerHeight: viewer?.clientHeight ?? 0
    })
    setCropTarget({ countryId, platform, thumbnailSpec: spec })
  }

  const handleCropConfirm = async (crop: { x: number; y: number; width: number; height: number }) => {
    if (!cropTarget || !jobId || !file) return

    try {
      const result = await window.api.captureThumbnail({
        jobId,
        sliceIndex: file.index,
        countryId: cropTarget.countryId,
        platformId: cropTarget.platform.id,
        crop
      })
      const dir = extractDir(result.outputPath)
      setThumbnailDir(dir)
      const message = result.upscaled && result.sourceSize
        ? t.thumbnailSuccessUpscaled(result.sourceSize.width, result.sourceSize.height)
        : t.thumbnailSuccess
      addToast(result.upscaled ? 'info' : 'success', message, {
        label: t.thumbnailOpenFolder,
        onClick: () => window.api.openPath(dir)
      })
    } catch {
      addToast('error', t.thumbnailFailed)
    }

    setCropTarget(null)
  }

  const handleCropCancel = () => {
    setCropTarget(null)
  }

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!currentJob) return
      if (cropTarget) {
        if (e.key === 'Escape') {
          setCropTarget(null)
          e.preventDefault()
        }
        return
      }
      const first = currentJob.files[0]?.index ?? 1
      const last = currentJob.files[currentJob.files.length - 1]?.index ?? 1

      if (e.key === 'ArrowUp') {
        e.preventDefault()
        scroll('up')
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        scroll('down')
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        if (sliceIndex > first) goTo(sliceIndex - 1)
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        if (sliceIndex < last) goTo(sliceIndex + 1)
      } else if (e.key === 'Escape') {
        goBack()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [sliceIndex, currentJob, goTo, goBack, cropTarget])

  if (!currentJob) {
    return <div className="p-6 text-tertiary">{t.loading}</div>
  }

  if (!file) {
    return <div className="p-6 text-tertiary">{t.sliceNotFound}</div>
  }

  const currentIdx = currentJob.files.findIndex((f) => f.index === sliceIndex)
  const hasPrev = currentIdx > 0
  const hasNext = currentIdx < currentJob.files.length - 1

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

        <span className="text-primary text-sm font-medium">{currentJob.title}</span>

        <div className="h-4 w-px bg-divider" />

        {/* Navigation */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => hasPrev && goTo(currentJob.files[currentIdx - 1].index)}
            disabled={!hasPrev}
            className="px-2.5 py-1 bg-elevated hover:bg-hover-elevated disabled:bg-surface disabled:text-faint rounded text-xs transition"
          >
            {t.prev}
          </button>
          <span className="text-sm text-secondary min-w-[80px] text-center">
            {currentIdx + 1} / {totalSlices}
          </span>
          <button
            onClick={() => hasNext && goTo(currentJob.files[currentIdx + 1].index)}
            disabled={!hasNext}
            className="px-2.5 py-1 bg-elevated hover:bg-hover-elevated disabled:bg-surface disabled:text-faint rounded text-xs transition"
          >
            {t.next}
          </button>
        </div>

        <div className="h-4 w-px bg-divider" />

        <button
          onClick={() => navigate(`/preview/${jobId}`)}
          className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 rounded text-xs font-medium transition text-white"
        >
          {t.preview}
        </button>

        <div className="h-4 w-px bg-divider" />

        <div className="flex items-center gap-1.5">
          <label className="text-xs text-tertiary">{t.scrollSpeed}</label>
          <input
            type="range"
            value={scrollAmount}
            onChange={(e) => setScrollAmount(Number(e.target.value))}
            min={50}
            max={1000}
            step={50}
            className="w-24 accent-blue-500"
          />
          <span className="text-[10px] text-muted w-8">{scrollAmount}</span>
        </div>

        <div className="h-4 w-px bg-divider" />

        {/* Thumbnail button + folder open */}
        <div className="flex items-center gap-1">
          <div className="relative">
            <button
              onClick={() => {
                if (thumbnailPlatforms.length === 0) {
                  addToast('info', t.thumbnailNoPlatforms)
                  return
                }
                setShowThumbnailMenu((prev) => !prev)
              }}
              className={`px-3 py-1 rounded-l text-xs font-medium transition ${
                cropTarget
                  ? 'bg-blue-600 text-white'
                  : 'bg-amber-600 hover:bg-amber-500 text-white'
              }`}
            >
              {t.thumbnail}
            </button>

            {/* Platform dropdown */}
            {showThumbnailMenu && (
              <div className="absolute top-full mt-1 right-0 bg-surface border border-border-subtle rounded-lg shadow-xl z-50 min-w-[220px] py-1">
                {countries.map((country) => {
                  const platformsWithThumb = country.platforms.filter((p) => p.thumbnail)
                  if (platformsWithThumb.length === 0) return null
                  return (
                    <div key={country.id}>
                      <div className="px-3 py-1 text-[10px] text-muted uppercase tracking-wider">
                        {t.countryName(country.id)}
                      </div>
                      {platformsWithThumb.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => handleSelectPlatform(country.id, p, p.thumbnail!)}
                          className="w-full text-left px-3 py-1.5 hover:bg-hover transition text-sm text-secondary flex items-center justify-between"
                        >
                          <span>{t.platformName(p.id)}</span>
                          <span className="text-[10px] text-muted">
                            {p.thumbnail!.width}x{p.thumbnail!.height}
                          </span>
                        </button>
                      ))}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Open thumbnail folder button — visible when a thumbnail has been saved */}
          {thumbnailDir && (
            <button
              onClick={() => window.api.openPath(thumbnailDir)}
              className="px-2 py-1 bg-amber-700 hover:bg-amber-600 rounded-r text-xs text-white transition"
              title={t.thumbnailOpenFolder}
            >
              &#x1F4C2;
            </button>
          )}
        </div>

        <div className="flex-1" />

        {/* File info */}
        <span className="text-xs text-tertiary">{file.name}</span>
        <span className="text-xs text-muted">
          {file.width} x {file.height}
        </span>
        {file.pageNumber && (
          <span className="text-xs text-muted">{t.page(file.pageNumber)}</span>
        )}
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Thumbnail strip (left) */}
        <div className="w-20 flex-shrink-0 bg-base border-r border-border overflow-y-auto py-2">
          {currentJob.files.map((f) => (
            <button
              key={f.index}
              onClick={() => goTo(f.index)}
              className={`mx-1.5 mb-1.5 rounded cursor-pointer border-2 overflow-hidden transition ${
                f.index === sliceIndex
                  ? 'border-blue-500'
                  : 'border-transparent hover:border-border-subtle'
              }`}
            >
              <img
                src={toLocalFileUrl(f.thumbnailPath ?? f.path)}
                alt={f.name}
                className="w-full aspect-[3/4] object-cover"
                loading="lazy"
              />
              <div className="text-center py-0.5">
                <span className="text-[10px] text-muted">{f.index}</span>
              </div>
            </button>
          ))}
        </div>

        {/* Main image viewer */}
        <div
          ref={viewerRef}
          tabIndex={-1}
          className="flex-1 overflow-auto relative outline-none"
        >
          <div
            className="flex items-start justify-center p-4"
            style={{ minWidth: '100%', minHeight: '100%' }}
          >
            <div className="relative inline-block">
              <img
                src={toLocalFileUrl(file.path)}
                alt={file.name}
                className="block"
                style={{
                  imageRendering: 'auto',
                  ...(scale === 1
                    ? { maxWidth: '100%' }
                    : { width: `${displaySize.width * scale}px` }),
                }}
                onLoad={(e) => {
                  setImageLoaded(true)
                  setDisplaySize({ width: e.currentTarget.clientWidth, height: e.currentTarget.clientHeight })
                }}
              />

              {/* Crop overlay — inside relative wrapper so it covers the full image */}
              {cropTarget && imageLoaded && displaySize.width > 0 && (
                <CropOverlay
                  aspectRatio={cropTarget.thumbnailSpec.width / cropTarget.thumbnailSpec.height}
                  imageNaturalWidth={file.width}
                  imageNaturalHeight={file.height}
                  displayWidth={displaySize.width * scale}
                  displayHeight={displaySize.height * scale}
                  scrollTop={cropScrollInfo.scrollTop}
                  viewerHeight={cropScrollInfo.viewerHeight}
                  onConfirm={handleCropConfirm}
                  onCancel={handleCropCancel}
                />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Zoom controls + Scroll buttons */}
      <div className="fixed right-6 bottom-6 flex flex-col items-center gap-2">
        <button
          onClick={() => scroll('up')}
          className="w-10 h-10 bg-elevated hover:bg-hover-elevated rounded-full text-primary text-lg flex items-center justify-center shadow-lg transition"
        >
          &uarr;
        </button>
        <button
          onClick={() => scroll('down')}
          className="w-10 h-10 bg-elevated hover:bg-hover-elevated rounded-full text-primary text-lg flex items-center justify-center shadow-lg transition"
        >
          &darr;
        </button>
        <div className="h-px w-8 bg-divider" />
        <button
          onClick={zoomIn}
          className="w-10 h-10 bg-elevated hover:bg-hover-elevated rounded-full text-primary text-lg flex items-center justify-center shadow-lg transition"
          title="Zoom in"
        >
          +
        </button>
        <span className="text-xs text-secondary font-medium select-none">{Math.round(scale * 100)}%</span>
        <button
          onClick={zoomOut}
          className="w-10 h-10 bg-elevated hover:bg-hover-elevated rounded-full text-primary text-lg flex items-center justify-center shadow-lg transition"
          title="Zoom out"
        >
          &minus;
        </button>
        {scale !== 1 && (
          <button
            onClick={resetZoom}
            className="w-10 h-10 bg-elevated hover:bg-hover-elevated rounded-full text-primary text-xs flex items-center justify-center shadow-lg transition"
            title="Reset zoom"
          >
            1:1
          </button>
        )}
      </div>
    </div>
  )
}
