import type { Page } from '@playwright/test'
import { expect, test } from '../support/commands'

async function createReadApiKey(page: Page, keyName: string) {
  await page.click('[data-test="create-key"]')
  await page.locator('#dialog-v2-content input[type="text"]').fill(keyName)
  await page.locator('#dialog-v2-content input[name="key-type"][value="read"]').check()
  await page.getByRole('button', { name: 'Create' }).click()
  await expect(page.locator('[data-test="toast"]')).toContainText('Added new API key successfully')
}

test.describe('API Key Management', () => {
  test.beforeEach(async ({ page }) => {
    // Login first
    await page.login('test@capgo.app', 'testtest')
    // Go to API keys page
    await page.goto('/apikeys')
  })

  test('should create new API key', async ({ page }) => {
    const keyName = `Playwright Read ${Date.now()}`

    await createReadApiKey(page, keyName)

    await expect(page.locator('tr', { hasText: keyName })).toHaveCount(1)
  })

  test('should delete API key', async ({ page }) => {
    const keyName = `Playwright Delete ${Date.now()}`

    await createReadApiKey(page, keyName)

    const keyRow = page.locator('tr', { hasText: keyName })
    await expect(keyRow).toHaveCount(1)

    await keyRow.locator('[data-test^="delete-key-"]').click()
    await page.getByRole('button', { name: 'Delete' }).click()

    const toast = page.locator('[data-test="toast"]')
    await expect(toast).toContainText('API key has been successfully deleted')
    await expect(page.locator('tr', { hasText: keyName })).toHaveCount(0)
  })
})
