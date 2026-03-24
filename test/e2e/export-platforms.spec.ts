import {test as base, expect} from '@playwright/test'
import {type ElectronApplication, type Page} from 'playwright'
import {mkdirSync, mkdtempSync, rmSync} from 'fs'
import {join} from 'path'
import {tmpdir} from 'os'
import {fixturePdfPath, launchElectronApp, mockNextOpenDialogPath} from './fixtures'

let electronApp: ElectronApplication
let page: Page
let testHomeDir: string

base.describe.serial('export platforms', () => {
  base.beforeAll(async () => {
    testHomeDir = mkdtempSync(join(tmpdir(), 'toonshark-e2e-home-'))
    mkdirSync(join(testHomeDir, 'tmp'), { recursive: true })
    const testBaseDir = join(testHomeDir, 'custom-base-dir')

    electronApp = await launchElectronApp(testHomeDir)
    page = await electronApp.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    await page.getByRole('heading', { name: 'ToonShark' }).waitFor({ timeout: 15000 })

    // 공유 setup: PDF 슬라이스 후 내보내기 페이지로 이동
    const pdfPath = fixturePdfPath('auto-slice-3panels.pdf')
    await page.evaluate(async (baseDir) => {
      const current = await window.api.loadSettings()
      await window.api.saveSettings({ ...current, baseDir })
    }, testBaseDir)

    await mockNextOpenDialogPath(electronApp, pdfPath)
    await page.getByRole('button', { name: /^Open PDF$|^PDF 열기$/ }).click()
    await expect(page).toHaveURL(/\/workspace$/)

    await page.getByRole('button', { name: /^Run$|^실행$/ }).click()
    await expect(page.getByRole('button', { name: /^Episode Export$|^에피소드 내보내기$/ }).first()).toBeVisible({ timeout: 20_000 })

    await page.getByRole('button', { name: /^Episode Export$|^에피소드 내보내기$/ }).first().click()
    await expect(page).toHaveURL(/\/job\/.+\/export$/)
  })

  base.afterAll(async () => {
    await electronApp?.close()
    for (let i = 0; i < 5; i++) {
      try { rmSync(testHomeDir, { recursive: true, force: true }); break }
      catch { await new Promise(r => setTimeout(r, 500)) }
    }
  })

  // 내보내기 페이지에 국가/플랫폼 섹션이 올바르게 표시되는지 확인
  base.test('export page shows country and platform sections', async () => {
    await expect(page.getByRole('heading', { name: /^Episode Export$|^에피소드 내보내기$/ })).toBeVisible()

    const checkboxes = page.locator('input[type="checkbox"]')
    const checkboxCount = await checkboxes.count()
    expect(checkboxCount).toBeGreaterThan(0)

    await expect(page.getByRole('columnheader', { name: /^Platform$|^플랫폼$/ })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: /^Width$|^너비$/ })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: /^Format$|^형식$/ })).toBeVisible()
  })

  // 플랫폼 미선택 시 "No platforms selected" 표시
  base.test('export button is disabled when no platforms selected', async () => {
    await expect(page.getByText(/^No platforms selected$|^선택된 플랫폼이 없습니다$/)).toBeVisible()
  })

  // 여러 플랫폼 선택 후 내보내기 실행 및 결과 확인
  base.test('exports to multiple platforms and shows results', async () => {
    const checkboxes = page.locator('tbody input[type="checkbox"]:not([disabled])')
    await checkboxes.first().check()

    const runExportBtn = page.getByRole('button', { name: /^Run Export$|^내보내기 실행$/ })
    await expect(runExportBtn).toBeEnabled({ timeout: 5_000 })
    await runExportBtn.click()

    await expect(page.getByRole('button', { name: /^Open Export Folder$|^내보내기 폴더 열기$/ }).first()).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText(/^Export complete!$|^내보내기 완료!$/)).toBeVisible()
  })

  // 재내보내기 시 이전에 내보낸 플랫폼에 "Exported" 뱃지 표시
  base.test('re-export shows already exported badges', async () => {
    // 뒤로 갔다가 다시 내보내기 페이지 진입
    await page.getByRole('button', { name: /Back|뒤로/ }).click()
    await page.getByRole('button', { name: /^Episode Export$|^에피소드 내보내기$/ }).first().click()
    await expect(page).toHaveURL(/\/job\/.+\/export$/)

    await expect(page.getByText(/Exported|내보내기 완료/).first()).toBeVisible({ timeout: 5_000 })
  })
})
