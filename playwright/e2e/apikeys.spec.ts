import { expect, test } from '../support/commands'

test.describe('API Key Management', () => {
  test.beforeEach(async ({ page }) => {
    // Login first
    await page.goto('/login/')
    await page.fill('[data-test="email"]', 'test@capgo.app')
    await page.fill('[data-test="password"]', 'testtest')
    await page.click('[data-test="submit"]')
    await page.waitForURL('/app/home')
    // Go to API keys page
    await page.goto('/app/package/apikeys/')
  })

  test('should create new API key', async ({ page }) => {
    await page.click('[data-test="create-key"]')
    await page.click('[data-test="key-type-read"]')
    await page.click('[data-test="submit-key"]')
    await expect(page.locator('[data-test="api-key"]')).toBeVisible()
    await expect(page.locator('[data-test="form-success"]')).toContainText('API key created')
  })

  test('should delete API key', async ({ page }) => {
    await page.click('[data-test="delete-key"]')
    await page.click('[data-test="confirm-delete"]')
    await expect(page.locator('[data-test="form-success"]')).toContainText('API key deleted')
  })
})
