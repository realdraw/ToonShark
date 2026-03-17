import {expect, test} from './fixtures'

/** 설정 페이지로 이동 — 영어/한국어 모두 대응 */
async function goToSettings(page: import('playwright').Page) {
  const settingsButton = page.getByRole('button', { name: /^Settings$|^설정$/ })
  await settingsButton.click()
  await expect(page.getByRole('heading', { name: /^Settings$|^설정$/ })).toBeVisible()
}

// 커스텀 디바이스 프리셋 추가 후 저장 확인
test('adds a custom device preset', async ({ page }) => {
  await goToSettings(page)

  // Device Presets 섹션 열기
  await page.getByText(/^Device Presets$|^디바이스 프리셋$/).click()

  // "Add Device" 클릭
  await page.getByRole('button', { name: /^Add Device$|^디바이스 추가$/ }).click()

  // 새 디바이스 행의 이름 입력 — DevicePresetsSection의 input[type="text"]
  // 마지막 디바이스 행의 text input에 이름 입력
  const deviceRows = page.locator('.space-y-3 > div')
  const lastRow = deviceRows.last()
  const nameInput = lastRow.locator('input[type="text"]')
  await nameInput.fill('Test Device')

  // 저장
  await page.getByRole('button', { name: /^Save Settings$|^Save Changes$|^설정 저장$|^변경사항 저장$/ }).click()
  await expect(page.getByText(/Saved!|저장 완료!/)).toBeVisible({ timeout: 5_000 })

  // API를 통해 저장된 디바이스 확인
  const savedDevices = await page.evaluate(() => window.api.getDevicePresets())
  const testDevice = savedDevices.find((d: { name: string }) => d.name === 'Test Device')
  expect(testDevice).toBeTruthy()
})

// 디바이스 프리셋을 기본값으로 리셋
test('resets device presets to defaults', async ({ page }) => {
  // 기본 프리셋 개수 확인
  const defaultPresets = await page.evaluate(() => window.api.getDefaultDevicePresets())
  const defaultCount = defaultPresets.length

  await goToSettings(page)

  // Device Presets 섹션 열기
  await page.getByText(/^Device Presets$|^디바이스 프리셋$/).click()

  // "Reset Defaults" 클릭
  await page.getByRole('button', { name: /^Reset Defaults$|^기본값 복원$/ }).click()

  // 저장
  await page.getByRole('button', { name: /^Save Settings$|^Save Changes$|^설정 저장$|^변경사항 저장$/ }).click()
  await expect(page.getByText(/Saved!|저장 완료!/)).toBeVisible({ timeout: 5_000 })

  // 프리셋 개수가 기본값과 동일한지 확인
  const currentPresets = await page.evaluate(() => window.api.getDevicePresets())
  expect(currentPresets.length).toBe(defaultCount)
})

// 설정 변경 후 "Reset All Settings"으로 기본값 복원 확인
test('modifies settings and verifies reset all restores defaults', async ({ page }) => {
  await goToSettings(page)

  // Slice Defaults 섹션 열기 후 높이 변경
  await page.getByText(/^Slice Defaults$|^분할 기본값$/).click()
  const heightInput = page.locator('input[type="number"]').first()
  await heightInput.fill('999')

  // 변경값 저장
  await page.getByRole('button', { name: /^Save Settings$|^Save Changes$|^설정 저장$|^변경사항 저장$/ }).click()
  await expect(page.getByText(/Saved!|저장 완료!/)).toBeVisible({ timeout: 5_000 })

  // 전체 설정 초기화 (confirm 다이얼로그 수락)
  page.on('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: /^Reset All Settings$|^전체 설정 초기화$/ }).click()

  // 초기화된 설정 저장
  await page.getByRole('button', { name: /^Save Settings$|^Save Changes$|^설정 저장$|^변경사항 저장$/ }).click()
  await expect(page.getByText(/Saved!|저장 완료!/)).toBeVisible({ timeout: 5_000 })

  // 기본값(1280)으로 복원되었는지 확인
  const settings = await page.evaluate(() => window.api.loadSettings())
  expect(settings.defaultSliceHeight).toBe(1280)
})
