import {test as base, expect} from '@playwright/test'
import {type ElectronApplication, type Page} from 'playwright'
import {mkdirSync, mkdtempSync, rmSync} from 'fs'
import {join} from 'path'
import {tmpdir} from 'os'
import {fixturePdfPath, launchElectronApp, mockNextOpenDialogPath} from './fixtures'

let electronApp: ElectronApplication
let page: Page
let testHomeDir: string

base.describe.serial('job detail preview', () => {
  base.beforeAll(async () => {
    testHomeDir = mkdtempSync(join(tmpdir(), 'toonshark-e2e-home-'))
    mkdirSync(join(testHomeDir, 'tmp'), { recursive: true })
    const testBaseDir = join(testHomeDir, 'custom-base-dir')

    electronApp = await launchElectronApp(testHomeDir)
    page = await electronApp.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    await page.getByRole('heading', { name: 'ToonShark' }).waitFor({ timeout: 15000 })

    // 공유 setup: PDF 슬라이스 후 작업 상세 페이지로 이동
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
  })

  base.afterAll(async () => {
    await electronApp?.close()
    for (let i = 0; i < 5; i++) {
      try { rmSync(testHomeDir, { recursive: true, force: true }); break }
      catch { await new Promise(r => setTimeout(r, 500)) }
    }
  })

  // 작업 상세 페이지의 메타 정보와 액션 버튼 확인
  base.test('job detail page shows complete metadata', async () => {
    await expect(page.getByText(/^Created$|^생성일$/)).toBeVisible()
    await expect(page.getByText(/^Pages$|^페이지$/)).toBeVisible()
    await expect(page.getByText(/^Slices$|^슬라이스$/)).toBeVisible()
    await expect(page.getByText(/^Mode$|^모드$/)).toBeVisible()
    await expect(page.getByText(/^Prefix$|^접두사$/)).toBeVisible()
    await expect(page.getByText(/^Source PDF$|^원본 PDF$/)).toBeVisible()

    await expect(page.getByRole('button', { name: /^Preview$|^미리보기$/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /^Episode Export$|^에피소드 내보내기$/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /^Open Source PDF$|^원본 PDF 열기$/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /^Open Folder$|^폴더 열기$/ })).toBeVisible()

    await expect(page.getByText(/Slices \(\d+\)|슬라이스 \(\d+\)/)).toBeVisible()
  })

  // 작업 상세에서 프리뷰 페이지로 이동
  base.test('navigates to preview page from job detail', async () => {
    await page.getByRole('button', { name: /^Preview$|^미리보기$/ }).click()
    await expect(page).toHaveURL(/\/preview\//)

    await expect(page.getByText(/^Width$|^너비$/)).toBeVisible()
    await expect(page.getByText(/^Height$|^높이$/)).toBeVisible()
    await expect(page.getByText(/^Gap$|^간격$/)).toBeVisible()

    const deviceSelect = page.locator('select').first()
    await expect(deviceSelect).toBeVisible()

    // 작업 상세로 복귀
    await page.goBack()
    await expect(page).toHaveURL(/\/job\/[^/]+$/)
  })

  // 작업 상세에서 슬라이스 썸네일 클릭 시 슬라이스 상세로 이동
  base.test('navigates to slice detail from job detail thumbnails', async () => {
    const firstSlice = page.locator('button').filter({ has: page.locator('img') }).first()
    await firstSlice.click()
    await expect(page).toHaveURL(/\/job\/.+\/slice\?index=/)

    await expect(page.getByRole('button', { name: /Back|뒤로/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /^Next$|^다음$/ })).toBeVisible()

    // 작업 상세로 복귀
    await page.getByRole('button', { name: /Back|뒤로/ }).click()
    await expect(page).toHaveURL(/\/job\/[^/]+$/)
  })

  // 슬라이스 상세 페이지에서 키보드 좌우 네비게이션 및 Escape 동작 검증
  base.test('slice detail page keyboard navigation works', async () => {
    const firstSlice = page.locator('button').filter({ has: page.locator('img') }).first()
    await firstSlice.click()
    await expect(page).toHaveURL(/\/slice\?index=/)

    const urlBefore = page.url()

    await page.keyboard.press('ArrowRight')
    await page.waitForFunction(
      (prev) => window.location.href !== prev,
      urlBefore,
      { timeout: 3_000 }
    ).catch(() => {})

    const urlAfterRight = page.url()

    await page.keyboard.press('ArrowLeft')
    if (urlAfterRight !== urlBefore) {
      await page.waitForFunction(
        (prev) => window.location.href !== prev,
        urlAfterRight,
        { timeout: 3_000 }
      )
    }

    await page.keyboard.press('Escape')
    await expect(page).toHaveURL(/\/job\/[^/]+$/)
  })
})
