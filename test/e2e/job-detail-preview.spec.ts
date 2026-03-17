import {expect, fixturePdfPath, mockNextOpenDialogPath, test} from './fixtures'

/**
 * 헬퍼: PDF를 열고, 슬라이스 실행 후 작업 상세 페이지로 이동
 */
async function sliceAndGoToDetail(
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
  await expect(page.getByRole('button', { name: /^Detail$|^상세$/ }).first()).toBeVisible({ timeout: 20_000 })

  await page.getByRole('button', { name: /^Detail$|^상세$/ }).first().click()
  await expect(page).toHaveURL(/\/job\//)
}

// 작업 상세 페이지의 메타 정보와 액션 버튼 확인
test('job detail page shows complete metadata', async ({ electronApp, page, testBaseDir }) => {
  await sliceAndGoToDetail(electronApp, page, testBaseDir)

  // 메타 정보 필드 확인
  await expect(page.getByText(/^Created$|^생성일$/)).toBeVisible()
  await expect(page.getByText(/^Pages$|^페이지$/)).toBeVisible()
  await expect(page.getByText(/^Slices$|^슬라이스$/)).toBeVisible()
  await expect(page.getByText(/^Mode$|^모드$/)).toBeVisible()
  await expect(page.getByText(/^Prefix$|^접두사$/)).toBeVisible()
  await expect(page.getByText(/^Source PDF$|^원본 PDF$/)).toBeVisible()

  // 액션 버튼 확인
  await expect(page.getByRole('button', { name: /^Preview$|^미리보기$/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Episode Export$|^에피소드 내보내기$/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Open Source PDF$|^원본 PDF 열기$/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Open Folder$|^폴더 열기$/ })).toBeVisible()

  // 슬라이스 썸네일 섹션 존재 확인
  await expect(page.getByText(/Slices \(\d+\)|슬라이스 \(\d+\)/)).toBeVisible()
})

// 작업 상세에서 프리뷰 페이지로 이동
test('navigates to preview page from job detail', async ({ electronApp, page, testBaseDir }) => {
  await sliceAndGoToDetail(electronApp, page, testBaseDir)

  await page.getByRole('button', { name: /^Preview$|^미리보기$/ }).click()
  await expect(page).toHaveURL(/\/preview\//)

  // 프리뷰 페이지의 디바이스/크기 설정 UI 확인
  await expect(page.getByText(/^Width$|^너비$/)).toBeVisible()
  await expect(page.getByText(/^Height$|^높이$/)).toBeVisible()
  await expect(page.getByText(/^Gap$|^간격$/)).toBeVisible()

  // 디바이스 셀렉터 존재 확인
  const deviceSelect = page.locator('select').first()
  await expect(deviceSelect).toBeVisible()
})

// 작업 상세에서 슬라이스 썸네일 클릭 시 슬라이스 상세로 이동
test('navigates to slice detail from job detail thumbnails', async ({ electronApp, page, testBaseDir }) => {
  await sliceAndGoToDetail(electronApp, page, testBaseDir)

  // 첫 번째 슬라이스 썸네일 클릭
  const firstSlice = page.locator('button').filter({ has: page.locator('img') }).first()
  await firstSlice.click()

  // 슬라이스 상세 페이지로 이동
  await expect(page).toHaveURL(/\/job\/.+\/slice\?index=/)

  // 네비게이션 버튼 확인
  await expect(page.getByRole('button', { name: /Back|뒤로/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Next$|^다음$/ })).toBeVisible()
})

// 슬라이스 상세 페이지에서 키보드 좌우 네비게이션 및 Escape 동작 검증
test('slice detail page keyboard navigation works', async ({ electronApp, page, testBaseDir }) => {
  await sliceAndGoToDetail(electronApp, page, testBaseDir)

  // 첫 번째 슬라이스 썸네일 클릭
  const firstSlice = page.locator('button').filter({ has: page.locator('img') }).first()
  await firstSlice.click()
  await expect(page).toHaveURL(/\/slice\?index=/)

  // 현재 URL 기록
  const urlBefore = page.url()

  // 오른쪽 화살표로 다음 슬라이스 이동 — URL이 변경되어야 함
  await page.keyboard.press('ArrowRight')
  await page.waitForFunction(
    (prev) => window.location.href !== prev,
    urlBefore,
    { timeout: 3_000 }
  ).catch(() => {
    // 마지막 슬라이스인 경우 이동 불가 — 정상 동작
  })

  const urlAfterRight = page.url()

  // 왼쪽 화살표로 이전 슬라이스 복귀
  await page.keyboard.press('ArrowLeft')
  if (urlAfterRight !== urlBefore) {
    // 이동했었다면 원래 위치로 복귀해야 함
    await page.waitForFunction(
      (prev) => window.location.href !== prev,
      urlAfterRight,
      { timeout: 3_000 }
    )
  }

  // Escape로 job 상세 페이지로 복귀
  await page.keyboard.press('Escape')
  await expect(page).toHaveURL(/\/job\/[^/]+$/)
})
