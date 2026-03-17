import {app, BrowserWindow, dialog, Menu, net, protocol} from 'electron'
import {join, normalize, resolve, sep} from 'path'
import {pathToFileURL} from 'url'
import {SettingsService} from './services/settings.service'
import {FileService} from './services/file.service'
import {SliceService} from './services/slice.service'
import {PdfService} from './services/pdf.service'
import {PreviewService} from './services/preview.service'
import {JobRepository} from './services/job-repository'
import {JobExecutionService} from './services/job-execution.service'
import {ExportService} from './services/export.service'
import {Logger} from './services/logger.service'
import {type IpcState, registerIpcHandlers} from './ipc/handlers'

let mainWindow: BrowserWindow | null = null
let ipcState: IpcState | null = null
let settingsServiceRef: SettingsService | null = null
let loggerRef: Logger | null = null

function createWindow() {
  mainWindow = new BrowserWindow({
    title: 'ToonShark',
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.webContents.on('will-navigate', (event) => {
    event.preventDefault()
  })

  mainWindow.on('close', (event) => {
    if (ipcState?.isJobRunning()) {
      event.preventDefault()
      const isKo = settingsServiceRef?.load().locale === 'ko'
      dialog.showMessageBox(mainWindow!, {
        type: 'warning',
        buttons: [isKo ? '취소' : 'Cancel', isKo ? '종료' : 'Quit'],
        defaultId: 0,
        cancelId: 0,
        title: isKo ? '작업 진행 중' : 'Job in Progress',
        message: isKo
          ? '슬라이스 작업이 아직 실행 중입니다. 종료하시겠습니까?'
          : 'A slicing job is still running. Are you sure you want to quit?'
      }).then(({ response }) => {
        if (response === 1) {
          mainWindow?.destroy()
        }
      })
    }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.webContents.on('before-input-event', (_event, input) => {
      const mod = process.platform === 'darwin' ? input.meta : input.control
      if (input.key === 'F12' || (mod && input.shift && input.key.toLowerCase() === 'i')) {
        mainWindow?.webContents.toggleDevTools()
      }
    })
  }
}

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'local-file',
    privileges: { stream: true, supportFetchAPI: true }
  }
])

app.whenReady().then(() => {
  Menu.setApplicationMenu(null)

  const settingsService = new SettingsService()
  settingsServiceRef = settingsService
  const settings = settingsService.load()
  settingsService.ensureBaseStructure()

  const logger = new Logger(settings.baseDir)
  loggerRef = logger
  settingsService.setLogger(logger)
  logger.info('App started', { version: app.getVersion(), platform: process.platform })

  // Register protocol to serve local files — restrict to baseDir (read dynamically)
  protocol.handle('local-file', (request) => {
    const currentBaseDir = normalize(resolve(settingsService.load().baseDir))
    const url = new URL(request.url)
    const decoded = decodeURIComponent(url.pathname)
    // Windows: /C:/path → C:/path, macOS/Linux: /Users/path → keep as-is
    const filePath = normalize(resolve(process.platform === 'win32' ? decoded.replace(/^\//, '') : decoded))
    if (filePath !== currentBaseDir && !filePath.startsWith(currentBaseDir + sep)) {
      logger.warn('Blocked local-file request outside baseDir', { url: request.url, filePath })
      return new Response('Forbidden', { status: 403 })
    }
    return net.fetch(pathToFileURL(filePath).href)
  })

  const fileService = new FileService()
  const sliceService = new SliceService()
  const pdfService = new PdfService()
  const previewService = new PreviewService()
  const jobRepository = new JobRepository(settings.baseDir, fileService, logger)
  const jobExecutionService = new JobExecutionService(
    settingsService, fileService, sliceService, pdfService, previewService, jobRepository
  )
  const exportService = new ExportService(settingsService, jobRepository, logger)

  ipcState = registerIpcHandlers({
    settingsService,
    previewService,
    jobRepository,
    jobExecutionService,
    exportService,
    pdfService,
    logger,
    getMainWindow: () => mainWindow
  })

  process.on('uncaughtException', (err) => {
    logger.error('Uncaught exception', err)
  })

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled rejection', reason instanceof Error ? reason : String(reason))
  })

  createWindow()
})

app.on('window-all-closed', () => {
  app.quit()
})

app.on('will-quit', async (event) => {
  if (loggerRef) {
    event.preventDefault()
    loggerRef.info('App shutting down')
    await loggerRef.flush()
    app.exit()
  }
})
