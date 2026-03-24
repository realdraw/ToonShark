import {expect, test} from './fixtures'

test('launches the app to the home screen', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'ToonShark' })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Open File$|^파일 열기$/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Settings$|^설정$/ })).toBeVisible()
})
