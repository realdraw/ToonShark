import {expect, launchElectronApp, test} from './fixtures'

test('persists baseDir across app relaunches', async ({ electronApp, page, testBaseDir, testHomeDir }) => {
  await page.evaluate(async (baseDir) => {
    const current = await window.api.loadSettings()
    await window.api.saveSettings({
      ...current,
      baseDir
    })
  }, testBaseDir)

  await electronApp.close()

  const relaunchedApp = await launchElectronApp(testHomeDir)

  try {
    const relaunchedPage = await relaunchedApp.firstWindow()
    await relaunchedPage.waitForLoadState('domcontentloaded')
    await relaunchedPage.getByRole('heading', { name: 'ToonShark' }).waitFor({ timeout: 15000 })
    await relaunchedPage.getByRole('button', { name: /^Settings$|^설정$/ }).click()

    await expect(relaunchedPage.getByRole('heading', { name: /^Settings$|^설정$/ })).toBeVisible()
    await relaunchedPage.getByText(/^Storage$|^저장소$/).click()

    const baseDirInput = relaunchedPage.locator('input[readonly]').first()
    await expect(baseDirInput).toHaveValue(testBaseDir)
  } finally {
    await relaunchedApp.close()
  }
})
