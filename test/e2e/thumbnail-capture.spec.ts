import {existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync} from 'fs'
import {join} from 'path'
import {tmpdir} from 'os'
import {test as base, expect} from '@playwright/test'
import {type ElectronApplication, type Page} from 'playwright'
import {fixturePdfPath, launchElectronApp, mockNextOpenDialogPath} from './fixtures'

let electronApp: ElectronApplication
let page: Page
let testHomeDir: string
let testBaseDir: string

base.describe.serial('thumbnail capture', () => {
  base.beforeAll(async () => {
    testHomeDir = mkdtempSync(join(tmpdir(), 'toonshark-e2e-home-'))
    mkdirSync(join(testHomeDir, 'tmp'), { recursive: true })
    testBaseDir = join(testHomeDir, 'custom-base-dir')

    electronApp = await launchElectronApp(testHomeDir)
    page = await electronApp.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    await page.getByRole('heading', { name: 'ToonShark' }).waitFor({ timeout: 15000 })

    // 공유 setup: PDF 슬라이스 후 슬라이스 상세 페이지로 이동
    const pdfPath = fixturePdfPath('auto-slice-3panels.pdf')
    await page.evaluate(async (baseDir) => {
      const current = await window.api.loadSettings()
      await window.api.saveSettings({ ...current, baseDir })
    }, testBaseDir)

    await mockNextOpenDialogPath(electronApp, pdfPath)
    await page.getByRole('button', { name: /^Open PDF$|^PDF 열기$/ }).click()
    await expect(page).toHaveURL(/\/workspace$/)

    await page.getByRole('button', { name: /^Run$|^실행$/ }).click()
    await expect(page.getByRole('button', { name: /^Detail$|^상세$/ }).first()).toBeVisible({ timeout: 20_000 })

    await page.getByRole('button', { name: /^Detail$|^상세$/ }).first().click()
    await expect(page).toHaveURL(/\/job\//)

    const firstSlice = page.locator('button').filter({ has: page.locator('img') }).first()
    await firstSlice.click()
    await expect(page).toHaveURL(/\/slice\?index=/)
  })

  base.afterAll(async () => {
    await electronApp?.close()
    for (let i = 0; i < 5; i++) {
      try { rmSync(testHomeDir, { recursive: true, force: true }); break }
      catch { await new Promise(r => setTimeout(r, 500)) }
    }
  })

  base.test('slice detail page shows Thumbnail button', async () => {
    await expect(page.getByRole('button', { name: /^Thumbnail$|^썸네일$/ })).toBeVisible()
  })

  base.test('thumbnail button shows platform dropdown', async () => {
    await page.getByRole('button', { name: /^Thumbnail$|^썸네일$/ }).click()
    await expect(page.getByText('360x522')).toBeVisible({ timeout: 3000 })
  })

  base.test('captures thumbnail and shows folder button that persists after navigation', async () => {
    // Wait for image to load
    const img = page.locator('.relative.inline-block img')
    await expect(img).toBeVisible({ timeout: 5000 })

    // Click Thumbnail → pick platform (dropdown may already be open from previous test)
    const dropdownText = page.getByText('360x522')
    if (!(await dropdownText.isVisible().catch(() => false))) {
      await page.getByRole('button', { name: /^Thumbnail$|^썸네일$/ }).click()
      await expect(dropdownText).toBeVisible({ timeout: 3000 })
    }

    const platformButton = page.locator('button').filter({ hasText: '360x522' }).first()
    await platformButton.click()

    await expect(page.getByRole('button', { name: /^Save$|^저장$/ })).toBeVisible({ timeout: 3000 })
    await expect(page.getByRole('button', { name: /^Cancel$|^취소$/ })).toBeVisible()

    await page.getByRole('button', { name: /^Save$|^저장$/ }).click()

    await expect(page.getByText(/^Thumbnail saved$|^썸네일 저장 완료$/)).toBeVisible({ timeout: 5000 })
    await expect(page.locator('button[title="Open Folder"], button[title="폴더 열기"]')).toBeVisible()

    // Verify thumbnail file was created on disk
    const thumbnailFiles = findThumbnailFiles(testBaseDir)
    expect(thumbnailFiles.length).toBeGreaterThan(0)

    // Navigate back to job detail and return — folder button should persist
    await page.getByRole('button', { name: /Back|뒤로/ }).click()
    await expect(page).toHaveURL(/\/job\/[^/]+$/)

    const firstSlice = page.locator('button').filter({ has: page.locator('img') }).first()
    await firstSlice.click()
    await expect(page).toHaveURL(/\/slice\?index=/)

    await expect(page.locator('button[title="Open Folder"], button[title="폴더 열기"]')).toBeVisible({ timeout: 5000 })
  })
})

function findThumbnailFiles(baseDir: string): string[] {
  const results: string[] = []
  const jobsDir = join(baseDir, 'jobs')
  if (!existsSync(jobsDir)) return results

  for (const jobFolder of readdirSync(jobsDir)) {
    const jobPath = join(jobsDir, jobFolder)
    for (const version of safeReaddir(jobPath)) {
      const exportDir = join(jobPath, version, 'export')
      if (!existsSync(exportDir)) continue
      for (const country of safeReaddir(exportDir)) {
        for (const platform of safeReaddir(join(exportDir, country))) {
          const thumbDir = join(exportDir, country, platform, 'thumbnail')
          if (existsSync(thumbDir)) {
            for (const file of safeReaddir(thumbDir)) {
              results.push(join(thumbDir, file))
            }
          }
        }
      }
    }
  }
  return results
}

function safeReaddir(dir: string): string[] {
  try {
    return existsSync(dir) ? readdirSync(dir) : []
  } catch {
    return []
  }
}
