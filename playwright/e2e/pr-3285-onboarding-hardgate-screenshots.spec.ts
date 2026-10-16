import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, test } from '../support/commands'
import { dismissSupportPrompt } from '../support/dismissSupportPrompt'

const variant = process.env.CAPGO_PR3285_VARIANT === 'before' ? 'before' : 'after'
const screenshotDir = resolve(process.cwd(), '.github/pr-assets/3285')
const appId = process.env.CAPGO_PR3285_APP_ID ?? 'com.demo.app'
const testUserId = '6aa76066-55ef-4238-ade6-0b32334a4097'

async function dismissOptionalPrompts(page: import('@playwright/test').Page) {
  await dismissSupportPrompt(page)
  const remindLater = page.getByRole('button', { name: 'Remind me later', exact: true })
  if (await remindLater.isVisible().catch(() => false))
    await remindLater.click()
}

// Local: scripts/capture-pr-3285-screenshots.sh before|after
test.describe('PR 3285 onboarding hard-gate screenshots', () => {
  test.skip(!process.env.CAPGO_PR_SCREENSHOTS, 'Set CAPGO_PR_SCREENSHOTS=1 for local PR screenshot capture')

  test.beforeAll(() => {
    mkdirSync(screenshotDir, { recursive: true })
  })

  test(`capture ${variant} post-create sidebar hard-gate`, async ({ page }) => {
    await page.route('**/private/sso/check-enforcement', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ allowed: true }),
      })
    })

    await page.login('test@capgo.app', 'testtest')
    await page.goto(`/app/${encodeURIComponent(appId)}/getting-started`)
    await dismissOptionalPrompts(page)
    await expect(page.locator('#sidebar')).toBeVisible({ timeout: 30000 })

    if (variant === 'after') {
      await page.evaluate(({ userId, pendingAppId }) => {
        const raw = JSON.stringify({ userId, appId: pendingAppId })
        window.localStorage.setItem('capgo:onboarding-pending-first-upload', raw)
        window.sessionStorage.setItem('capgo:onboarding-pending-first-upload', raw)
      }, { userId: testUserId, pendingAppId: appId })
    }

    await page.locator('#sidebar').getByRole('button', { name: 'Dashboard', exact: true }).click()

    if (variant === 'after') {
      const dialogTitle = page.getByRole('heading', { name: 'Ship your first update?' })
      await expect(dialogTitle).toBeVisible({ timeout: 15000 })
      await page.screenshot({
        path: resolve(screenshotDir, 'after-post-create-hard-gate-dialog.png'),
        animations: 'disabled',
      })
      return
    }

    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15000 })
    await page.screenshot({
      path: resolve(screenshotDir, 'before-dashboard-without-hard-gate.png'),
      fullPage: false,
      animations: 'disabled',
    })
  })
})
