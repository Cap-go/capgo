import { expect, test } from '../support/commands'

test.describe('Registration', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/register/')
  })

  test('should redirect new users to org onboarding until the org is created', async ({ page }) => {
    const uniqueSuffix = Date.now()
    const email = `no-org-e2e-${uniqueSuffix}@example.com`

    await page.fill('[data-test="email"]', email)
    await page.fill('[data-test="first_name"]', 'No')
    await page.fill('[data-test="last_name"]', 'Org')
    await page.fill('[data-test="password"]', 'Password123!')
    await page.fill('[data-test="confirm-password"]', 'Password123!')
    await page.click('[data-test="submit"]')

    await page.waitForURL(/\/onboarding\/organization/)
    await page.goto('/apps')
    await page.waitForURL(/\/onboarding\/organization/)

    await page.click('[data-test="onboarding-mode-name"]')
    await page.fill('[data-test="onboarding-org-name"]', `No Org E2E ${uniqueSuffix}`)
    await page.click('[data-test="onboarding-create-org"]')

    await page.waitForURL(/step=logo/)
    await page.click('[data-test="onboarding-skip-logo"]')

    await page.waitForURL(/step=invite/)
    await page.click('[data-test="onboarding-finish"]')
    await page.waitForURL('/apps')
  })

  test('should show error for existing email', async ({ page }) => {
    await page.fill('[data-test="email"]', 'test@capgo.app')
    await page.fill('[data-test="first_name"]', 'Test')
    await page.fill('[data-test="last_name"]', 'User')
    await page.fill('[data-test="password"]', 'Password123!')
    await page.fill('[data-test="confirm-password"]', 'Password123!')
    await page.click('[data-test="submit"]')
    await expect(page.locator('[data-test="form-error"]')).toContainText('User already registered')
  })

  test('should show error for deleted account email', async ({ page }) => {
    await page.fill('[data-test="email"]', 'deleted@capgo.app')
    await page.fill('[data-test="first_name"]', 'Test')
    await page.fill('[data-test="last_name"]', 'User')
    await page.fill('[data-test="password"]', 'Password123!')
    await page.fill('[data-test="confirm-password"]', 'Password123!')
    await page.click('[data-test="submit"]')
    await expect(page.locator('[data-test="form-error"]')).toContainText('Account with this email used to exist, cannot recreate')
  })

  test('should show error for password mismatch', async ({ page }) => {
    await page.fill('[data-test="email"]', 'new@example.com')
    await page.fill('[data-test="first_name"]', 'Test')
    await page.fill('[data-test="last_name"]', 'User')
    await page.fill('[data-test="password"]', 'Password123!')
    await page.fill('[data-test="confirm-password"]', 'Password456!')
    await page.click('[data-test="submit"]')
    await expect(page.locator('.formkit-messages [data-message-type="validation"]')).toContainText('Password confirmation does not match')
  })
})
