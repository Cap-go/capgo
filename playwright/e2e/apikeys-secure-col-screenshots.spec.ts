import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { expect, test } from '../support/commands'

const screenshotDir = resolve(process.cwd(), 'docs/screenshots/apikeys-secure-col')

test.describe('API keys secure column screenshots', () => {
  test.skip(!process.env.CAPGO_PR_SCREENSHOTS, 'Set CAPGO_PR_SCREENSHOTS=1 for local PR screenshot capture')

  test.beforeAll(() => {
    mkdirSync(screenshotDir, { recursive: true })
  })

  test('capture before and after secure key cell', async ({ page }) => {
    await page.setViewportSize({ width: 1100, height: 360 })

    await page.goto(pathToFileURL(resolve(screenshotDir, 'before.html')).href)
    await expect(page.getByText('Secure key (hidden)')).toBeVisible()
    await page.screenshot({
      path: resolve(screenshotDir, 'before.png'),
      animations: 'disabled',
    })

    await page.goto(pathToFileURL(resolve(screenshotDir, 'after.html')).href)
    await expect(page.getByLabel('Secure key (hidden)')).toBeVisible()
    await page.screenshot({
      path: resolve(screenshotDir, 'after.png'),
      animations: 'disabled',
    })
  })
})
