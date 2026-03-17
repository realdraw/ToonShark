import {mkdirSync, mkdtempSync, rmSync} from 'fs'
import {join} from 'path'
import {tmpdir} from 'os'
import {expect, test as base} from '@playwright/test'
import {_electron as electron, type ElectronApplication, type Page} from 'playwright'

type E2EFixtures = {
  electronApp: ElectronApplication
  page: Page
  testHomeDir: string
  testBaseDir: string
}

export async function launchElectronApp(testHomeDir: string): Promise<ElectronApplication> {
  // Windows: USERPROFILE을 바꾸면 Electron이 APPDATA를 못 찾아서 크래시함
  // 대신 TOONSHARK_HOME을 사용하여 앱 데이터만 격리
  return electron.launch({
    args: [join(process.cwd(), 'dist-electron/main/index.js')],
    env: {
      ...process.env,
      HOME: testHomeDir,
      TOONSHARK_HOME: testHomeDir,
      TMPDIR: join(testHomeDir, 'tmp'),
      TEMP: join(testHomeDir, 'tmp'),
      TMP: join(testHomeDir, 'tmp')
    }
  })
}

export function fixturePdfPath(name: string): string {
  return join(process.cwd(), 'test', 'fixtures', 'pdfs', name)
}

export async function mockNextOpenDialogPath(electronApp: ElectronApplication, filePath: string): Promise<void> {
  await electronApp.evaluate(async ({ dialog }, targetPath) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [targetPath]
    })
  }, filePath)
}

export const test = base.extend<E2EFixtures>({
  testHomeDir: async ({}, use) => {
    const testHomeDir = mkdtempSync(join(tmpdir(), 'toonshark-e2e-home-'))
    mkdirSync(join(testHomeDir, 'tmp'), { recursive: true })
    try {
      await use(testHomeDir)
    } finally {
      // Windows: files may still be locked briefly after Electron closes
      for (let i = 0; i < 5; i++) {
        try {
          rmSync(testHomeDir, { recursive: true, force: true })
          break
        } catch {
          await new Promise((r) => setTimeout(r, 500))
        }
      }
    }
  },

  testBaseDir: async ({ testHomeDir }, use) => {
    const testBaseDir = join(testHomeDir, 'custom-base-dir')
    await use(testBaseDir)
  },

  electronApp: async ({ testHomeDir }, use) => {
    const electronApp = await launchElectronApp(testHomeDir)

    try {
      await use(electronApp)
    } finally {
      await electronApp.close()
    }
  },

  page: async ({ electronApp }, use) => {
    const page = await electronApp.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    // Wait for the app to fully render before handing page to tests
    await page.getByRole('heading', { name: 'ToonShark' }).waitFor({ timeout: 15000 })
    await use(page)
  }
})

export { expect }
