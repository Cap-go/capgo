import type { Page } from '@playwright/test'
import { expect, test } from '../support/commands'

test.use({ screenshot: 'off', trace: 'off', video: 'off' })

async function openCreateKeyDialog(page: Page) {
  await page.click('[data-test="create-key"]')
  const dialog = page.locator('#dialog-v2-content')
  await expect(dialog.locator('input[name="key-type"]')).toHaveCount(0)
  await expect(dialog.locator('[data-test="create-key-org-role-org_member"]')).toBeChecked()
  return dialog
}

async function createRbacApiKey(page: Page, keyName: string) {
  const dialog = await openCreateKeyDialog(page)
  await dialog.locator('input[type="text"]').fill(keyName)
  await page.getByRole('button', { name: 'Create' }).click()
  await expect(page.getByText('Added new API key successfully').first()).toBeVisible()
  await expect(page.locator('tr', { hasText: keyName })).toHaveCount(1)
  await expect(page.locator('tr', { hasText: keyName })).toContainText('Member')
}

async function createDemoAppApiKey(page: Page, keyName: string) {
  const dialog = await openCreateKeyDialog(page)
  await dialog.locator('input[type="text"]').fill(keyName)

  await dialog.locator('[data-test="create-key-add-app"]').click()
  const demoAppOption = dialog.locator('label', { hasText: 'com.demo.app' }).first()
  await expect(demoAppOption).toBeVisible()
  await demoAppOption.locator('[data-test="create-key-app-checkbox"]').check()

  const selectedApp = dialog.locator('[data-test="create-key-selected-app"]', { hasText: 'Demo app' }).first()
  await expect(selectedApp).toBeVisible()
  await selectedApp.locator('[data-test="create-key-app-role-select"]').selectOption('app_developer')
  await page.mouse.click(5, 5)
  await expect(dialog.locator('.fixed.inset-0.z-10')).toHaveCount(0)

  await page.getByRole('button', { name: 'Create' }).click()
  await expect(page.getByText('Added new API key successfully').first()).toBeVisible()
  await expect(page.locator('tr', { hasText: keyName })).toHaveCount(1)
  return page.locator('tr', { hasText: keyName })
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

  test('should select all manageable organizations by default with member role', async ({ page }) => {
    const dialog = await openCreateKeyDialog(page)

    await dialog.locator('[data-test="create-key-org-dropdown"]').click()
    const orgCheckboxes = dialog.locator('[data-test="create-key-org-checkbox"]:not(:disabled)')
    await expect(orgCheckboxes.first()).toBeVisible()

    const orgCount = await orgCheckboxes.count()
    expect(orgCount).toBeGreaterThan(0)
    for (let index = 0; index < orgCount; index++) {
      await expect(orgCheckboxes.nth(index)).toBeChecked()
    }

    await page.mouse.click(5, 5)
    await page.getByRole('button', { name: 'Cancel' }).click()
  })

  test('should configure app-level role bindings in the create dialog', async ({ page }) => {
    const dialog = await openCreateKeyDialog(page)

    await dialog.locator('[data-test="create-key-add-app"]').click()
    const appCheckboxes = dialog.locator('[data-test="create-key-app-checkbox"]')
    await expect(appCheckboxes.first()).toBeVisible()
    await appCheckboxes.first().check()

    const selectedApp = dialog.locator('[data-test="create-key-selected-app"]').first()
    await expect(selectedApp).toBeVisible()
    const roleSelect = selectedApp.locator('[data-test="create-key-app-role-select"]')
    await roleSelect.selectOption('app_reader')
    await expect(roleSelect).toHaveValue('app_reader')

    await page.mouse.click(5, 5)
    await page.getByRole('button', { name: 'Cancel' }).click()
  })

  test('should manage channel permission overrides for app-scoped API keys', async ({ page }) => {
    const keyName = `Playwright Channel ${Date.now()}`
    const keyRow = await createDemoAppApiKey(page, keyName)

    await keyRow.locator('[data-test^="manage-key-channel-permissions-"]').click()
    const panel = page.locator('[data-test="channel-permissions-panel"]')
    await expect(panel).toBeVisible()

    const appSelect = page.locator('[data-test="apikey-channel-permissions-app-select"]')
    await expect(appSelect).toContainText('Demo app')

    const promoteSelect = panel.locator('[data-test="channel-permission-select"][data-permission-key="channel.promote_bundle"]').first()
    await expect(promoteSelect).toBeVisible()
    const channelId = Number(await promoteSelect.getAttribute('data-channel-id'))
    expect(channelId).toBeGreaterThan(0)

    await promoteSelect.selectOption('deny')
    await expect(promoteSelect).toHaveValue('deny')
    await expect(promoteSelect).toBeEnabled()

    await page.getByRole('button', { name: 'Close', exact: true }).click()
    await keyRow.locator('[data-test^="manage-key-channel-permissions-"]').click()
    const reopenedPromoteSelect = page
      .locator(`[data-test="channel-permissions-panel"] [data-test="channel-permission-select"][data-permission-key="channel.promote_bundle"][data-channel-id="${channelId}"]`)
      .first()
    await expect(reopenedPromoteSelect).toHaveValue('deny')
    await page.getByRole('button', { name: 'Close', exact: true }).click()
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
