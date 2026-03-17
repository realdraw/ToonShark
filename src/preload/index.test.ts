import {beforeEach, describe, expect, it, vi} from 'vitest'

const invoke = vi.fn()
const send = vi.fn()
const on = vi.fn()
const removeListener = vi.fn()
const exposeInMainWorld = vi.fn()
const getPathForFile = vi.fn()

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld
  },
  ipcRenderer: {
    invoke,
    send,
    on,
    removeListener
  },
  webUtils: {
    getPathForFile
  }
}))

describe('preload api', () => {
  beforeEach(async () => {
    vi.resetModules()
    invoke.mockReset()
    send.mockReset()
    on.mockReset()
    removeListener.mockReset()
    exposeInMainWorld.mockReset()
    getPathForFile.mockReset()
    await import('./index')
  })

  it('exposes api in main world', () => {
    expect(exposeInMainWorld).toHaveBeenCalledWith('api', expect.any(Object))
  })

  it('invokes the expected channels', () => {
    const api = exposeInMainWorld.mock.calls[0][1]

    api.loadSettings()
    api.getDefaultSettings()
    api.runSliceJob({ sourcePdfPath: '/a.pdf', title: 'a', prefix: 'a', mode: 'fixed', options: {} })

    expect(invoke).toHaveBeenNthCalledWith(1, 'load-settings')
    expect(invoke).toHaveBeenNthCalledWith(2, 'get-default-settings')
    expect(invoke).toHaveBeenNthCalledWith(
      3,
      'run-slice-job',
      { sourcePdfPath: '/a.pdf', title: 'a', prefix: 'a', mode: 'fixed', options: {} }
    )
  })

  it('invokes get-thumbnail-dir channel', () => {
    const api = exposeInMainWorld.mock.calls[0][1]

    api.getThumbnailDir('job-1')

    expect(invoke).toHaveBeenCalledWith('get-thumbnail-dir', 'job-1')
  })

  it('invokes capture-thumbnail channel', () => {
    const api = exposeInMainWorld.mock.calls[0][1]
    const payload = { jobId: 'j1', sliceIndex: 1, countryId: 'kr', platformId: 'naver', crop: { x: 0, y: 0, width: 100, height: 50 } }

    api.captureThumbnail(payload)

    expect(invoke).toHaveBeenCalledWith('capture-thumbnail', payload)
  })

  it('falls back to file.path when webUtils throws', () => {
    const api = exposeInMainWorld.mock.calls[0][1]
    const file = { path: '/fallback.pdf' } as File & { path: string }
    getPathForFile.mockImplementation(() => {
      throw new Error('unsupported')
    })

    expect(api.getPathForFile(file)).toBe('/fallback.pdf')
  })

  it('subscribes and unsubscribes job-progress listeners', () => {
    const api = exposeInMainWorld.mock.calls[0][1]
    const callback = vi.fn()

    const unsubscribe = api.onJobProgress(callback)
    const listener = on.mock.calls[0][1]

    listener({}, { stepKey: 'progressDone', current: 1, total: 1, percent: 100 })
    unsubscribe()

    expect(on).toHaveBeenCalledWith('job-progress', expect.any(Function))
    expect(callback).toHaveBeenCalledWith({ stepKey: 'progressDone', current: 1, total: 1, percent: 100 })
    expect(removeListener).toHaveBeenCalledWith('job-progress', listener)
  })

  it('sends renderer logs over ipc', () => {
    const api = exposeInMainWorld.mock.calls[0][1]

    api.log('warn', 'message', { extra: true })

    expect(send).toHaveBeenCalledWith('renderer-log', {
      level: 'warn',
      message: 'message',
      extra: { extra: true }
    })
  })
})
