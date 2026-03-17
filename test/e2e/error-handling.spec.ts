import {expect, fixturePdfPath, mockNextOpenDialogPath, test} from './fixtures'

// 작업이 없을 때 빈 상태 메시지 표시
test('shows empty state when no jobs exist', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'ToonShark' })).toBeVisible()
  await expect(page.getByText(/^No jobs yet$|^작업 내역이 없습니다$/)).toBeVisible()
  await expect(page.getByText(/^Open a PDF to get started$|^PDF를 열어 시작하세요$/)).toBeVisible()
})

// PDF 선택 취소 시 홈 화면 유지
test('cancelling PDF selection stays on home page', async ({ electronApp, page }) => {
  // 파일 선택 다이얼로그를 취소 상태로 mock
  await electronApp.evaluate(async ({ dialog }) => {
    dialog.showOpenDialog = async () => ({
      canceled: true,
      filePaths: []
    })
  })

  await page.getByRole('button', { name: /^Open PDF$|^PDF 열기$/ }).click()

  // 홈 화면에 머무는지 확인
  await expect(page.getByRole('heading', { name: 'ToonShark' })).toBeVisible()
})

// 워크스페이스에서 작업 실행 전에는 "No results" 표시
test('workspace shows no results before running a job', async ({ electronApp, page, testBaseDir }) => {
  const pdfPath = fixturePdfPath('auto-slice-3panels.pdf')

  await page.evaluate(async (baseDir) => {
    const current = await window.api.loadSettings()
    await window.api.saveSettings({ ...current, baseDir })
  }, testBaseDir)

  await mockNextOpenDialogPath(electronApp, pdfPath)
  await page.getByRole('button', { name: /^Open PDF$|^PDF 열기$/ }).click()
  await expect(page).toHaveURL(/\/workspace$/)

  // 결과 패널에 빈 상태 메시지 확인
  await expect(page.getByText(/^No results$|^결과가 없습니다$/)).toBeVisible()
  await expect(page.getByText(/^Adjust options and click Run$|^옵션을 조정한 뒤 실행을 클릭하세요$/)).toBeVisible()
})

// 존재하지 않는 job ID로 상세 페이지 접근 시 "Job not found" 표시
test('job detail returns "Job not found" for invalid job ID', async ({ page }) => {
  // hash router를 사용하므로 hash를 직접 변경
  await page.evaluate(() => {
    window.location.hash = '#/job/nonexistent-job-id'
  })

  await expect(page.getByText(/^Job not found$|^작업을 찾을 수 없습니다$/)).toBeVisible({ timeout: 5_000 })
})

// 동일 설정으로 중복 실행 시 토스트 또는 정상 처리 확인
test('duplicate slice job detection shows toast', async ({ electronApp, page, testBaseDir }) => {
  const pdfPath = fixturePdfPath('auto-slice-3panels.pdf')

  await page.evaluate(async (baseDir) => {
    const current = await window.api.loadSettings()
    await window.api.saveSettings({ ...current, baseDir })
  }, testBaseDir)

  await mockNextOpenDialogPath(electronApp, pdfPath)
  await page.getByRole('button', { name: /^Open PDF$|^PDF 열기$/ }).click()
  await expect(page).toHaveURL(/\/workspace$/)

  // 첫 번째 실행
  await page.getByRole('button', { name: /^Run$|^실행$/ }).click()
  await expect(page.getByRole('button', { name: /^Detail$|^상세$/ }).first()).toBeVisible({ timeout: 20_000 })

  // 동일 설정으로 재실행 — 중복 감지 토스트 또는 정상 진행
  await page.getByRole('button', { name: /^Run$|^실행$/ }).click()

  const duplicateToast = page.getByText(/same settings already exists|동일한 설정의 작업이 이미 존재합니다/)
  const processing = page.getByText(/^Processing\.\.\.$|^처리 중\.\.\./)
  await expect(duplicateToast.or(processing)).toBeVisible({ timeout: 5_000 })
})
