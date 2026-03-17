import {defineConfig} from '@playwright/test'

export default defineConfig({
  testDir: './test/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: {
    timeout: 5_000
  },
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    trace: 'on-first-retry'
  }
})
