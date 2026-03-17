import {useCallback, useEffect, useRef, useState} from 'react'
import {useTranslation} from '../i18n'

type CropRect = { x: number; y: number; width: number; height: number }

type Props = {
  /** Aspect ratio = width / height of the target thumbnail */
  aspectRatio: number
  /** Natural (original) image dimensions */
  imageNaturalWidth: number
  imageNaturalHeight: number
  /** Display dimensions of the image (from wrapper) */
  displayWidth: number
  displayHeight: number
  /** Current scroll offset of the viewer (so crop box appears in visible area) */
  scrollTop?: number
  /** Visible height of the viewer */
  viewerHeight?: number
  onConfirm: (crop: CropRect) => void
  onCancel: () => void
}

type DragState =
  | { type: 'move'; startX: number; startY: number; origX: number; origY: number }
  | { type: 'resize'; corner: string; startX: number; startY: number; origRect: CropRect }

function initCrop(aspectRatio: number, displayWidth: number, displayHeight: number, scrollTop = 0, viewerHeight?: number): CropRect {
  let cropW: number, cropH: number
  if (displayWidth / displayHeight > aspectRatio) {
    cropH = Math.min(displayHeight, displayWidth / aspectRatio)
    cropW = cropH * aspectRatio
  } else {
    cropW = displayWidth * 0.8
    cropH = cropW / aspectRatio
  }

  // Place crop box in the visible area based on scroll position
  const visibleH = viewerHeight ?? displayHeight
  const visibleTop = scrollTop
  const centerY = visibleTop + (visibleH - cropH) / 2
  const y = Math.max(0, Math.min(centerY, displayHeight - cropH))

  return {
    x: (displayWidth - cropW) / 2,
    y,
    width: cropW,
    height: cropH
  }
}

export default function CropOverlay({ aspectRatio, imageNaturalWidth, imageNaturalHeight, displayWidth, displayHeight, scrollTop, viewerHeight, onConfirm, onCancel }: Props) {
  const t = useTranslation()
  const dragRef = useRef<DragState | null>(null)

  const [crop, setCrop] = useState<CropRect>(() => initCrop(aspectRatio, displayWidth, displayHeight, scrollTop, viewerHeight))

  useEffect(() => {
    setCrop(initCrop(aspectRatio, displayWidth, displayHeight, scrollTop, viewerHeight))
  }, [aspectRatio, displayWidth, displayHeight, scrollTop, viewerHeight])

  const clampCrop = useCallback((rect: CropRect): CropRect => {
    let { x, y, width, height } = rect
    width = Math.max(40, Math.min(width, displayWidth))
    height = Math.max(40 / aspectRatio, Math.min(height, displayHeight))
    x = Math.max(0, Math.min(x, displayWidth - width))
    y = Math.max(0, Math.min(y, displayHeight - height))
    return { x, y, width, height }
  }, [displayWidth, displayHeight, aspectRatio])

  const handleMouseDown = useCallback((e: React.MouseEvent, action: 'move' | string) => {
    e.preventDefault()
    e.stopPropagation()

    if (action === 'move') {
      dragRef.current = { type: 'move', startX: e.clientX, startY: e.clientY, origX: crop.x, origY: crop.y }
    } else {
      dragRef.current = { type: 'resize', corner: action, startX: e.clientX, startY: e.clientY, origRect: { ...crop } }
    }
  }, [crop])

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const drag = dragRef.current
      if (!drag) return

      const dx = e.clientX - drag.startX
      const dy = e.clientY - drag.startY

      if (drag.type === 'move') {
        setCrop((prev) => clampCrop({ ...prev, x: drag.origX + dx, y: drag.origY + dy }))
      } else {
        const { corner, origRect } = drag
        let newRect = { ...origRect }

        // SE corner (default resize)
        if (corner === 'se') {
          newRect.width = Math.max(40, origRect.width + dx)
          newRect.height = newRect.width / aspectRatio
        } else if (corner === 'sw') {
          const dw = Math.min(dx, origRect.width - 40)
          newRect.width = origRect.width - dw
          newRect.height = newRect.width / aspectRatio
          newRect.x = origRect.x + dw
        } else if (corner === 'ne') {
          newRect.width = Math.max(40, origRect.width + dx)
          newRect.height = newRect.width / aspectRatio
          newRect.y = origRect.y + (origRect.height - newRect.height)
        } else if (corner === 'nw') {
          const dw = Math.min(dx, origRect.width - 40)
          newRect.width = origRect.width - dw
          newRect.height = newRect.width / aspectRatio
          newRect.x = origRect.x + dw
          newRect.y = origRect.y + (origRect.height - newRect.height)
        }

        setCrop(clampCrop(newRect))
      }
    }

    const handleMouseUp = () => {
      dragRef.current = null
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [aspectRatio, clampCrop])

  const handleConfirm = () => {
    const scaleX = imageNaturalWidth / displayWidth
    const scaleY = imageNaturalHeight / displayHeight

    onConfirm({
      x: crop.x * scaleX,
      y: crop.y * scaleY,
      width: crop.width * scaleX,
      height: crop.height * scaleY
    })
  }

  const corners = ['nw', 'ne', 'sw', 'se'] as const
  const cornerCursors: Record<string, string> = { nw: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', se: 'nwse-resize' }
  const cornerPositions: Record<string, React.CSSProperties> = {
    nw: { top: -4, left: -4 },
    ne: { top: -4, right: -4 },
    sw: { bottom: -4, left: -4 },
    se: { bottom: -4, right: -4 }
  }

  const scaleX = imageNaturalWidth / displayWidth
  const scaleY = imageNaturalHeight / displayHeight

  return (
    <>
      {/* Dim overlay outside crop — covers full image */}
      <div
        className="absolute inset-0 bg-black/50"
        style={{
          pointerEvents: 'auto',
          clipPath: `polygon(
            0% 0%, 100% 0%, 100% 100%, 0% 100%, 0% 0%,
            ${crop.x}px ${crop.y}px,
            ${crop.x}px ${crop.y + crop.height}px,
            ${crop.x + crop.width}px ${crop.y + crop.height}px,
            ${crop.x + crop.width}px ${crop.y}px,
            ${crop.x}px ${crop.y}px
          )`
        }}
      />

      {/* Crop box */}
      <div
        className="absolute border-2 border-blue-400"
        style={{
          left: crop.x,
          top: crop.y,
          width: crop.width,
          height: crop.height,
          cursor: 'move',
          pointerEvents: 'auto'
        }}
        onMouseDown={(e) => handleMouseDown(e, 'move')}
      >
        {/* Corner handles */}
        {corners.map((c) => (
          <div
            key={c}
            className="absolute w-3 h-3 bg-blue-400 border border-white rounded-sm"
            style={{
              ...cornerPositions[c],
              cursor: cornerCursors[c],
              pointerEvents: 'auto'
            }}
            onMouseDown={(e) => handleMouseDown(e, c)}
          />
        ))}

        {/* Dimension label */}
        <div className="absolute -top-6 left-0 text-[10px] text-blue-300 bg-base/80 px-1 rounded whitespace-nowrap">
          {Math.round(crop.width * scaleX)} x {Math.round(crop.height * scaleY)}
        </div>
      </div>

      {/* Buttons — fixed to bottom of viewport for visibility */}
      <div
        className="absolute flex gap-2"
        style={{
          left: crop.x,
          top: crop.y + crop.height + 8,
          pointerEvents: 'auto'
        }}
      >
        <button
          onClick={handleConfirm}
          className="px-3 py-1 bg-blue-600 hover:bg-blue-500 rounded text-xs font-medium text-white transition"
        >
          {t.thumbnailConfirm}
        </button>
        <button
          onClick={onCancel}
          className="px-3 py-1 bg-elevated hover:bg-hover-elevated rounded text-xs text-secondary transition"
        >
          {t.thumbnailCancel}
        </button>
      </div>
    </>
  )
}
