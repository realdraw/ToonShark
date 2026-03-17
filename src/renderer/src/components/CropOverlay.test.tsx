// @vitest-environment jsdom
import {afterEach, describe, expect, it, vi} from 'vitest'
import {cleanup, fireEvent, render, screen} from '@testing-library/react'
import CropOverlay from './CropOverlay'
import {I18nContext} from '../i18n'
import en from '../i18n/en'

function renderCrop(props: Partial<React.ComponentProps<typeof CropOverlay>> = {}) {
  const defaultProps = {
    aspectRatio: 2, // 2:1 landscape
    imageNaturalWidth: 1000,
    imageNaturalHeight: 2000,
    displayWidth: 500,
    displayHeight: 1000,
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
    ...props
  }
  return render(
    <I18nContext.Provider value={en}>
      <div style={{ position: 'relative', width: 500, height: 1000 }}>
        <CropOverlay {...defaultProps} />
      </div>
    </I18nContext.Provider>
  )
}

describe('CropOverlay', () => {
  afterEach(cleanup)

  it('renders Save and Cancel buttons', () => {
    renderCrop()
    expect(screen.getByRole('button', { name: en.thumbnailConfirm })).toBeTruthy()
    expect(screen.getByRole('button', { name: en.thumbnailCancel })).toBeTruthy()
  })

  it('calls onCancel when Cancel is clicked', () => {
    const onCancel = vi.fn()
    renderCrop({ onCancel })
    fireEvent.click(screen.getByRole('button', { name: en.thumbnailCancel }))
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('calls onConfirm with crop rect scaled to natural image dimensions', () => {
    const onConfirm = vi.fn()
    renderCrop({
      aspectRatio: 2,
      imageNaturalWidth: 1000,
      imageNaturalHeight: 2000,
      displayWidth: 500,
      displayHeight: 1000,
      onConfirm
    })
    fireEvent.click(screen.getByRole('button', { name: en.thumbnailConfirm }))

    expect(onConfirm).toHaveBeenCalledOnce()
    const crop = onConfirm.mock.calls[0][0]
    // Crop should be in natural image coordinates (scaled by 2x from display)
    expect(crop.x).toBeGreaterThanOrEqual(0)
    expect(crop.y).toBeGreaterThanOrEqual(0)
    expect(crop.width).toBeGreaterThan(0)
    expect(crop.height).toBeGreaterThan(0)
    // Aspect ratio preserved: width / height ≈ 2
    expect(crop.width / crop.height).toBeCloseTo(2, 0)
  })

  it('shows dimension label with natural pixel sizes', () => {
    const { container } = renderCrop({
      aspectRatio: 2,
      imageNaturalWidth: 1000,
      imageNaturalHeight: 2000,
      displayWidth: 500,
      displayHeight: 1000
    })
    const label = container.querySelector('.text-blue-300')
    expect(label).toBeTruthy()
    expect(label!.textContent).toMatch(/\d+ x \d+/)
  })

  it('initializes crop in visible area when scrolled', () => {
    const onConfirm = vi.fn()
    renderCrop({
      aspectRatio: 2,
      imageNaturalWidth: 1000,
      imageNaturalHeight: 5000,
      displayWidth: 500,
      displayHeight: 2500,
      scrollTop: 1000,
      viewerHeight: 600,
      onConfirm
    })

    fireEvent.click(screen.getByRole('button', { name: en.thumbnailConfirm }))
    const crop = onConfirm.mock.calls[0][0]
    // Crop y should be near scroll position (1000 display = 2000 natural), not at top
    expect(crop.y).toBeGreaterThan(1000)
  })

  it('initializes crop at top when not scrolled', () => {
    const onConfirm = vi.fn()
    renderCrop({
      aspectRatio: 2,
      imageNaturalWidth: 1000,
      imageNaturalHeight: 5000,
      displayWidth: 500,
      displayHeight: 2500,
      scrollTop: 0,
      viewerHeight: 600,
      onConfirm
    })

    fireEvent.click(screen.getByRole('button', { name: en.thumbnailConfirm }))
    const crop = onConfirm.mock.calls[0][0]
    // Crop y should be near the top of the visible area
    expect(crop.y).toBeLessThan(1000)
  })

  it('renders four corner resize handles', () => {
    const { container } = renderCrop()
    const handles = container.querySelectorAll('.bg-blue-400.border.border-white')
    expect(handles.length).toBe(4)
  })

  it('renders dim overlay with clip-path hole', () => {
    const { container } = renderCrop()
    const dimOverlay = container.querySelector('.bg-black\\/50')
    expect(dimOverlay).toBeTruthy()
    const style = dimOverlay!.getAttribute('style') ?? ''
    expect(style).toContain('clip-path')
  })
})
