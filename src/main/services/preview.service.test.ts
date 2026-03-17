import {afterEach, beforeEach, describe, expect, it} from 'vitest'
import {PreviewService} from './preview.service'
import {existsSync, mkdirSync, readFileSync, rmSync} from 'fs'
import {join} from 'path'
import {tmpdir} from 'os'
import type {DevicePreset, SliceFileInfo} from '@shared/types'

describe('PreviewService', () => {
  let service: PreviewService
  let testDir: string

  beforeEach(() => {
    testDir = join(tmpdir(), `preview_test_${Date.now()}`)
    mkdirSync(join(testDir, 'preview'), { recursive: true })
    mkdirSync(join(testDir, 'slices'), { recursive: true })
    service = new PreviewService()
  })

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true })
  })

  const sampleFiles: SliceFileInfo[] = [
    { name: 'test_0001.png', path: '/tmp/slices/test_0001.png', width: 720, height: 1000, index: 1 },
    { name: 'test_0002.png', path: '/tmp/slices/test_0002.png', width: 720, height: 1000, index: 2 },
    { name: 'test_0003.png', path: '/tmp/slices/test_0003.png', width: 720, height: 500, index: 3 }
  ]

  const sampleDevices: DevicePreset[] = [
    { id: 'iphone_16', name: 'iPhone 16', cssViewportWidth: 393, cssViewportHeight: 852 },
    { id: 'galaxy_s26', name: 'Galaxy S26', cssViewportWidth: 412, cssViewportHeight: 915 }
  ]

  describe('generatePreviewHtml', () => {
    it('should generate valid HTML with image tags', () => {
      const html = service.generatePreviewHtml(sampleFiles, sampleDevices, {
        imageGap: 0,

        defaultDeviceId: 'iphone_16'
      })

      expect(html).toContain('<!DOCTYPE html>')
      expect(html).toContain('test_0001.png')
      expect(html).toContain('test_0002.png')
      expect(html).toContain('test_0003.png')
      expect(html).toContain('iPhone 16')
      expect(html).toContain('Galaxy S26')
    })

    it('should include device preset selector', () => {
      const html = service.generatePreviewHtml(sampleFiles, sampleDevices, {
        imageGap: 0,

        defaultDeviceId: 'iphone_16'
      })

      expect(html).toContain('393')
      expect(html).toContain('852')
    })

    it('should escape HTML in device names to prevent XSS', () => {
      const maliciousDevices: DevicePreset[] = [
        { id: 'xss', name: '<script>alert("xss")</script>', cssViewportWidth: 400, cssViewportHeight: 800 }
      ]

      const html = service.generatePreviewHtml(sampleFiles, maliciousDevices, {
        imageGap: 0,

        defaultDeviceId: 'xss'
      })

      expect(html).not.toContain('<script>alert("xss")</script>')
      expect(html).toContain('&lt;script&gt;')
    })

    it('should encode filenames in URLs to prevent injection', () => {
      const filesWithSpecialChars: SliceFileInfo[] = [
        { name: 'file with spaces.png', path: '/tmp/file with spaces.png', width: 720, height: 1000, index: 1 },
        { name: '한글파일.png', path: '/tmp/한글파일.png', width: 720, height: 1000, index: 2 }
      ]

      const html = service.generatePreviewHtml(filesWithSpecialChars, sampleDevices, {
        imageGap: 0,

        defaultDeviceId: 'iphone_16'
      })

      expect(html).toContain(encodeURIComponent('file with spaces.png'))
      expect(html).toContain(encodeURIComponent('한글파일.png'))
    })

    it('should fall back to first device if defaultDeviceId not found', () => {
      const html = service.generatePreviewHtml(sampleFiles, sampleDevices, {
        imageGap: 0,

        defaultDeviceId: 'nonexistent'
      })

      // Should still render with first device as default
      expect(html).toContain('selected')
      expect(html).toContain('393')
    })

    it('should apply imageGap to image styles', () => {
      const html = service.generatePreviewHtml(sampleFiles, sampleDevices, {
        imageGap: 5,

        defaultDeviceId: 'iphone_16'
      })

      expect(html).toContain('margin-bottom:5px')
    })

    it('should handle empty file list', () => {
      const html = service.generatePreviewHtml([], sampleDevices, {
        imageGap: 0,

        defaultDeviceId: 'iphone_16'
      })

      expect(html).toContain('<!DOCTYPE html>')
      expect(html).not.toContain('<img')
    })

    it('should clamp negative imageGap to 0', () => {
      const html = service.generatePreviewHtml(sampleFiles, sampleDevices, {
        imageGap: -10,

        defaultDeviceId: 'iphone_16'
      })

      expect(html).toContain('margin-bottom:0px')
    })

    it('should clamp very large imageGap to 500', () => {
      const html = service.generatePreviewHtml(sampleFiles, sampleDevices, {
        imageGap: 9999,

        defaultDeviceId: 'iphone_16'
      })

      expect(html).toContain('margin-bottom:500px')
    })

    it('should reference original slice paths not thumbnail paths', () => {
      const filesWithThumbnails: SliceFileInfo[] = [
        { name: 'test_0001.png', path: '/tmp/slices/test_0001.png', width: 720, height: 1000, index: 1, thumbnailPath: '/tmp/thumbs/test_0001.jpg' },
        { name: 'test_0002.png', path: '/tmp/slices/test_0002.png', width: 720, height: 1000, index: 2, thumbnailPath: '/tmp/thumbs/test_0002.jpg' }
      ]

      const html = service.generatePreviewHtml(filesWithThumbnails, sampleDevices, {
        imageGap: 0,
        defaultDeviceId: 'iphone_16'
      })

      // Preview must use original slices for full quality, not thumbnails
      expect(html).toContain('../slices/test_0001.png')
      expect(html).toContain('../slices/test_0002.png')
      expect(html).not.toContain('thumbs')
    })

    it('should handle single device', () => {
      const oneDevice: DevicePreset[] = [
        { id: 'only', name: 'Only Device', cssViewportWidth: 320, cssViewportHeight: 568 }
      ]

      const html = service.generatePreviewHtml(sampleFiles, oneDevice, {
        imageGap: 0,

        defaultDeviceId: 'only'
      })

      expect(html).toContain('Only Device')
      expect(html).toContain('320')
    })

    it('should escape quotes in device IDs', () => {
      const devicesWithQuotes: DevicePreset[] = [
        { id: 'test"id', name: 'Test', cssViewportWidth: 400, cssViewportHeight: 800 }
      ]

      const html = service.generatePreviewHtml(sampleFiles, devicesWithQuotes, {
        imageGap: 0,

        defaultDeviceId: 'test"id'
      })

      // Should escape the quote
      expect(html).toContain('&quot;')
      expect(html).not.toContain('value="test"id"')
    })
  })

  describe('writePreviewFiles', () => {
    it('should write index.html and preview-data.json', () => {
      service.writePreviewFiles(testDir, sampleFiles, sampleDevices, {
        imageGap: 0,

        defaultDeviceId: 'iphone_16'
      })

      expect(existsSync(join(testDir, 'preview', 'index.html'))).toBe(true)
      expect(existsSync(join(testDir, 'preview', 'preview-data.json'))).toBe(true)

      const html = readFileSync(join(testDir, 'preview', 'index.html'), 'utf-8')
      expect(html).toContain('test_0001.png')
    })

    it('should write valid JSON in preview-data.json', () => {
      service.writePreviewFiles(testDir, sampleFiles, sampleDevices, {
        imageGap: 3,
        defaultDeviceId: 'galaxy_s26'
      })

      const raw = readFileSync(join(testDir, 'preview', 'preview-data.json'), 'utf-8')
      const data = JSON.parse(raw)
      expect(data.files).toHaveLength(3)
      expect(data.devices).toHaveLength(2)
      expect(data.settings.imageGap).toBe(3)
    })
  })
})
