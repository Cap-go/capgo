import { expect, test } from '../support/commands'

test.describe('API Key Management', () => {
  test.beforeEach(async ({ page }) => {
    // Login first
    await page.login('test@capgo.app', 'testtest')
    // Go to API keys page
    await page.goto('/dashboard/apikeys')
  })

  test('should create new API key', async ({ page }) => {
    await page.click('[data-test="create-key"]')
    await page.click('[data-test="read-button"]')
    const toast = page.locator('[data-test="toast"]')
    await expect(toast).toContainText('Added new API key successfully')
  })

  test('should delete API key', async ({ page }) => {
    await page.click('[data-test="delete-key"]')
    await page.click('[data-test="confirm-button"]')
    const toast = page.locator('[data-test="toast"]')
    await expect(toast).toContainText('API key has been successfully deleted')
  })
})
