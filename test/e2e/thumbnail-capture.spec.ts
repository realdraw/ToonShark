import {existsSync, readdirSync} from 'fs'
import {join} from 'path'
import {expect, fixturePdfPath, mockNextOpenDialogPath, test} from './fixtures'

/**
 * Helper: slice a PDF and navigate to the slice detail page
 */
async function sliceAndGoToSliceDetail(
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

  // Go to job detail
  await page.getByRole('button', { name: /^Detail$|^상세$/ }).first().click()
  await expect(page).toHaveURL(/\/job\//)

  // Click first slice thumbnail to go to slice detail
  const firstSlice = page.locator('button').filter({ has: page.locator('img') }).first()
  await firstSlice.click()
  await expect(page).toHaveURL(/\/slice\?index=/)
}

test('slice detail page shows Thumbnail button', async ({ electronApp, page, testBaseDir }) => {
  await sliceAndGoToSliceDetail(electronApp, page, testBaseDir)

  await expect(page.getByRole('button', { name: /^Thumbnail$|^썸네일$/ })).toBeVisible()
})

test('thumbnail button shows platform dropdown', async ({ electronApp, page, testBaseDir }) => {
  await sliceAndGoToSliceDetail(electronApp, page, testBaseDir)

  await page.getByRole('button', { name: /^Thumbnail$|^썸네일$/ }).click()

  // Should show dropdown with platforms that have thumbnail specs
  // ridi has thumbnail spec (360x522) in the default countries.json
  await expect(page.getByText('360x522')).toBeVisible({ timeout: 3000 })
})

test('captures thumbnail and shows folder button that persists after navigation', async ({ electronApp, page, testBaseDir }) => {
  await sliceAndGoToSliceDetail(electronApp, page, testBaseDir)

  // Wait for image to load
  const img = page.locator('.relative.inline-block img')
  await expect(img).toBeVisible({ timeout: 5000 })

  // Click Thumbnail → pick platform
  await page.getByRole('button', { name: /^Thumbnail$|^썸네일$/ }).click()
  await expect(page.getByText('360x522')).toBeVisible({ timeout: 3000 })

  // Click the first platform with thumbnail spec
  const platformButton = page.locator('button').filter({ hasText: '360x522' }).first()
  await platformButton.click()

  // Crop overlay should appear (Save and Cancel buttons)
  await expect(page.getByRole('button', { name: /^Save$|^저장$/ })).toBeVisible({ timeout: 3000 })
  await expect(page.getByRole('button', { name: /^Cancel$|^취소$/ })).toBeVisible()

  // Confirm the crop
  await page.getByRole('button', { name: /^Save$|^저장$/ }).click()

  // Success toast should appear
  await expect(page.getByText(/^Thumbnail saved$|^썸네일 저장 완료$/)).toBeVisible({ timeout: 5000 })

  // Folder button should appear
  await expect(page.locator('button[title="Open Folder"], button[title="폴더 열기"]')).toBeVisible()

  // Verify thumbnail file was created on disk
  const thumbnailFiles = findThumbnailFiles(testBaseDir)
  expect(thumbnailFiles.length).toBeGreaterThan(0)

  // Navigate back to job detail and return — folder button should persist
  await page.getByRole('button', { name: /Back|뒤로/ }).click()
  await expect(page).toHaveURL(/\/job\/[^/]+$/)

  // Go back to slice detail
  const firstSlice = page.locator('button').filter({ has: page.locator('img') }).first()
  await firstSlice.click()
  await expect(page).toHaveURL(/\/slice\?index=/)

  // Folder button should still be visible (loaded from disk via getThumbnailDir)
  await expect(page.locator('button[title="Open Folder"], button[title="폴더 열기"]')).toBeVisible({ timeout: 5000 })
})

/**
 * Recursively find thumbnail files under the baseDir
 */
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
