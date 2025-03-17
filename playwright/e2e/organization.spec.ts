import { expect, test } from '../support/commands'

test.describe('Organization Management', () => {
  test.beforeEach(async ({ page }) => {
    // Login first
    await page.goto('/login/')
    await page.fill('[data-test="email"]', 'test@capgo.app')
    await page.fill('[data-test="password"]', 'testtest')
    await page.click('[data-test="submit"]')
    await page.waitForURL('/app/home')
    // Go to org management page
    await page.goto('/app/package/organization/')
  })

  test('should invite user to organization', async ({ page }) => {
    await page.click('[data-test="invite-user"]')
    await page.fill('[data-test="invite-email"]', 'newuser@example.com')
    await page.selectOption('[data-test="invite-role"]', 'admin')
    await page.click('[data-test="send-invite"]')
    await expect(page.locator('[data-test="form-success"]')).toContainText('Invitation sent')
  })

  test('should change user role', async ({ page }) => {
    await page.click('[data-test="user-role"]')
    await page.selectOption('[data-test="role-select"]', 'admin')
    await page.click('[data-test="save-role"]')
    await expect(page.locator('[data-test="form-success"]')).toContainText('Role updated')
  })

  test('should remove user from organization', async ({ page }) => {
    await page.click('[data-test="remove-user"]')
    await page.click('[data-test="confirm-remove"]')
    await expect(page.locator('[data-test="form-success"]')).toContainText('User removed')
  })
})
