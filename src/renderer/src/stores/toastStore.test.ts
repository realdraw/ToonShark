import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {useToastStore} from './toastStore'

describe('toastStore', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    // Reset store state
    useToastStore.setState({ toasts: [] })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('addToast', () => {
    it('should add a success toast', () => {
      useToastStore.getState().addToast('success', 'Job completed')

      const { toasts } = useToastStore.getState()
      expect(toasts).toHaveLength(1)
      expect(toasts[0].type).toBe('success')
      expect(toasts[0].message).toBe('Job completed')
      expect(toasts[0].id).toBeGreaterThan(0)
    })

    it('should add an error toast', () => {
      useToastStore.getState().addToast('error', 'Something failed')

      const { toasts } = useToastStore.getState()
      expect(toasts).toHaveLength(1)
      expect(toasts[0].type).toBe('error')
      expect(toasts[0].message).toBe('Something failed')
    })

    it('should add an info toast', () => {
      useToastStore.getState().addToast('info', 'Settings have been reset')

      const { toasts } = useToastStore.getState()
      expect(toasts).toHaveLength(1)
      expect(toasts[0].type).toBe('info')
      expect(toasts[0].message).toBe('Settings have been reset')
    })

    it('should prepend new toasts (newest first)', () => {
      useToastStore.getState().addToast('success', 'First')
      useToastStore.getState().addToast('error', 'Second')

      const { toasts } = useToastStore.getState()
      expect(toasts).toHaveLength(2)
      expect(toasts[0].message).toBe('Second')
      expect(toasts[1].message).toBe('First')
    })

    it('should assign unique incrementing IDs', () => {
      useToastStore.getState().addToast('success', 'A')
      useToastStore.getState().addToast('success', 'B')

      const { toasts } = useToastStore.getState()
      expect(toasts[0].id).toBeGreaterThan(toasts[1].id)
    })

    it('should limit to max 5 toasts', () => {
      for (let i = 0; i < 7; i++) {
        useToastStore.getState().addToast('success', `Toast ${i}`)
      }

      const { toasts } = useToastStore.getState()
      expect(toasts).toHaveLength(5)
      // Most recent should be first
      expect(toasts[0].message).toBe('Toast 6')
    })

    it('should auto-remove toast after 4 seconds', () => {
      useToastStore.getState().addToast('success', 'Temporary')

      expect(useToastStore.getState().toasts).toHaveLength(1)

      vi.advanceTimersByTime(4000)

      expect(useToastStore.getState().toasts).toHaveLength(0)
    })

    it('should store action in toast', () => {
      const onClick = vi.fn()
      useToastStore.getState().addToast('success', 'With action', { label: 'Open', onClick })

      const { toasts } = useToastStore.getState()
      expect(toasts).toHaveLength(1)
      expect(toasts[0].action?.label).toBe('Open')
      toasts[0].action?.onClick()
      expect(onClick).toHaveBeenCalledOnce()
    })

    it('should auto-remove toast with action after 8 seconds', () => {
      useToastStore.getState().addToast('success', 'Action toast', { label: 'Do', onClick: vi.fn() })

      expect(useToastStore.getState().toasts).toHaveLength(1)

      // Should still be there at 4s
      vi.advanceTimersByTime(4000)
      expect(useToastStore.getState().toasts).toHaveLength(1)

      // Gone at 8s
      vi.advanceTimersByTime(4000)
      expect(useToastStore.getState().toasts).toHaveLength(0)
    })

    it('should not remove other toasts when one auto-removes', () => {
      useToastStore.getState().addToast('success', 'First')

      vi.advanceTimersByTime(2000)
      useToastStore.getState().addToast('error', 'Second')

      // After 2 more seconds, first should be removed
      vi.advanceTimersByTime(2000)

      const { toasts } = useToastStore.getState()
      expect(toasts).toHaveLength(1)
      expect(toasts[0].message).toBe('Second')
    })
  })

  describe('removeToast', () => {
    it('should remove a specific toast by ID', () => {
      useToastStore.getState().addToast('success', 'Keep')
      useToastStore.getState().addToast('error', 'Remove')

      const toRemoveId = useToastStore.getState().toasts[0].id
      useToastStore.getState().removeToast(toRemoveId)

      const { toasts } = useToastStore.getState()
      expect(toasts).toHaveLength(1)
      expect(toasts[0].message).toBe('Keep')
    })

    it('should do nothing when removing non-existent ID', () => {
      useToastStore.getState().addToast('success', 'Exists')
      useToastStore.getState().removeToast(99999)

      expect(useToastStore.getState().toasts).toHaveLength(1)
    })

    it('should handle removing from empty list', () => {
      useToastStore.getState().removeToast(1)
      expect(useToastStore.getState().toasts).toHaveLength(0)
    })
  })
})
