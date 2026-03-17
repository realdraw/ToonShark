import {describe, expect, it} from 'vitest'
import postcss from 'postcss'
import {readFileSync} from 'fs'
import {resolve} from 'path'

describe('Tailwind CSS build', () => {
  it('should compile index.css through PostCSS without errors', async () => {
    const cssPath = resolve(__dirname, 'index.css')
    const css = readFileSync(cssPath, 'utf-8')

    const postcssConfig = require(resolve(__dirname, '../../../postcss.config.js'))
    const plugins = Object.entries(postcssConfig.plugins).map(
      ([name, opts]) => require(name)(opts)
    )

    const result = await postcss(plugins).process(css, { from: cssPath })

    expect(result.css).toBeTruthy()
    expect(result.css.length).toBeGreaterThan(0)
  })

  it('should include Tailwind base styles', async () => {
    const cssPath = resolve(__dirname, 'index.css')
    const css = readFileSync(cssPath, 'utf-8')

    const postcssConfig = require(resolve(__dirname, '../../../postcss.config.js'))
    const plugins = Object.entries(postcssConfig.plugins).map(
      ([name, opts]) => require(name)(opts)
    )

    const result = await postcss(plugins).process(css, { from: cssPath })

    // Tailwind base resets should be present
    expect(result.css).toContain('box-sizing')
    // Custom styles from index.css should be preserved
    expect(result.css).toContain('#0f172a')
  })
})
