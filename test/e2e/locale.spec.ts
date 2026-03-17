import {expect, test} from './fixtures'

/** 설정 저장 버튼 클릭 — 언어에 따라 텍스트가 달라지므로 정확히 매칭 */
async function clickSaveButton(page: import('playwright').Page) {
  // Save Settings / Save Changes / 설정 저장 / 변경사항 저장 / Saved! / 저장 완료!
  const saveButton = page.getByRole('button', { name: /^Save Settings$|^Save Changes$|^설정 저장$|^변경사항 저장$|^Saved!$|^저장 완료!$/ })
  await saveButton.click()
}

/** 설정 페이지로 이동 — 영어/한국어 모두 대응 */
async function goToSettings(page: import('playwright').Page) {
  const settingsButton = page.getByRole('button', { name: /^Settings$|^설정$/ })
  await settingsButton.click()
  await expect(page.getByRole('heading', { name: /^Settings$|^설정$/ })).toBeVisible()
}

/** 언어를 영어로 복원 — 테스트 격리용 */
async function ensureEnglish(page: import('playwright').Page) {
  await goToSettings(page)
  const languageSelect = page.locator('select').first()
  await languageSelect.selectOption('en')
  await clickSaveButton(page)
  await expect(page.getByText(/Saved!|저장 완료!/)).toBeVisible({ timeout: 5_000 })
  await page.getByRole('button', { name: /Back|뒤로/ }).click()
  await expect(page.getByRole('heading', { name: 'ToonShark' })).toBeVisible()
}

// 영어 → 한국어 전환 후 UI가 한국어로 표시되는지 확인
test('switches language to Korean and UI updates', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'ToonShark' })).toBeVisible()

  // 설정 페이지로 이동
  await goToSettings(page)

  // 언어 섹션은 기본으로 열려 있음
  const languageSelect = page.locator('select').first()
  await expect(languageSelect).toBeVisible()

  // 한국어로 변경
  await languageSelect.selectOption('ko')

  // 저장
  await clickSaveButton(page)
  await expect(page.getByText(/Saved!|저장 완료!/)).toBeVisible({ timeout: 5_000 })

  // 뒤로가기
  await page.getByRole('button', { name: /Back|뒤로/ }).click()

  // 홈 화면이 한국어로 표시되는지 확인
  await expect(page.getByRole('heading', { name: 'ToonShark' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'PDF 열기' })).toBeVisible()
  await expect(page.getByRole('button', { name: '설정' })).toBeVisible()

  // 영어로 복원
  await ensureEnglish(page)
})

// 한국어로 전환 후 다시 영어로 복원
test('switches language to Korean and back to English', async ({ page }) => {
  // 설정 → 한국어 전환
  await goToSettings(page)
  const languageSelect = page.locator('select').first()
  await languageSelect.selectOption('ko')
  await clickSaveButton(page)
  await expect(page.getByText(/Saved!|저장 완료!/)).toBeVisible({ timeout: 5_000 })

  // "저장 완료!" 피드백이 사라질 때까지 대기
  await expect(page.getByText(/Saved!|저장 완료!/)).toBeHidden({ timeout: 5_000 })

  // 다시 영어로 전환
  await languageSelect.selectOption('en')
  await clickSaveButton(page)
  await expect(page.getByText(/Saved!|저장 완료!/)).toBeVisible({ timeout: 5_000 })

  // 뒤로가기
  await page.getByRole('button', { name: /Back|뒤로/ }).click()

  // 홈 화면이 영어로 표시되는지 확인
  await expect(page.getByRole('heading', { name: 'ToonShark' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Open PDF' })).toBeVisible()
})

// 한국어 설정이 페이지 이동 후에도 유지되는지 확인
test('Korean locale persists across settings page reload', async ({ page }) => {
  // 설정 → 한국어 전환 후 저장
  await goToSettings(page)
  const languageSelect = page.locator('select').first()
  await languageSelect.selectOption('ko')
  await clickSaveButton(page)
  await expect(page.getByText(/Saved!|저장 완료!/)).toBeVisible({ timeout: 5_000 })

  // 홈으로 이동 후 다시 설정 진입
  await page.getByRole('button', { name: /Back|뒤로/ }).click()
  await expect(page.getByRole('heading', { name: 'ToonShark' })).toBeVisible()

  await page.getByRole('button', { name: '설정' }).click()

  // 설정 페이지가 한국어로 유지되는지 확인
  await expect(page.getByRole('heading', { name: '설정' })).toBeVisible()
  await expect(page.getByRole('button', { name: '설정 저장' })).toBeVisible()

  // 영어로 복원
  const languageSelect2 = page.locator('select').first()
  await languageSelect2.selectOption('en')
  await clickSaveButton(page)
  await expect(page.getByText(/Saved!|저장 완료!/)).toBeVisible({ timeout: 5_000 })
})
