import {afterEach, beforeEach, describe, expect, it} from 'vitest'
import {Logger} from './logger.service'
import {mkdirSync, readdirSync, readFileSync, rmSync} from 'fs'
import {join} from 'path'
import {tmpdir} from 'os'

describe('Logger', () => {
  let testDir: string
  let logger: Logger

  beforeEach(() => {
    testDir = join(tmpdir(), `logger_test_${Date.now()}`)
    mkdirSync(testDir, { recursive: true })
    logger = new Logger(testDir)
  })

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true })
  })

  function readLog(): string {
    const logsDir = join(testDir, 'logs')
    const files = readdirSync(logsDir).filter((f) => f.endsWith('_main.log'))
    expect(files.length).toBe(1)
    return readFileSync(join(logsDir, files[0]), 'utf-8')
  }

  it('should create logs directory', () => {
    const logsDir = join(testDir, 'logs')
    const files = readdirSync(logsDir)
    expect(files).toBeDefined()
  })

  it('should create log file with YYYY-MM-DD_main.log format', async () => {
    logger.info('test')
    await logger.flush()
    const logsDir = join(testDir, 'logs')
    const files = readdirSync(logsDir)
    expect(files.length).toBe(1)
    expect(files[0]).toMatch(/^\d{4}-\d{2}-\d{2}_main\.log$/)
  })

  it('should write INFO level log', async () => {
    logger.info('app started')
    await logger.flush()
    const content = readLog()
    expect(content).toContain('[INFO]')
    expect(content).toContain('app started')
  })

  it('should write WARN level log', async () => {
    logger.warn('something fishy')
    await logger.flush()
    const content = readLog()
    expect(content).toContain('[WARN]')
    expect(content).toContain('something fishy')
  })

  it('should write ERROR level log', async () => {
    logger.error('something broke')
    await logger.flush()
    const content = readLog()
    expect(content).toContain('[ERROR]')
    expect(content).toContain('something broke')
  })

  it('should include ISO timestamp', async () => {
    logger.info('timestamp test')
    await logger.flush()
    const content = readLog()
    expect(content).toMatch(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
  })

  it('should append string extra', async () => {
    logger.info('with detail', 'extra info')
    await logger.flush()
    const content = readLog()
    expect(content).toContain('with detail')
    expect(content).toContain('extra info')
  })

  it('should append object extra as JSON', async () => {
    logger.info('with object', { jobId: 'abc', slices: 5 })
    await logger.flush()
    const content = readLog()
    expect(content).toContain('"jobId":"abc"')
    expect(content).toContain('"slices":5')
  })

  it('should append Error with message and stack', async () => {
    const err = new Error('test error')
    logger.error('caught error', err)
    await logger.flush()
    const content = readLog()
    expect(content).toContain('test error')
    expect(content).toContain('Error: test error')
  })

  it('should append multiple log lines', async () => {
    logger.info('first')
    logger.warn('second')
    logger.error('third')
    await logger.flush()
    const content = readLog()
    const lines = content.trim().split('\n')
    expect(lines.length).toBe(3)
    expect(lines[0]).toContain('[INFO]')
    expect(lines[1]).toContain('[WARN]')
    expect(lines[2]).toContain('[ERROR]')
  })

  it('should not throw when extra is undefined', async () => {
    expect(() => logger.info('no extra')).not.toThrow()
    await logger.flush()
    const content = readLog()
    expect(content).not.toContain('|')
  })
})
