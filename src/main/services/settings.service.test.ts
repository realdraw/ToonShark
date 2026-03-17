import {afterEach, beforeEach, describe, expect, it} from 'vitest'
import {SettingsService} from './settings.service'
import {existsSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'fs'
import {join, resolve} from 'path'
import {homedir, tmpdir} from 'os'
import type {AppSettings} from '@shared/types'
import {DEFAULT_SETTINGS} from '@shared/constants'

const DEFAULTS_DIR = resolve(__dirname, '..', '..', '..', 'resources', 'defaults')

describe('SettingsService', () => {
  let service: SettingsService
  let testDir: string
  let bootstrapDir: string

  beforeEach(() => {
    testDir = join(tmpdir(), `settings_test_${Date.now()}`)
    bootstrapDir = join(testDir, 'bootstrap')
    mkdirSync(testDir, { recursive: true })
    service = new SettingsService(testDir, DEFAULTS_DIR, bootstrapDir)
  })

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true })
  })

  describe('load', () => {
    it('should return default settings when file does not exist', () => {
      const settings = service.load()

      expect(settings.naming.defaultPrefix).toBe('untitled')
      expect(settings.naming.filenamePadding).toBe(4)
    })

    it('should load saved settings from file', () => {
      const settingsDir = join(testDir, 'settings')
      mkdirSync(settingsDir, { recursive: true })
      const customSettings: AppSettings = {
        ...DEFAULT_SETTINGS,
        baseDir: testDir,

        naming: {
          ...DEFAULT_SETTINGS.naming,
          defaultPrefix: 'custom_prefix'
        }
      }
      writeFileSync(
        join(settingsDir, 'app-settings.json'),
        JSON.stringify(customSettings, null, 2)
      )

      const loaded = service.load()

      expect(loaded.naming.defaultPrefix).toBe('custom_prefix')
    })
  })

  describe('saveAndMigrateBaseDir', () => {
    it('should save settings to file', () => {
      const settings: AppSettings = {
        ...DEFAULT_SETTINGS,
        baseDir: testDir
      }

      service.saveAndMigrateBaseDir(settings)

      const filePath = join(testDir, 'settings', 'app-settings.json')
      expect(existsSync(filePath)).toBe(true)

      const saved = JSON.parse(readFileSync(filePath, 'utf-8'))
      expect(saved.baseDir).toBe(testDir)
    })
  })

  describe('getDevicePresets', () => {
    it('should return default device presets', () => {
      const devices = service.getDevicePresets()
      expect(devices.length).toBe(9)
      expect(devices[0].id).toBe('iphone_16_pro')
      expect(devices[1].id).toBe('iphone_16_pro_max')
    })

    it('should load custom devices if file exists', () => {
      const settingsDir = join(testDir, 'settings')
      mkdirSync(settingsDir, { recursive: true })
      writeFileSync(
        join(settingsDir, 'devices.json'),
        JSON.stringify([
          { id: 'test', name: 'Test', cssViewportWidth: 100, cssViewportHeight: 200 }
        ])
      )

      const devices = service.getDevicePresets()
      expect(devices.length).toBe(1)
      expect(devices[0].id).toBe('test')
    })
  })

  describe('saveDevicePresets', () => {
    it('should save device presets to file and load them back', () => {
      const devices = [
        { id: 'pixel_9', name: 'Pixel 9', cssViewportWidth: 411, cssViewportHeight: 914 },
        { id: 'ipad_pro', name: 'iPad Pro', cssViewportWidth: 1024, cssViewportHeight: 1366 }
      ]

      service.saveDevicePresets(devices)

      const filePath = join(testDir, 'settings', 'devices.json')
      expect(existsSync(filePath)).toBe(true)

      const loaded = service.getDevicePresets()
      expect(loaded.length).toBe(2)
      expect(loaded[0].id).toBe('pixel_9')
      expect(loaded[0].cssViewportWidth).toBe(411)
      expect(loaded[1].id).toBe('ipad_pro')
      expect(loaded[1].cssViewportHeight).toBe(1366)
    })
  })

  describe('ensureBaseStructure', () => {
    it('should create base directory structure', () => {
      service.ensureBaseStructure()
      expect(existsSync(join(testDir, 'settings'))).toBe(true)
      expect(existsSync(join(testDir, 'jobs'))).toBe(true)
      expect(existsSync(join(testDir, 'cache', 'thumbnails'))).toBe(true)
      expect(existsSync(join(testDir, 'logs'))).toBe(true)
    })

    it('should be idempotent (safe to call multiple times)', () => {
      service.ensureBaseStructure()
      service.ensureBaseStructure()
      expect(existsSync(join(testDir, 'settings'))).toBe(true)
    })
  })

  describe('load — edge cases', () => {
    it('should return defaults when settings file contains invalid JSON', () => {
      const settingsDir = join(testDir, 'settings')
      mkdirSync(settingsDir, { recursive: true })
      writeFileSync(join(settingsDir, 'app-settings.json'), '{ broken json')

      const settings = service.load()

      expect(settings.naming.defaultPrefix).toBe('untitled')
    })

    it('should deep merge partial settings — preserving nested defaults', () => {
      const settingsDir = join(testDir, 'settings')
      mkdirSync(settingsDir, { recursive: true })
      // Only override one field in naming, rest should come from defaults
      writeFileSync(
        join(settingsDir, 'app-settings.json'),
        JSON.stringify({ naming: { defaultPrefix: 'custom' } })
      )

      const loaded = service.load()
      expect(loaded.naming.defaultPrefix).toBe('custom')
      expect(loaded.naming.filenamePadding).toBe(DEFAULT_SETTINGS.naming.filenamePadding)
    })

    it('should deep merge partial autoSlice settings', () => {
      const settingsDir = join(testDir, 'settings')
      mkdirSync(settingsDir, { recursive: true })
      writeFileSync(
        join(settingsDir, 'app-settings.json'),
        JSON.stringify({ autoSlice: { whiteThreshold: 240 } })
      )

      const loaded = service.load()
      expect(loaded.autoSlice.whiteThreshold).toBe(240)
      expect(loaded.autoSlice.minWhiteRun).toBe(DEFAULT_SETTINGS.autoSlice.minWhiteRun)
      expect(loaded.autoSlice.minSliceHeight).toBe(DEFAULT_SETTINGS.autoSlice.minSliceHeight)
    })

    it('should deep merge partial export settings', () => {
      const settingsDir = join(testDir, 'settings')
      mkdirSync(settingsDir, { recursive: true })
      writeFileSync(
        join(settingsDir, 'app-settings.json'),
        JSON.stringify({ export: { jpgQuality: 75 } })
      )

      const loaded = service.load()
      expect(loaded.export.jpgQuality).toBe(75)
    })

    it('should use default export settings when export section is missing', () => {
      const settingsDir = join(testDir, 'settings')
      mkdirSync(settingsDir, { recursive: true })
      // Old settings file without export section
      writeFileSync(
        join(settingsDir, 'app-settings.json'),
        JSON.stringify({ naming: { defaultPrefix: 'old' } })
      )

      const loaded = service.load()
      expect(loaded.export.jpgQuality).toBe(DEFAULT_SETTINGS.export.jpgQuality)
    })

    it('should deep merge partial preview settings', () => {
      const settingsDir = join(testDir, 'settings')
      mkdirSync(settingsDir, { recursive: true })
      writeFileSync(
        join(settingsDir, 'app-settings.json'),
        JSON.stringify({ preview: { imageGap: 10 } })
      )

      const loaded = service.load()
      expect(loaded.preview.imageGap).toBe(10)
    })

    it('should return empty file as default settings', () => {
      const settingsDir = join(testDir, 'settings')
      mkdirSync(settingsDir, { recursive: true })
      writeFileSync(join(settingsDir, 'app-settings.json'), '')

      const settings = service.load()
      // Empty string triggers JSON.parse error → returns defaults

    })
  })

  describe('getDevicePresets — edge cases', () => {
    it('should return defaults when devices file contains invalid JSON', () => {
      const settingsDir = join(testDir, 'settings')
      mkdirSync(settingsDir, { recursive: true })
      writeFileSync(join(settingsDir, 'devices.json'), 'not json')

      const devices = service.getDevicePresets()
      expect(devices.length).toBe(9)
      expect(devices[0].id).toBe('iphone_16_pro')
    })
  })

  describe('saveAndMigrateBaseDir — same baseDir', () => {
    it('should create settings directory if it does not exist', () => {
      const settings: AppSettings = {
        ...DEFAULT_SETTINGS,
        baseDir: testDir
      }

      service.saveAndMigrateBaseDir(settings)

      expect(existsSync(join(testDir, 'settings', 'app-settings.json'))).toBe(true)
    })

    it('should overwrite existing settings file', () => {
      const settings1: AppSettings = { ...DEFAULT_SETTINGS, baseDir: testDir }
      const settings2: AppSettings = { ...DEFAULT_SETTINGS, baseDir: testDir, naming: { ...DEFAULT_SETTINGS.naming, defaultPrefix: 'updated' } }

      service.saveAndMigrateBaseDir(settings1)
      service.saveAndMigrateBaseDir(settings2)

      const loaded = service.load()
      expect(loaded.naming.defaultPrefix).toBe('updated')
    })
  })

  describe('saveAndMigrateBaseDir — baseDir change', () => {
    it('should write settings into the new baseDir and survive restart', () => {
      const nextBaseDir = join(testDir, 'migrated-data')
      const settings: AppSettings = {
        ...DEFAULT_SETTINGS,
        baseDir: nextBaseDir,
        naming: {
          ...DEFAULT_SETTINGS.naming,
          defaultPrefix: 'migrated_prefix'
        }
      }

      const result = service.saveAndMigrateBaseDir(settings)

      expect(result.baseDirChanged).toBe(true)
      expect(existsSync(join(nextBaseDir, 'settings', 'app-settings.json'))).toBe(true)
      expect(existsSync(join(testDir, 'settings', 'app-settings.json'))).toBe(false)

      const restarted = new SettingsService(nextBaseDir, DEFAULTS_DIR, bootstrapDir)
      const loaded = restarted.load()
      expect(loaded.baseDir).toBe(nextBaseDir)
      expect(loaded.naming.defaultPrefix).toBe('migrated_prefix')
    })

    it('should persist a bootstrap pointer so cold start resolves the migrated baseDir', () => {
      const nextBaseDir = join(testDir, 'cold-start-home')
      service.saveAndMigrateBaseDir({
        ...DEFAULT_SETTINGS,
        baseDir: nextBaseDir,
        locale: 'ko'
      })

      const coldStarted = new SettingsService(undefined, DEFAULTS_DIR, bootstrapDir)
      const loaded = coldStarted.load()
      expect(loaded.baseDir).toBe(nextBaseDir)
      expect(loaded.locale).toBe('ko')
    })

    it('should expose the built-in default baseDir', () => {
      expect(service.getDefaultBaseDir()).toBe(join(homedir(), 'toonshark_data'))
    })

    it('should migrate custom device presets into the new baseDir', () => {
      const devices = [
        { id: 'custom_phone', name: 'Custom Phone', cssViewportWidth: 480, cssViewportHeight: 960 }
      ]
      service.saveDevicePresets(devices)

      const nextBaseDir = join(testDir, 'new-home')
      service.saveAndMigrateBaseDir({
        ...DEFAULT_SETTINGS,
        baseDir: nextBaseDir
      })

      const restarted = new SettingsService(nextBaseDir, DEFAULTS_DIR, bootstrapDir)
      expect(restarted.getDevicePresets()).toEqual(devices)
      expect(existsSync(join(nextBaseDir, 'settings', 'devices.json'))).toBe(true)
    })
  })
})
