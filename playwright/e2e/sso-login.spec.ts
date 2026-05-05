import { expect, test } from '../support/commands'

test.describe('SSO Login Flow (Two-Step)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login/')
  })

  test('should show email step first (Step 1)', async ({ page }) => {
    await expect(page.locator('[data-test="email"]')).toBeVisible()
    await expect(page.locator('[data-test="continue"]')).toBeVisible()

    await expect(page.locator('[data-test="password"]')).not.toBeVisible()
    await expect(page.locator('[data-test="submit"]')).not.toBeVisible()
  })

  test('should show password field for non-SSO domain after Continue (Step 2)', async ({ page }) => {
    await page.fill('[data-test="email"]', 'test@example.com')
    await page.click('[data-test="continue"]')

    await expect(page.locator('[data-test="password"]')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('[data-test="submit"]')).toBeVisible()

    await expect(page.locator('[data-test="continue"]')).not.toBeVisible()
  })

  test('should return to Step 1 when clicking Back from password step', async ({ page }) => {
    await page.fill('[data-test="email"]', 'test@example.com')
    await page.click('[data-test="continue"]')

    await expect(page.locator('[data-test="password"]')).toBeVisible({ timeout: 10000 })

    await page.locator('[data-test="back-to-email"]').click()

    await expect(page.locator('[data-test="email"]')).toBeVisible()
    await expect(page.locator('[data-test="continue"]')).toBeVisible()
    await expect(page.locator('[data-test="password"]')).not.toBeVisible()
  })
})
