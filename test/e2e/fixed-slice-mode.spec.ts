import {test as base, expect} from '@playwright/test'
import {type ElectronApplication, type Page} from 'playwright'
import {mkdirSync, mkdtempSync, rmSync} from 'fs'
import {join} from 'path'
import {tmpdir} from 'os'
import {fixturePdfPath, launchElectronApp, mockNextOpenDialogPath} from './fixtures'

let electronApp: ElectronApplication
let page: Page
let testHomeDir: string

base.describe.serial('fixed slice mode', () => {
  base.beforeAll(async () => {
    testHomeDir = mkdtempSync(join(tmpdir(), 'toonshark-e2e-home-'))
    mkdirSync(join(testHomeDir, 'tmp'), { recursive: true })
    const testBaseDir = join(testHomeDir, 'custom-base-dir')

    electronApp = await launchElectronApp(testHomeDir)
    page = await electronApp.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    await page.getByRole('heading', { name: 'ToonShark' }).waitFor({ timeout: 15000 })

    // 공유 setup: PDF 열기
    const pdfPath = fixturePdfPath('simple-2page.pdf')
    await page.evaluate(async (baseDir) => {
      const current = await window.api.loadSettings()
      await window.api.saveSettings({ ...current, baseDir })
    }, testBaseDir)

    await mockNextOpenDialogPath(electronApp, pdfPath)
    await page.getByRole('button', { name: /^Open File$|^파일 열기$/ }).click()
    await expect(page).toHaveURL(/\/workspace$/)
  })

  base.afterAll(async () => {
    try {
      const pid = electronApp?.process()?.pid
      await Promise.race([
        electronApp?.close(),
        new Promise(resolve => setTimeout(resolve, 5000))
      ])
      // Force kill if still alive
      if (pid) try { process.kill(pid, 'SIGKILL') } catch {}
    } catch {}
    for (let i = 0; i < 5; i++) {
      try { rmSync(testHomeDir, { recursive: true, force: true }); break }
      catch { await new Promise(r => setTimeout(r, 500)) }
    }
  })

  // Fixed 모드 슬라이스 실행 — 커스텀 높이 지정
  base.test('runs a fixed mode slice job with custom height', async () => {
    await page.getByRole('button', { name: /^Fixed$|^고정$/ }).click()

    const heightInput = page.locator('label').filter({ hasText: /Slice Height|슬라이스 높이/ }).locator('../..').locator('input[type="number"]')
    await heightInput.fill('500')

    await page.getByRole('button', { name: /^Run$|^실행$/ }).click()
    await expect(page.getByRole('button', { name: /^Detail$|^상세$/ }).first()).toBeVisible({ timeout: 20_000 })

    await page.getByRole('button', { name: /^Detail$|^상세$/ }).first().click()
    await expect(page).toHaveURL(/\/job\//)
    await expect(page.getByText(/^Fixed interval$|^고정 간격$/)).toBeVisible()

    // 워크스페이스로 복귀
    await page.goBack()
    await expect(page).toHaveURL(/\/workspace$/)
  })

  // Fixed 모드 슬라이스 — 시작 오프셋 지정
  base.test('runs a fixed mode slice with start offset', async () => {
    await page.getByRole('button', { name: /^Fixed$|^고정$/ }).click()

    const heightInput = page.locator('label').filter({ hasText: /Slice Height|슬라이스 높이/ }).locator('../..').locator('input[type="number"]')
    await heightInput.fill('500')

    const offsetInput = page.locator('label').filter({ hasText: /Start Offset|시작 오프셋/ }).locator('../..').locator('input[type="number"]')
    await offsetInput.fill('100')

    await page.getByRole('button', { name: /^Run$|^실행$/ }).click()
    await expect(page.getByRole('button', { name: /^Detail$|^상세$/ }).first()).toBeVisible({ timeout: 20_000 })
  })
})
