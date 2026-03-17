import {expect, fixturePdfPath, mockNextOpenDialogPath, test} from './fixtures'

/**
 * 헬퍼: PDF 슬라이스 후 내보내기 페이지로 이동
 */
async function sliceAndGoToExport(
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

  await page.getByRole('button', { name: /^Run$|^실행$/ }).click()
  await expect(page.getByRole('button', { name: /^Episode Export$|^에피소드 내보내기$/ }).first()).toBeVisible({ timeout: 20_000 })

  await page.getByRole('button', { name: /^Episode Export$|^에피소드 내보내기$/ }).first().click()
  await expect(page).toHaveURL(/\/job\/.+\/export$/)
}

// 내보내기 페이지에 국가/플랫폼 섹션이 올바르게 표시되는지 확인
test('export page shows country and platform sections', async ({ electronApp, page, testBaseDir }) => {
  await sliceAndGoToExport(electronApp, page, testBaseDir)

  await expect(page.getByRole('heading', { name: /^Episode Export$|^에피소드 내보내기$/ })).toBeVisible()

  // 체크박스가 하나 이상 존재
  const checkboxes = page.locator('input[type="checkbox"]')
  const checkboxCount = await checkboxes.count()
  expect(checkboxCount).toBeGreaterThan(0)

  // 플랫폼 테이블 컬럼 헤더 확인
  await expect(page.getByRole('columnheader', { name: /^Platform$|^플랫폼$/ })).toBeVisible()
  await expect(page.getByRole('columnheader', { name: /^Width$|^너비$/ })).toBeVisible()
  await expect(page.getByRole('columnheader', { name: /^Format$|^형식$/ })).toBeVisible()
})

// 플랫폼 미선택 시 "No platforms selected" 표시
test('export button is disabled when no platforms selected', async ({ electronApp, page, testBaseDir }) => {
  await sliceAndGoToExport(electronApp, page, testBaseDir)

  await expect(page.getByText(/^No platforms selected$|^선택된 플랫폼이 없습니다$/)).toBeVisible()
})

// 여러 플랫폼 선택 후 내보내기 실행 및 결과 확인
test('exports to multiple platforms and shows results', async ({ electronApp, page, testBaseDir }) => {
  await sliceAndGoToExport(electronApp, page, testBaseDir)

  // 활성화된 체크박스 중 1개 선택
  const checkboxes = page.locator('tbody input[type="checkbox"]:not([disabled])')
  await checkboxes.first().check()

  // "Run Export" 버튼 활성화 대기 후 클릭
  const runExportBtn = page.getByRole('button', { name: /^Run Export$|^내보내기 실행$/ })
  await expect(runExportBtn).toBeEnabled({ timeout: 5_000 })
  await runExportBtn.click()

  // 내보내기 완료 대기
  await expect(page.getByRole('button', { name: /^Open Export Folder$|^내보내기 폴더 열기$/ }).first()).toBeVisible({ timeout: 30_000 })

  // 성공 메시지 확인
  await expect(page.getByText(/^Export complete!$|^내보내기 완료!$/)).toBeVisible()
})

// 재내보내기 시 이전에 내보낸 플랫폼에 "Exported" 뱃지 표시
test('re-export shows already exported badges', async ({ electronApp, page, testBaseDir }) => {
  // 첫 번째 내보내기
  await sliceAndGoToExport(electronApp, page, testBaseDir)

  const checkboxes = page.locator('tbody input[type="checkbox"]:not([disabled])')
  await checkboxes.first().check()
  await page.getByRole('button', { name: /^Run Export$|^내보내기 실행$/ }).click()
  await expect(page.getByRole('button', { name: /^Open Export Folder$|^내보내기 폴더 열기$/ }).first()).toBeVisible({ timeout: 30_000 })

  // 뒤로 갔다가 다시 내보내기 페이지 진입
  await page.getByRole('button', { name: /Back|뒤로/ }).click()
  await page.getByRole('button', { name: /^Episode Export$|^에피소드 내보내기$/ }).first().click()
  await expect(page).toHaveURL(/\/job\/.+\/export$/)

  // 이전에 내보낸 플랫폼에 "Exported" 뱃지 확인
  await expect(page.getByText(/Exported|내보내기 완료/).first()).toBeVisible({ timeout: 5_000 })
})
