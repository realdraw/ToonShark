import {defineConfig} from 'vitest/config'
import {resolve} from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared')
    }
  },
  test: {
    globals: false,
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    environmentMatchGlobs: [['src/renderer/**/*.dom.test.tsx', 'jsdom']],
    coverage: {
      provider: 'v8',
      include: ['src/main/services/**', 'src/main/ipc/**', 'src/shared/**']
    }
  }
})
