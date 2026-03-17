import {expect, test} from './fixtures'

test('launches the app to the home screen', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'ToonShark' })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Open PDF$|^PDF 열기$/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Settings$|^설정$/ })).toBeVisible()
})

test('opens the settings screen from home', async ({ page }) => {
  await page.getByRole('button', { name: /^Settings$|^설정$/ }).click()

  await expect(page.getByRole('heading', { name: /^Settings$|^설정$/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Save Settings$|^설정 저장$/ })).toBeVisible()
})
