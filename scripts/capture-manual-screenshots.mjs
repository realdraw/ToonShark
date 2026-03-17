/**
 * Captures screenshots for the ToonShark user manual.
 *
 * Usage:
 *   npm run build
 *   node scripts/capture-manual-screenshots.mjs
 *
 * Requires: playwright (devDependency)
 */

import {_electron as electron} from 'playwright'
import {mkdirSync, mkdtempSync, rmSync} from 'fs'
import {dirname, join, resolve} from 'path'
import {tmpdir} from 'os'
import {fileURLToPath} from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const projectRoot = resolve(__dirname, '..')
const outputDir = join(projectRoot, 'docs', 'images')
const fixturePdf = join(projectRoot, 'test', 'fixtures', 'pdfs', 'auto-slice-3panels.pdf')

mkdirSync(outputDir, { recursive: true })

const testHomeDir = mkdtempSync(join(tmpdir(), 'toonshark-screenshots-'))
mkdirSync(join(testHomeDir, 'tmp'), { recursive: true })

async function screenshot(page, name, opts = {}) {
  const path = join(outputDir, `${name}.png`)
  await page.screenshot({ path, fullPage: false, ...opts })
  console.log(`  ✓ ${name}.png`)
}

async function mockOpenDialog(electronApp, filePath) {
  await electronApp.evaluate(async ({ dialog }, targetPath) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [targetPath]
    })
  }, filePath)
}

async function main() {
  console.log('Launching ToonShark...')

  const electronApp = await electron.launch({
    args: [join(projectRoot, 'dist-electron/main/index.js')],
    env: {
      ...process.env,
      HOME: testHomeDir,
      TMPDIR: join(testHomeDir, 'tmp'),
      TEMP: join(testHomeDir, 'tmp'),
      TMP: join(testHomeDir, 'tmp')
    }
  })

  const page = await electronApp.firstWindow()
  await page.waitForLoadState('domcontentloaded')

  // Set a consistent viewport
  await page.setViewportSize({ width: 1280, height: 800 })

  try {
    // ───────── 1. Home (empty state) ─────────
    console.log('\n[Home]')
    await page.getByRole('heading', { name: 'ToonShark' }).waitFor()
    await screenshot(page, '01-home-empty')

    // ───────── 2. Set base dir, then open PDF ─────────
    const testBaseDir = join(testHomeDir, 'data')
    await page.evaluate(async (baseDir) => {
      const s = await window.api.loadSettings()
      await window.api.saveSettings({ ...s, baseDir })
    }, testBaseDir)

    await mockOpenDialog(electronApp, fixturePdf)
    await page.getByRole('button', { name: 'Open PDF' }).click()
    await page.waitForURL(/\/workspace$/)

    // ───────── 3. Workspace (before run) ─────────
    console.log('\n[Workspace]')
    await page.getByRole('button', { name: 'Run' }).waitFor()
    await screenshot(page, '02-workspace-before-run')

    // ───────── 4. Run slice job ─────────
    await page.getByRole('button', { name: 'Run' }).click()
    await page.getByRole('button', { name: 'Detail' }).first().waitFor({ timeout: 30000 })
    await screenshot(page, '03-workspace-after-run')

    // ───────── 5. Switch to Fixed mode for another screenshot ─────────
    await page.getByRole('button', { name: 'Fixed', exact: true }).click()
    await screenshot(page, '04-workspace-fixed-mode')
    // Switch back to Auto
    await page.getByRole('button', { name: 'Auto', exact: true }).click()

    // ───────── 6. Job Detail Page ─────────
    console.log('\n[Job Detail]')
    await page.getByRole('button', { name: 'Detail' }).first().click()
    await page.getByText('Created', { exact: true }).waitFor()
    await screenshot(page, '05-job-detail')

    // ───────── 7. Preview Page ─────────
    console.log('\n[Preview]')
    await page.getByRole('button', { name: 'Preview' }).click()
    // Wait for first image to load in preview
    await page.locator('img').first().waitFor({ state: 'visible', timeout: 10000 })
    await screenshot(page, '06-preview')

    // Go back to job detail
    await page.getByText('← Back').click()
    await page.getByText('Created', { exact: true }).waitFor()

    // ───────── 8. Slice Detail Page ─────────
    console.log('\n[Slice Detail]')
    // Click first slice thumbnail
    const sliceThumbs = page.locator('button').filter({ has: page.locator('img') })
    await sliceThumbs.first().click()
    // Wait for the main image to load in slice viewer
    await page.locator('.flex-1.overflow-auto img').waitFor({ state: 'visible', timeout: 10000 })
    await screenshot(page, '07-slice-viewer')

    // ───────── 9. Thumbnail capture dropdown ─────────
    console.log('\n[Thumbnail]')
    await page.getByRole('button', { name: 'Thumbnail' }).click()
    // Wait for dropdown to appear
    await page.locator('button').filter({ hasText: 'Ridi' }).first().waitFor({ state: 'visible' })
    await screenshot(page, '08-thumbnail-dropdown')

    // Select first platform to show crop overlay
    const platformBtn = page.locator('button').filter({ hasText: 'Ridi' }).first()
    if (await platformBtn.isVisible()) {
      await platformBtn.click()
      // CropOverlay depends on image onLoad + displaySize — wait for the dim overlay
      try {
        await page.locator('.absolute.inset-0.bg-black\\/50').waitFor({ state: 'visible', timeout: 5000 })
        await screenshot(page, '09-thumbnail-crop')
      } catch {
        console.log('  ⚠ Crop overlay did not appear (image may not have loaded), skipping 09-thumbnail-crop')
      }
      // Cancel crop
      await page.keyboard.press('Escape')
    }

    // ───────── 10. Export Page ─────────
    console.log('\n[Export]')
    // Go back to job detail
    await page.keyboard.press('Escape')
    await page.getByText('Created', { exact: true }).waitFor()
    await page.getByRole('button', { name: 'Episode Export' }).click()
    // Wait for platform list to load
    await page.getByText('South Korea').waitFor({ state: 'visible', timeout: 5000 })
    await screenshot(page, '10-export')

    // ───────── 11. Settings Page ─────────
    console.log('\n[Settings]')
    await page.evaluate(() => { window.location.hash = '#/settings' })
    await page.getByRole('heading', { name: 'Settings' }).waitFor({ timeout: 5000 })
    await screenshot(page, '11-settings')

    // Open Theme section
    await page.getByText('Theme').click()
    await page.locator('option[value="light"]').waitFor({ state: 'attached' })
    await screenshot(page, '12-settings-theme')

    // Open Device Presets section
    await page.getByText('Device Presets').click()
    await page.getByText('Add Device').waitFor({ state: 'visible' })
    await screenshot(page, '13-settings-devices')

    // ───────── 12. Light theme ─────────
    console.log('\n[Light Theme]')
    // Theme section might be collapsed — click the Theme header
    const themeSectionBtn = page.locator('button').filter({ hasText: /^Theme/ }).first()
    await themeSectionBtn.click()
    // Wait for select to be visible
    const themeSelect = page.locator('select').filter({ has: page.locator('option[value="light"]') })
    await themeSelect.waitFor({ state: 'visible' })
    await themeSelect.selectOption('light')
    // Wait for theme to apply — background color changes from dark to light
    await page.waitForFunction(
      () => getComputedStyle(document.body).backgroundColor !== 'rgb(15, 23, 42)',
      { timeout: 5000 }
    ).catch(() => {
      // Fallback: theme may already be applied
    })
    await screenshot(page, '14-settings-light-theme')

    // Save and go home to show light theme home
    await page.getByRole('button', { name: /Save/ }).click()
    await page.getByText(/Saved!|저장 완료!/).waitFor({ state: 'visible', timeout: 3000 })
    await page.evaluate(() => { window.location.hash = '#/' })
    await page.getByRole('heading', { name: 'ToonShark' }).waitFor()
    await screenshot(page, '15-home-light-theme')

    console.log('\n✅ All screenshots captured!')

  } catch (err) {
    console.error('Screenshot capture failed:', err)
  } finally {
    await electronApp.close()
    rmSync(testHomeDir, { recursive: true, force: true })
  }
}

main()
