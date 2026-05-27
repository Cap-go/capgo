import type { Page } from '@playwright/test'
import { expect, test } from '../support/commands'

async function createRbacApiKey(page: Page, keyName: string) {
  await page.click('[data-test="create-key"]')
  const dialog = page.locator('#dialog-v2-content')
  await expect(dialog).toBeVisible()
  await dialog.locator('input[type="text"]').fill(keyName)
  await dialog.getByText('Read', { exact: true }).click()
  await expect(dialog.locator('input[name="key-type"][value="read"]')).toBeChecked()
  await page.getByRole('button', { name: 'Create' }).click()
  await expect(page.getByText('Added new API key successfully', { exact: true })).toBeVisible()
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

    await expect(page.getByText(keyName, { exact: true })).toBeVisible()
  })

  test('should delete API key', async ({ page }) => {
    const keyName = `Playwright Delete ${Date.now()}`

    await createRbacApiKey(page, keyName)

    const keyCell = page.getByText(keyName, { exact: true })
    await expect(keyCell).toBeVisible()
    const keyRow = keyCell.locator('xpath=ancestor::tr[1]')

    await keyRow.locator('[data-test^="delete-key-"]').click()
    await page.getByRole('button', { name: 'Delete' }).click()

    await expect(page.getByText('API key has been successfully deleted', { exact: true })).toBeVisible()
    await expect(page.getByText(keyName, { exact: true })).toHaveCount(0)
  })
})
