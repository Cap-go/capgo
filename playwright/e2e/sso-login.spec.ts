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

  test('should keep Back visible and tappable on mobile password step', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })

    const longEmail = 'avery.long.email.address.with-many-segments@very-long-example-domain-for-mobile-testing.example.com'
    await page.fill('[data-test="email"]', longEmail)
    await page.click('[data-test="continue"]')

    await expect(page.locator('[data-test="password"]')).toBeVisible({ timeout: 10000 })

    const backButton = page.locator('[data-test="back-to-email"]')
    await expect(backButton).toBeVisible()

    const selectedEmail = page.locator('[data-test="selected-email"]')
    await expect(selectedEmail).toHaveText(longEmail)

    const buttonBox = await backButton.boundingBox()
    const emailBox = await selectedEmail.boundingBox()
    expect(buttonBox?.height).toBeGreaterThanOrEqual(44)
    expect(emailBox?.y).toBeGreaterThan((buttonBox?.y ?? 0) + (buttonBox?.height ?? 0))
    expect((emailBox?.x ?? 0) + (emailBox?.width ?? 0)).toBeLessThanOrEqual(375)
    expect(emailBox?.height).toBeGreaterThan(32)

    await backButton.click()
    await expect(page.locator('[data-test="email"]')).toBeFocused()
  })
})
