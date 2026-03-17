import {expect, fixturePdfPath, mockNextOpenDialogPath, test} from './fixtures'

/**
 * 헬퍼: PDF를 열고, 슬라이스 실행 후 홈 화면으로 복귀
 */
async function createJobAndGoHome(
  electronApp: Parameters<typeof mockNextOpenDialogPath>[0],
  page: Awaited<ReturnType<typeof import('playwright')['_electron']['launch']>>['firstWindow'] extends () => Promise<infer P> ? P : never,
  testBaseDir: string
) {
  const pdfPath = fixturePdfPath('auto-slice-3panels.pdf')

  await page.evaluate(async (baseDir) => {
    const current = await window.api.loadSettings()
    await window.api.saveSettings({ ...current, baseDir })
  }, testBaseDir)

  await mockNextOpenDialogPath(electronApp, pdfPath)
  await page.getByRole('button', { name: /^Open PDF$|^PDF 열기$/ }).click()

  await expect(page).toHaveURL(/\/workspace$/)
  // Run 버튼이 활성화될 때까지 대기
  await expect(page.getByRole('button', { name: /^Run$|^실행$/ })).toBeEnabled({ timeout: 5_000 })
  await page.getByRole('button', { name: /^Run$|^실행$/ }).click()
  await expect(page.getByRole('button', { name: /^Detail$|^상세$/ })).toBeVisible({ timeout: 20_000 })

  // 홈으로 이동
  await page.getByRole('button', { name: /^Home$|^홈$/ }).click()
  await expect(page.getByRole('heading', { name: 'ToonShark' })).toBeVisible()
}

// 워크스페이스 결과 패널에서 단건 작업 삭제
test('deletes a single job from workspace results panel', async ({ electronApp, page, testBaseDir }) => {
  const pdfPath = fixturePdfPath('auto-slice-3panels.pdf')

  await page.evaluate(async (baseDir) => {
    const current = await window.api.loadSettings()
    await window.api.saveSettings({ ...current, baseDir })
  }, testBaseDir)

  await mockNextOpenDialogPath(electronApp, pdfPath)
  await page.getByRole('button', { name: /^Open PDF$|^PDF 열기$/ }).click()
  await expect(page).toHaveURL(/\/workspace$/)

  await page.getByRole('button', { name: /^Run$|^실행$/ }).click()
  await expect(page.getByRole('button', { name: /^Delete$|^삭제$/ }).first()).toBeVisible({ timeout: 20_000 })

  // confirm 다이얼로그 수락 후 삭제
  page.on('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: /^Delete$|^삭제$/ }).first().click()

  // 삭제 후 결과 패널이 빈 상태로 전환
  await expect(page.getByText(/^No results$|^결과가 없습니다$/)).toBeVisible({ timeout: 5_000 })
})

// 홈 화면에서 "Delete All"로 전체 작업 삭제
test('deletes all jobs from home page', async ({ electronApp, page, testBaseDir }) => {
  await createJobAndGoHome(electronApp, page, testBaseDir)

  const deleteAllButton = page.getByRole('button', { name: /^Delete All$|^전체 삭제$/ })
  await expect(deleteAllButton).toBeVisible()

  // confirm 다이얼로그 수락 후 전체 삭제
  page.on('dialog', (dialog) => dialog.accept())
  await deleteAllButton.click()

  // 빈 상태 표시 확인
  await expect(page.getByText(/^No jobs yet$|^작업 내역이 없습니다$/)).toBeVisible({ timeout: 5_000 })
})

// 홈 화면에서 특정 PDF의 작업만 삭제
test('deletes jobs by PDF from home page', async ({ electronApp, page, testBaseDir }) => {
  await createJobAndGoHome(electronApp, page, testBaseDir)

  const deletePdfButton = page.getByRole('button', { name: /^Delete$|^삭제$/ }).first()
  await expect(deletePdfButton).toBeVisible()

  page.on('dialog', (dialog) => dialog.accept())
  await deletePdfButton.click()

  await expect(page.getByText(/^No jobs yet$|^작업 내역이 없습니다$/)).toBeVisible({ timeout: 5_000 })
})

// 홈 화면의 작업 항목 클릭 시 상세 페이지로 이동
test('navigates to job detail page from home', async ({ electronApp, page, testBaseDir }) => {
  await createJobAndGoHome(electronApp, page, testBaseDir)

  // 작업 행(▶ 표시)을 클릭 — "Open" 버튼이 아닌 작업 엔트리
  const jobEntry = page.locator('button').filter({ hasText: '▶' }).first()
  await jobEntry.click()

  // 상세 페이지로 이동 확인
  await expect(page).toHaveURL(/\/job\//)
  await expect(page.getByText(/^Created$|^생성일$/)).toBeVisible()
  await expect(page.getByText(/^Pages$|^페이지$/)).toBeVisible()
  await expect(page.getByText(/^Slices$|^슬라이스$/)).toBeVisible()
  await expect(page.getByText(/^Mode$|^모드$/)).toBeVisible()
})

// 같은 PDF에 대해 다른 모드로 2회 슬라이스 실행
test('runs multiple slice jobs for the same PDF', async ({ electronApp, page, testBaseDir }) => {
  const pdfPath = fixturePdfPath('auto-slice-3panels.pdf')

  await page.evaluate(async (baseDir) => {
    const current = await window.api.loadSettings()
    await window.api.saveSettings({ ...current, baseDir })
  }, testBaseDir)

  await mockNextOpenDialogPath(electronApp, pdfPath)
  await page.getByRole('button', { name: /^Open PDF$|^PDF 열기$/ }).click()
  await expect(page).toHaveURL(/\/workspace$/)

  // 첫 번째 작업 (Auto 모드)
  await page.getByRole('button', { name: /^Run$|^실행$/ }).click()
  await expect(page.getByRole('button', { name: /^Detail$|^상세$/ }).first()).toBeVisible({ timeout: 20_000 })

  // Fixed 모드로 전환 후 두 번째 작업
  await page.getByRole('button', { name: /^Fixed$|^고정$/ }).click()
  await page.getByRole('button', { name: /^Run$|^실행$/ }).click()
  await expect(page.getByText(/\(2 runs\)|\(2회 실행\)/)).toBeVisible({ timeout: 20_000 })
})
