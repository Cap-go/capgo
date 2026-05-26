import type { Page } from '@playwright/test'
import { expect, test } from '../support/commands'

test.use({ screenshot: 'off', trace: 'off', video: 'off' })

async function createRbacApiKey(page: Page, keyName: string) {
  await page.click('[data-test="create-key"]')
  const dialog = page.locator('#dialog-v2-content')
  await expect(dialog.locator('input[name="key-type"]')).toHaveCount(0)
  await dialog.locator('input[type="text"]').fill(keyName)
  await page.getByRole('button', { name: 'Create' }).click()
  await expect(page.getByText('Added new API key successfully').first()).toBeVisible()
  await expect(page.locator('tr', { hasText: keyName })).toHaveCount(1)
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

    await createRbacApiKey(page, keyName)
  })

  test('should delete API key', async ({ page }) => {
    const keyName = `Playwright Delete ${Date.now()}`

    await createRbacApiKey(page, keyName)

    const keyRow = page.locator('tr', { hasText: keyName })
    await expect(keyRow).toHaveCount(1)

    await keyRow.locator('[data-test^="delete-key-"]').click()
    await page.getByRole('button', { name: 'Delete' }).click()

    const toast = page.locator('[data-test="toast"]')
    await expect(toast).toContainText('API key has been successfully deleted')
    await expect(page.locator('tr', { hasText: keyName })).toHaveCount(0)
  })
})
