import { expect, test } from '../support/commands'

test.describe('API Key Management', () => {
  test.beforeEach(async ({ page }) => {
    // Login first
    await page.login('test@capgo.app', 'testtest')
    // Go to API keys page
    await page.goto('/dashboard/apikeys')
  })

  test.only('should create new API key', async ({ page }) => {
    await page.click('[data-test="create-key"]')
    await page.click('[data-test="read-button"]')
    await page.click('[data-test="confirm-button"]')
    await page.waitForSelector('[data-sonner-toast] [data-content]', { timeout: 10000 })
    const toastContent = page.locator('[data-sonner-toast] [data-content]')
    await expect(toastContent).toBeVisible()
    await expect(toastContent).toHaveText('Added new API key successfully')
  })

  test('should delete API key', async ({ page }) => {
    await page.click('[data-test="delete-key"]')
    await page.click('[data-test="confirm-button"]')
    await page.waitForSelector('[data-sonner-toast] [data-content]')
    await expect(page.locator('[data-sonner-toast] [data-content]')).toContainText('API key has been successfully deleted')
  })
})
