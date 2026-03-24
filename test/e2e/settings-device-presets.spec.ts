import {test as base, expect} from '@playwright/test'
import {type ElectronApplication, type Page} from 'playwright'
import {mkdirSync, mkdtempSync, rmSync} from 'fs'
import {join} from 'path'
import {tmpdir} from 'os'
import {launchElectronApp} from './fixtures'

let electronApp: ElectronApplication
let page: Page
let testHomeDir: string

/** 설정 페이지로 이동 — 영어/한국어 모두 대응 */
async function goToSettings(p: Page) {
  const settingsButton = p.getByRole('button', { name: /^Settings$|^설정$/ })
  await settingsButton.click()
  await expect(p.getByRole('heading', { name: /^Settings$|^설정$/ })).toBeVisible()
}

base.describe.serial('settings device presets', () => {
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

  // 커스텀 디바이스 프리셋 추가 후 저장 확인
  base.test('adds a custom device preset', async () => {
    await goToSettings(page)

    await page.getByText(/^Device Presets$|^디바이스 프리셋$/).click()
    await page.getByRole('button', { name: /^Add Device$|^디바이스 추가$/ }).click()

    const deviceRows = page.locator('.space-y-3 > div')
    const lastRow = deviceRows.last()
    const nameInput = lastRow.locator('input[type="text"]')
    await nameInput.fill('Test Device')

    await page.getByRole('button', { name: /^Save Settings$|^Save Changes$|^설정 저장$|^변경사항 저장$/ }).click()
    await expect(page.getByText(/Saved!|저장 완료!/)).toBeVisible({ timeout: 5_000 })

    const savedDevices = await page.evaluate(() => window.api.getDevicePresets())
    const testDevice = savedDevices.find((d: { name: string }) => d.name === 'Test Device')
    expect(testDevice).toBeTruthy()

    // 홈으로 복귀
    await page.getByRole('button', { name: /Back|뒤로/ }).click()
    await expect(page.getByRole('heading', { name: 'ToonShark' })).toBeVisible()
  })

  // 디바이스 프리셋을 기본값으로 리셋
  base.test('resets device presets to defaults', async () => {
    const defaultPresets = await page.evaluate(() => window.api.getDefaultDevicePresets())
    const defaultCount = defaultPresets.length

    await goToSettings(page)
    await page.getByText(/^Device Presets$|^디바이스 프리셋$/).click()
    await page.getByRole('button', { name: /^Reset Defaults$|^기본값 복원$/ }).click()

    await page.getByRole('button', { name: /^Save Settings$|^Save Changes$|^설정 저장$|^변경사항 저장$/ }).click()
    await expect(page.getByText(/Saved!|저장 완료!/)).toBeVisible({ timeout: 5_000 })

    const currentPresets = await page.evaluate(() => window.api.getDevicePresets())
    expect(currentPresets.length).toBe(defaultCount)

    await page.getByRole('button', { name: /Back|뒤로/ }).click()
    await expect(page.getByRole('heading', { name: 'ToonShark' })).toBeVisible()
  })

  // 설정 변경 후 "Reset All Settings"으로 기본값 복원 확인
  base.test('modifies settings and verifies reset all restores defaults', async () => {
    await goToSettings(page)
    await page.getByText(/^Slice Defaults$|^분할 기본값$/).click()
    const heightInput = page.locator('input[type="number"]').first()
    await heightInput.fill('999')

    await page.getByRole('button', { name: /^Save Settings$|^Save Changes$|^설정 저장$|^변경사항 저장$/ }).click()
    await expect(page.getByText(/Saved!|저장 완료!/)).toBeVisible({ timeout: 5_000 })

    page.on('dialog', (dialog) => dialog.accept())
    await page.getByRole('button', { name: /^Reset All Settings$|^전체 설정 초기화$/ }).click()

    await page.getByRole('button', { name: /^Save Settings$|^Save Changes$|^설정 저장$|^변경사항 저장$/ }).click()
    await expect(page.getByText(/Saved!|저장 완료!/)).toBeVisible({ timeout: 5_000 })

    const settings = await page.evaluate(() => window.api.loadSettings())
    expect(settings.defaultSliceHeight).toBe(1280)
  })
})
