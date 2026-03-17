import {mkdirSync} from 'fs'
import {appendFile} from 'fs/promises'
import {join} from 'path'

type LogLevel = 'INFO' | 'WARN' | 'ERROR'

export class Logger {
  private logsDir: string
  private writeChain: Promise<void> = Promise.resolve()

  constructor(baseDir: string) {
    this.logsDir = join(baseDir, 'logs')
    mkdirSync(this.logsDir, { recursive: true })
  }

  updateBaseDir(baseDir: string): void {
    this.logsDir = join(baseDir, 'logs')
    mkdirSync(this.logsDir, { recursive: true })
  }

  private getLogPath(): string {
    const now = new Date()
    const y = now.getFullYear()
    const m = String(now.getMonth() + 1).padStart(2, '0')
    const d = String(now.getDate()).padStart(2, '0')
    return join(this.logsDir, `${y}-${m}-${d}_main.log`)
  }

  private write(level: LogLevel, message: string, extra?: unknown): void {
    const now = new Date().toISOString()
    let line = `[${now}] [${level}] ${message}`
    if (extra !== undefined) {
      const detail = extra instanceof Error
        ? `${extra.message}\n${extra.stack ?? ''}`
        : typeof extra === 'string' ? extra : JSON.stringify(extra)
      line += ` | ${detail}`
    }
    this.writeChain = this.writeChain.then(() =>
      appendFile(this.getLogPath(), line + '\n').catch((err) => {
        console.error('[Logger] Failed to write log:', err)
      })
    )
  }

  async flush(): Promise<void> {
    await this.writeChain
  }

  info(message: string, extra?: unknown): void {
    this.write('INFO', message, extra)
  }

  warn(message: string, extra?: unknown): void {
    this.write('WARN', message, extra)
  }

  error(message: string, extra?: unknown): void {
    this.write('ERROR', message, extra)
  }
}
