// @vitest-environment jsdom
import {afterEach, describe, expect, it, vi} from 'vitest'
import {cleanup, fireEvent, render, screen} from '@testing-library/react'
import {ToastContainer} from './ToastContainer'
import {useToastStore} from '../stores/toastStore'

afterEach(() => {
  cleanup()
  useToastStore.setState({ toasts: [] })
})

describe('ToastContainer', () => {
  it('returns null when no toasts', () => {
    const { container } = render(<ToastContainer />)
    expect(container.innerHTML).toBe('')
  })

  it('renders success toast with bg-emerald-600', () => {
    useToastStore.setState({
      toasts: [{ id: 1, type: 'success', message: 'Success!' }]
    })
    render(<ToastContainer />)
    const toast = screen.getByText('Success!').closest('div[class*="bg-"]')
    expect(toast?.className).toContain('bg-emerald-600')
  })

  it('renders error toast with bg-red-600', () => {
    useToastStore.setState({
      toasts: [{ id: 1, type: 'error', message: 'Error!' }]
    })
    render(<ToastContainer />)
    const toast = screen.getByText('Error!').closest('div[class*="bg-"]')
    expect(toast?.className).toContain('bg-red-600')
  })

  it('renders info toast with bg-blue-600', () => {
    useToastStore.setState({
      toasts: [{ id: 1, type: 'info', message: 'Info!' }]
    })
    render(<ToastContainer />)
    const toast = screen.getByText('Info!').closest('div[class*="bg-"]')
    expect(toast?.className).toContain('bg-blue-600')
  })

  it('renders action button when toast has action', () => {
    useToastStore.setState({
      toasts: [
        {
          id: 1,
          type: 'info',
          message: 'With action',
          action: { label: 'Undo', onClick: vi.fn() }
        }
      ]
    })
    render(<ToastContainer />)
    expect(screen.getByText('Undo')).toBeDefined()
  })

  it('clicking action button calls onClick and removes toast', () => {
    const onClick = vi.fn()
    useToastStore.setState({
      toasts: [
        {
          id: 1,
          type: 'success',
          message: 'Action toast',
          action: { label: 'Retry', onClick }
        }
      ]
    })
    render(<ToastContainer />)
    fireEvent.click(screen.getByText('Retry'))
    expect(onClick).toHaveBeenCalledOnce()
    expect(useToastStore.getState().toasts).toHaveLength(0)
  })

  it('clicking close button removes toast', () => {
    useToastStore.setState({
      toasts: [{ id: 1, type: 'error', message: 'Closable' }]
    })
    render(<ToastContainer />)
    const closeButton = screen.getByText('\u00d7')
    fireEvent.click(closeButton)
    expect(useToastStore.getState().toasts).toHaveLength(0)
  })

  it('renders multiple toasts', () => {
    useToastStore.setState({
      toasts: [
        { id: 1, type: 'success', message: 'First' },
        { id: 2, type: 'error', message: 'Second' },
        { id: 3, type: 'info', message: 'Third' }
      ]
    })
    render(<ToastContainer />)
    expect(screen.getByText('First')).toBeDefined()
    expect(screen.getByText('Second')).toBeDefined()
    expect(screen.getByText('Third')).toBeDefined()
  })
})
