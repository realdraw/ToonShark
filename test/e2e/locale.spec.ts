import {test as base, expect} from '@playwright/test'
import {type ElectronApplication, type Page} from 'playwright'
import {mkdirSync, mkdtempSync, rmSync} from 'fs'
import {join} from 'path'
import {tmpdir} from 'os'
import {launchElectronApp} from './fixtures'

let electronApp: ElectronApplication
let page: Page
let testHomeDir: string

/** 설정 저장 버튼 클릭 — 언어에 따라 텍스트가 달라지므로 정확히 매칭 */
async function clickSaveButton(p: Page) {
  const saveButton = p.getByRole('button', { name: /^Save Settings$|^Save Changes$|^설정 저장$|^변경사항 저장$|^Saved!$|^저장 완료!$/ })
  await saveButton.click()
}

/** 설정 페이지로 이동 — 영어/한국어 모두 대응 */
async function goToSettings(p: Page) {
  const settingsButton = p.getByRole('button', { name: /^Settings$|^설정$/ })
  await settingsButton.click()
  await expect(p.getByRole('heading', { name: /^Settings$|^설정$/ })).toBeVisible()
}

base.describe.serial('locale', () => {
  base.beforeAll(async () => {
    testHomeDir = mkdtempSync(join(tmpdir(), 'toonshark-e2e-home-'))
    mkdirSync(join(testHomeDir, 'tmp'), { recursive: true })

    electronApp = await launchElectronApp(testHomeDir)
    page = await electronApp.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    await page.getByRole('heading', { name: 'ToonShark' }).waitFor({ timeout: 15000 })
  })

  base.afterAll(async () => {
    await electronApp?.close()
    for (let i = 0; i < 5; i++) {
      try { rmSync(testHomeDir, { recursive: true, force: true }); break }
      catch { await new Promise(r => setTimeout(r, 500)) }
    }
  })

  // 한국어 전환 후 다시 영어로 복원 — 양방향 전환 검증
  base.test('switches language to Korean and back to English', async () => {
    await goToSettings(page)
    const languageSelect = page.locator('select').first()
    await languageSelect.selectOption('ko')
    await clickSaveButton(page)
    await expect(page.getByText(/Saved!|저장 완료!/)).toBeVisible({ timeout: 5_000 })

    // 뒤로가기 — 홈 화면이 한국어인지 확인
    await page.getByRole('button', { name: /Back|뒤로/ }).click()
    await expect(page.getByRole('heading', { name: 'ToonShark' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'PDF 열기' })).toBeVisible()
    await expect(page.getByRole('button', { name: '설정' })).toBeVisible()

    // 다시 영어로 전환
    await page.getByRole('button', { name: '설정' }).click()
    await expect(page.getByRole('heading', { name: '설정' })).toBeVisible()

    await expect(page.getByText(/Saved!|저장 완료!/)).toBeHidden({ timeout: 5_000 })

    const languageSelect2 = page.locator('select').first()
    await languageSelect2.selectOption('en')
    await clickSaveButton(page)
    await expect(page.getByText(/Saved!|저장 완료!/)).toBeVisible({ timeout: 5_000 })

    await page.getByRole('button', { name: /Back|뒤로/ }).click()
    await expect(page.getByRole('button', { name: 'Open PDF' })).toBeVisible()
  })

  // 한국어 설정이 페이지 이동 후에도 유지되는지 확인
  base.test('Korean locale persists across settings page reload', async () => {
    await goToSettings(page)
    const languageSelect = page.locator('select').first()
    await languageSelect.selectOption('ko')
    await clickSaveButton(page)
    await expect(page.getByText(/Saved!|저장 완료!/)).toBeVisible({ timeout: 5_000 })

    // 홈으로 이동 후 다시 설정 진입
    await page.getByRole('button', { name: /Back|뒤로/ }).click()
    await expect(page.getByRole('heading', { name: 'ToonShark' })).toBeVisible()

    await page.getByRole('button', { name: '설정' }).click()

    await expect(page.getByRole('heading', { name: '설정' })).toBeVisible()
    await expect(page.getByRole('button', { name: '설정 저장' })).toBeVisible()

    // 영어로 복원
    const languageSelect2 = page.locator('select').first()
    await languageSelect2.selectOption('en')
    await clickSaveButton(page)
    await expect(page.getByText(/Saved!|저장 완료!/)).toBeVisible({ timeout: 5_000 })
  })
})
