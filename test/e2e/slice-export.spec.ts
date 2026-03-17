import {expect, fixturePdfPath, mockNextOpenDialogPath, test} from './fixtures'

test('opens a generated PDF, runs slice, and exports results', async ({ electronApp, page, testBaseDir }) => {
  const pdfPath = fixturePdfPath('auto-slice-3panels.pdf')

  await page.evaluate(async (baseDir) => {
    const current = await window.api.loadSettings()
    await window.api.saveSettings({
      ...current,
      baseDir
    })
  }, testBaseDir)

  await mockNextOpenDialogPath(electronApp, pdfPath)
  await page.getByRole('button', { name: /^Open PDF$|^PDF 열기$/ }).click()

  await expect(page).toHaveURL(/\/workspace$/)
  await expect(page.getByRole('button', { name: /^Run$|^실행$/ })).toBeVisible()

  await page.getByRole('button', { name: /^Run$|^실행$/ }).click()

  await expect(page.getByRole('button', { name: /^Detail$|^상세$/ })).toBeVisible({ timeout: 20_000 })
  await expect(page.getByRole('button', { name: /^Episode Export$|^에피소드 내보내기$/ })).toBeVisible()

  await page.getByRole('button', { name: /^Episode Export$|^에피소드 내보내기$/ }).click()

  await expect(page).toHaveURL(/\/job\/.+\/export$/)
  await expect(page.getByRole('heading', { name: /^Episode Export$|^에피소드 내보내기$/ })).toBeVisible()

  const platformCheckbox = page.locator('tbody input[type="checkbox"]:not([disabled])').first()
  await platformCheckbox.check()
  await page.getByRole('button', { name: /^Run Export$|^내보내기 실행$/ }).click()

  await expect(page.getByRole('button', { name: /^Open Export Folder$|^내보내기 폴더 열기$/ })).toBeVisible()
})
