import {afterEach, beforeEach, describe, expect, it} from 'vitest'
import {FileService} from './file.service'
import {existsSync, mkdirSync, rmSync} from 'fs'
import {dirname, join} from 'path'
import {tmpdir} from 'os'

describe('FileService', () => {
  let service: FileService
  let testDir: string

  beforeEach(() => {
    testDir = join(tmpdir(), `webtoon_test_${Date.now()}`)
    mkdirSync(testDir, { recursive: true })
    service = new FileService()
  })

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true })
  })

  describe('sanitizePrefix', () => {
    it('should replace whitespace with underscore', () => {
      expect(service.sanitizePrefix('black apple')).toBe('black_apple')
    })

    it('should remove invalid characters', () => {
      expect(service.sanitizePrefix('black@apple!')).toBe('blackapple')
    })

    it('should keep valid characters', () => {
      expect(service.sanitizePrefix('black_apple-01')).toBe('black_apple-01')
    })

    it('should keep Korean characters', () => {
      expect(service.sanitizePrefix('검은사과')).toBe('검은사과')
    })

    it('should handle mixed Korean and English', () => {
      expect(service.sanitizePrefix('검은 사과 ep01')).toBe('검은_사과_ep01')
    })

    it('should keep CJK characters', () => {
      expect(service.sanitizePrefix('黒いリンゴ')).toBe('黒いリンゴ')
    })

    it('should handle empty string', () => {
      expect(service.sanitizePrefix('')).toBe('untitled')
    })

    it('should trim and collapse multiple underscores', () => {
      expect(service.sanitizePrefix('  black   apple  ')).toBe('black_apple')
    })

    it('should return untitled for all-whitespace input', () => {
      expect(service.sanitizePrefix('   ')).toBe('untitled')
    })

    it('should return untitled for all-special-chars input', () => {
      expect(service.sanitizePrefix('!!!@@@###')).toBe('untitled')
    })

    it('should handle dashes correctly', () => {
      expect(service.sanitizePrefix('my-comic-01')).toBe('my-comic-01')
    })

    it('should remove leading/trailing underscores after sanitization', () => {
      expect(service.sanitizePrefix('_test_')).toBe('test')
    })

    it('should handle emoji as invalid characters', () => {
      const result = service.sanitizePrefix('comic 🎨 art')
      expect(result).toBe('comic_art')
    })
  })

  describe('createVersionFolder', () => {
    it('should create version folder with timestamp format', () => {
      const versionPath = service.createVersionFolder(testDir, 'black_apple')
      expect(existsSync(versionPath)).toBe(true)
      expect(versionPath).toMatch(/black_apple[/\\]v\d{8}_\d{6}_\d{3}$/)
    })

    it('should create all subdirectories', () => {
      const versionPath = service.createVersionFolder(testDir, 'test_job')
      const jobDir = dirname(versionPath)
      // source/ is at job level (shared across versions)
      expect(existsSync(join(jobDir, 'source'))).toBe(true)
      expect(existsSync(join(versionPath, 'rendered'))).toBe(true)
      expect(existsSync(join(versionPath, 'slices'))).toBe(true)
      expect(existsSync(join(versionPath, 'preview'))).toBe(true)
    })
  })

  describe('generateVersionId', () => {
    it('should return string matching vYYYYMMDD_HHMMSS_mmm format', () => {
      const id = service.generateVersionId()
      expect(id).toMatch(/^v\d{8}_\d{6}_\d{3}$/)
    })

    it('should generate different IDs when called at different times', async () => {
      const id1 = service.generateVersionId()
      await new Promise((r) => setTimeout(r, 10))
      const id2 = service.generateVersionId()
      expect(id1).not.toBe(id2)
    })
  })

  describe('createVersionFolder', () => {
    it('should handle Korean job names', () => {
      const versionPath = service.createVersionFolder(testDir, '웹툰_1화')
      expect(existsSync(versionPath)).toBe(true)
      const jobDir = dirname(versionPath)
      expect(existsSync(join(jobDir, 'source'))).toBe(true)
    })

    it('should create nested base directory if not exists', () => {
      const deepDir = join(testDir, 'deep', 'nested', 'base')
      const versionPath = service.createVersionFolder(deepDir, 'job')
      expect(existsSync(versionPath)).toBe(true)
    })
  })
})
