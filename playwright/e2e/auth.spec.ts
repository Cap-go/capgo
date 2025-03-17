import { expect, test } from '../support/commands'

test.describe('Authentication', () => {
  test('should login successfully with demo account', async ({ page }) => {
    await page.login('test@capgo.app', 'testtest')
    await expect(page.locator('[data-test="user-menu"]')).toBeVisible()
  })

  test('should login successfully with admin account', async ({ page }) => {
    await page.login('admin@capgo.app', 'adminadmin')
    await expect(page.locator('[data-test="user-menu"]')).toBeVisible()
  })

  test('should show error with invalid credentials', async ({ page }) => {
    await page.goto('/login/')
    await page.fill('[data-test="email"]', 'wrong@example.com')
    await page.fill('[data-test="password"]', 'wrongpass')
    await page.click('[data-test="submit"]')
    await expect(page.locator('[data-test="error-message"]')).toBeVisible()
  })
})
