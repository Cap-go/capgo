import { expect, test } from '../support/commands'

test.describe('Security Settings', () => {
  test.beforeEach(async ({ page }) => {
    // Login first
    await page.goto('/login/')
    await page.fill('[data-test="email"]', 'test@capgo.app')
    await page.fill('[data-test="password"]', 'testtest')
    await page.click('[data-test="submit"]')
    await page.waitForURL('/app/home')
    // Go to security settings page
    await page.goto('/app/package/security/')
  })

  test('should setup MFA', async ({ page }) => {
    await page.click('[data-test="setup-mfa"]')
    await expect(page.locator('[data-test="qr-code"]')).toBeVisible()
    await page.fill('[data-test="mfa-code"]', '123456')
    await page.click('[data-test="verify-mfa"]')
    await expect(page.locator('[data-test="form-success"]')).toContainText('MFA enabled')
  })

  test('should disable MFA', async ({ page }) => {
    await page.click('[data-test="disable-mfa"]')
    await page.fill('[data-test="mfa-code"]', '123456')
    await page.click('[data-test="confirm-disable"]')
    await expect(page.locator('[data-test="form-success"]')).toContainText('MFA disabled')
  })
})
