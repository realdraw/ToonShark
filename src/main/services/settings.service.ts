import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'fs'
import {join} from 'path'
import {homedir} from 'os'
import type {AppSettings, Country, DevicePreset} from '@shared/types'

import {DEFAULT_SETTINGS} from '@shared/constants'
import type {Logger} from './logger.service'

const DEFAULT_BASE_DIR = join(process.env.TOONSHARK_HOME || homedir(), 'toonshark_data')
function resolveDefaultsDir(): string {
  // Production: process.resourcesPath/defaults/
  // Development: project root resources/defaults/
  if (process.resourcesPath) {
    const prodPath = join(process.resourcesPath, 'defaults')
    if (existsSync(prodPath)) return prodPath
  }
  // Fallback: relative to this file's location (works in dev)
  const devPath = join(__dirname, '..', '..', '..', 'resources', 'defaults')
  if (existsSync(devPath)) return devPath
  // Last resort: cwd-based
  return join(process.cwd(), 'resources', 'defaults')
}

export class SettingsService {
  private baseDir: string
  private logger: Logger | null = null
  private defaultsDir: string
  private bootstrapDir: string

  constructor(baseDir?: string, defaultsDir?: string, bootstrapDir?: string) {
    this.bootstrapDir = bootstrapDir || join(DEFAULT_BASE_DIR, 'settings')
    this.baseDir = baseDir || this.resolveInitialBaseDir()
    this.defaultsDir = defaultsDir || resolveDefaultsDir()
  }

  setLogger(logger: Logger): void {
    this.logger = logger
  }

  getDefaultBaseDir(): string {
    return DEFAULT_BASE_DIR
  }

  private resolveInitialBaseDir(): string {
    try {
      const bootstrapFile = join(this.bootstrapDir, 'base-dir.json')
      if (!existsSync(bootstrapFile)) return DEFAULT_BASE_DIR
      const raw = readFileSync(bootstrapFile, 'utf-8')
      const parsed = JSON.parse(raw) as { baseDir?: unknown }
      return typeof parsed.baseDir === 'string' && parsed.baseDir ? parsed.baseDir : DEFAULT_BASE_DIR
    } catch {
      return DEFAULT_BASE_DIR
    }
  }

  private writeBootstrap(baseDir: string): void {
    const bootstrapFile = join(this.bootstrapDir, 'base-dir.json')
    mkdirSync(this.bootstrapDir, { recursive: true })
    writeFileSync(bootstrapFile, JSON.stringify({ baseDir }, null, 2))
  }

  private settingsDirFor(baseDir: string): string {
    return join(baseDir, 'settings')
  }

  private settingsFilePathFor(baseDir: string): string {
    return join(this.settingsDirFor(baseDir), 'app-settings.json')
  }

  private devicesFilePathFor(baseDir: string): string {
    return join(this.settingsDirFor(baseDir), 'devices.json')
  }

  private get settingsDir(): string {
    return this.settingsDirFor(this.baseDir)
  }

  private get settingsFilePath(): string {
    return this.settingsFilePathFor(this.baseDir)
  }

  private get devicesFilePath(): string {
    return this.devicesFilePathFor(this.baseDir)
  }

  private ensureSettingsDir(baseDir: string = this.baseDir): void {
    mkdirSync(this.settingsDirFor(baseDir), { recursive: true })
  }

  load(): AppSettings {
    if (!existsSync(this.settingsFilePath)) {
      return { ...DEFAULT_SETTINGS, baseDir: this.baseDir }
    }

    try {
      const raw = readFileSync(this.settingsFilePath, 'utf-8')
      const parsed = JSON.parse(raw) as Partial<AppSettings>
      return {
        ...DEFAULT_SETTINGS,
        ...parsed,
        baseDir: parsed.baseDir || this.baseDir,
        naming: { ...DEFAULT_SETTINGS.naming, ...parsed.naming },
        autoSlice: { ...DEFAULT_SETTINGS.autoSlice, ...parsed.autoSlice },
        export: { ...DEFAULT_SETTINGS.export, ...parsed.export },
        preview: { ...DEFAULT_SETTINGS.preview, ...parsed.preview }
      }
    } catch (err) {
      this.logger?.error('Failed to load settings', err)
      return { ...DEFAULT_SETTINGS, baseDir: this.baseDir }
    }
  }

  saveAndMigrateBaseDir(settings: AppSettings): { previousBaseDir: string; currentBaseDir: string; baseDirChanged: boolean } {
    const previousBaseDir = this.baseDir
    const targetBaseDir = settings.baseDir || this.baseDir
    const baseDirChanged = targetBaseDir !== previousBaseDir

    const currentDevices = this.getDevicePresets()
    const hadCustomDevices = existsSync(this.devicesFilePath)

    this.ensureBaseStructure(targetBaseDir)
    writeFileSync(this.settingsFilePathFor(targetBaseDir), JSON.stringify(settings, null, 2))

    if (hadCustomDevices) {
      writeFileSync(this.devicesFilePathFor(targetBaseDir), JSON.stringify(currentDevices, null, 2))
    }

    this.writeBootstrap(targetBaseDir)
    this.baseDir = targetBaseDir

    return { previousBaseDir, currentBaseDir: targetBaseDir, baseDirChanged }
  }

  getDefaultDevicePresets(): DevicePreset[] {
    try {
      const raw = readFileSync(join(this.defaultsDir, 'devices.json'), 'utf-8')
      return JSON.parse(raw) as DevicePreset[]
    } catch (err) {
      this.logger?.error('Failed to load default device presets', err)
      return []
    }
  }

  private getDefaultCountryPresets(): Country[] {
    try {
      const raw = readFileSync(join(this.defaultsDir, 'countries.json'), 'utf-8')
      return JSON.parse(raw) as Country[]
    } catch (err) {
      this.logger?.error('Failed to load default country presets', err)
      return []
    }
  }

  getDevicePresets(): DevicePreset[] {
    if (!existsSync(this.devicesFilePath)) {
      return this.getDefaultDevicePresets()
    }

    try {
      const raw = readFileSync(this.devicesFilePath, 'utf-8')
      return JSON.parse(raw) as DevicePreset[]
    } catch (err) {
      this.logger?.error('Failed to load device presets', err)
      return this.getDefaultDevicePresets()
    }
  }

  saveDevicePresets(devices: DevicePreset[]): void {
    this.ensureSettingsDir()
    writeFileSync(this.devicesFilePath, JSON.stringify(devices, null, 2))
  }

  getCountryPresets(): Country[] {
    return this.getDefaultCountryPresets()
  }

  ensureBaseStructure(baseDir: string = this.baseDir): void {
    const dirs = [
      this.settingsDirFor(baseDir),
      join(baseDir, 'jobs'),
      join(baseDir, 'cache', 'thumbnails'),
      join(baseDir, 'logs')
    ]
    for (const dir of dirs) {
      mkdirSync(dir, { recursive: true })
    }
  }
}
