import {describe, expect, it} from 'vitest'
import {
  isInternalPipelineFile,
  isRawRgbaFile,
  isSupportedFile,
  stripExtension
} from './supported-formats'

describe('stripExtension', () => {
  it('should strip .pdf', () => {
    expect(stripExtension('chapter.pdf')).toBe('chapter')
  })

  it('should strip .psd', () => {
    expect(stripExtension('cover.psd')).toBe('cover')
  })

  it('should strip .jpg / .jpeg / .png / .tif / .tiff', () => {
    expect(stripExtension('a.jpg')).toBe('a')
    expect(stripExtension('a.jpeg')).toBe('a')
    expect(stripExtension('a.png')).toBe('a')
    expect(stripExtension('a.tif')).toBe('a')
    expect(stripExtension('a.tiff')).toBe('a')
  })

  it('should strip the internal .rgba container extension (clean tab labels)', () => {
    // `.rgba` is produced by PsdMergeService; users never see it raw, but the
    // workspace tab label should match the other supported formats.
    expect(stripExtension('merged_123_abc12345.rgba')).toBe('merged_123_abc12345')
  })

  it('should be case-insensitive', () => {
    expect(stripExtension('COVER.PSD')).toBe('COVER')
    expect(stripExtension('MERGED.RGBA')).toBe('MERGED')
  })

  it('should only strip recognized extensions', () => {
    expect(stripExtension('archive.zip')).toBe('archive.zip')
    expect(stripExtension('notes.txt')).toBe('notes.txt')
  })
})

describe('isRawRgbaFile / isInternalPipelineFile', () => {
  it('isRawRgbaFile matches .rgba files', () => {
    expect(isRawRgbaFile('/tmp/foo.rgba')).toBe(true)
    expect(isRawRgbaFile('/tmp/foo.RGBA')).toBe(true)
    expect(isRawRgbaFile('/tmp/foo.tiff')).toBe(false)
    expect(isRawRgbaFile('/tmp/foo.png')).toBe(false)
  })

  it('isInternalPipelineFile delegates to isRawRgbaFile today', () => {
    expect(isInternalPipelineFile('/tmp/foo.rgba')).toBe(true)
    expect(isInternalPipelineFile('/tmp/foo.pdf')).toBe(false)
  })

  it('.rgba must NOT be listed as a user-supported file', () => {
    // Critical invariant: users cannot drop `.rgba` files directly. The IPC
    // handler gates on isSupportedFile(); this test pins that behavior.
    expect(isSupportedFile('/tmp/foo.rgba')).toBe(false)
  })
})
