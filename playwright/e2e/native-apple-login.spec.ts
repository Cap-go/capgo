import { expect, test } from '@playwright/test'

test('web login never offers Apple even when the server enables native Apple login', async ({ page }) => {
  await page.route('**/private/config', route => route.fulfill({ json: { nativeAppleLoginEnabled: true } }))
  await page.goto('/login/')
  await expect(page.locator('[data-test="login-form"]')).toBeVisible()
  await expect(page.locator('[data-test="apple-sign-in"]')).toHaveCount(0)
  await expect(page.locator('[data-test="email"]')).toBeVisible()
  await page.route('**/private/sso/check-domain', route => route.fulfill({ json: { has_sso: false } }))
  await page.locator('[data-test="email"]').fill('preview@example.com')
  await expect(page.locator('[data-password-ready="true"]')).toBeVisible()
  await expect(page.locator('[data-test="password"]')).toBeVisible()
})
