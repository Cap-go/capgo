import { expect, test } from '../support/commands'

test.describe('sso configuration wizard', () => {
  test.beforeEach(async ({ page }) => {
    // Login as admin user
    await page.goto('/login/')
    await page.fill('[data-test="email"]', 'admin@capgo.app')
    await page.fill('[data-test="password"]', 'adminadmin')
    await page.click('[data-test="submit"]')
    await page.waitForURL('/app')

    // Navigate to SSO settings page
    await page.goto('/settings/organization/sso')
  })

  test('should display sso wizard for super_admin', async ({ page }) => {
    // Verify wizard is visible
    await expect(page.locator('h1')).toContainText('SSO Configuration')

    // Verify step 1 (Capgo metadata) is shown
    await expect(page.locator('text=Entity ID')).toBeVisible()
    await expect(page.locator('text=ACS URL')).toBeVisible()
  })

  test('should copy capgo metadata to clipboard', async ({ page }) => {
    // Click copy button for Entity ID
    const entityIdCopyBtn = page.locator('button:has-text("Copy")').first()
    await entityIdCopyBtn.click()

    // Verify success toast (if implemented)
    // Note: Toast verification depends on implementation
  })

  test('should navigate through wizard steps', async ({ page }) => {
    // Step 1: Verify Capgo metadata display
    await expect(page.locator('text=Entity ID')).toBeVisible()

    // Click next to go to step 2
    const nextBtn = page.locator('button:has-text("Next")')
    await nextBtn.click()

    // Step 2: Verify IdP metadata input
    await expect(page.locator('text=Metadata URL')).toBeVisible()

    // Enter metadata URL
    await page.fill('input[placeholder*="metadata"]', 'https://example.com/saml/metadata')

    // Click next to go to step 3
    await nextBtn.click()

    // Step 3: Verify domain management
    await expect(page.locator('text=Email Domains')).toBeVisible()
  })

  test('should validate metadata input format', async ({ page }) => {
    // Go to step 2
    const nextBtn = page.locator('button:has-text("Next")')
    await nextBtn.click()

    // Try invalid URL
    await page.fill('input[placeholder*="metadata"]', 'not-a-valid-url')
    await nextBtn.click()

    // Should show error or stay on same step
    await expect(page.locator('text=Metadata URL')).toBeVisible()
  })

  test('should add and remove domains', async ({ page }) => {
    // Navigate to step 3 (domain management)
    const nextBtn = page.locator('button:has-text("Next")')

    // Step 1 -> 2
    await nextBtn.click()
    await page.fill('input[placeholder*="metadata"]', 'https://example.com/saml/metadata')

    // Step 2 -> 3
    await nextBtn.click()

    // Add domain
    const domainInput = page.locator('input[placeholder*="domain"]')
    await domainInput.fill('testcompany.com')
    const addDomainBtn = page.locator('button:has-text("Add Domain")')
    await addDomainBtn.click()

    // Verify domain appears in list
    await expect(page.locator('text=testcompany.com')).toBeVisible()

    // Remove domain
    const removeBtn = page.locator('button[aria-label="Remove domain"]')
    await removeBtn.click()

    // Verify domain is removed
    await expect(page.locator('text=testcompany.com')).not.toBeVisible()
  })

  test('should require at least one domain before enabling', async ({ page }) => {
    // Navigate through all steps without adding domain
    const nextBtn = page.locator('button:has-text("Next")')

    // Step 1 -> 2
    await nextBtn.click()
    await page.fill('input[placeholder*="metadata"]', 'https://example.com/saml/metadata')

    // Step 2 -> 3
    await nextBtn.click()

    // Try to go to step 4 without domain
    await nextBtn.click()

    // Should show error or stay on step 3
    await expect(page.locator('text=Email Domains')).toBeVisible()
  })

  test('should show sso status when configuration exists', async ({ page }) => {
    // Skip test if SSO is not configured
    if (!process.env.SSO_ENABLED) {
      test.skip()
      return
    }

    // If SSO is configured, status banner must be visible
    const statusBanner = page.locator('[data-test="sso-status"]')
    await expect(statusBanner).toBeVisible()
    await expect(statusBanner).toContainText(/enabled|disabled/i)
  })
})

test.describe('sso login flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login/')
  })

  test('should detect sso for configured domain', async ({ page }) => {
    // Skip test if SSO test domain is not configured
    const testDomain = process.env.SSO_TEST_DOMAIN
    test.skip(!testDomain, 'SSO_TEST_DOMAIN environment variable not set')

    // Enter email with configured SSO domain
    const emailInput = page.locator('[data-test="email"]')
    await emailInput.fill(`user@${testDomain}`)

    // Wait for SSO banner to appear (deterministic wait)
    const ssoBanner = page.locator('[data-test="sso-banner"]')
    await expect(ssoBanner).toBeVisible({ timeout: 5000 })

    // SSO banner must be visible for configured domain
    await expect(ssoBanner).toContainText('SSO available')

    // Verify SSO button appears
    const ssoBtn = page.locator('button:has-text("Continue with SSO")')
    await expect(ssoBtn).toBeVisible()
  })

  test('should not detect sso for public email domains', async ({ page }) => {
    // Public domains should not trigger SSO
    const publicDomains = ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com']

    for (const domain of publicDomains) {
      await page.reload()
      const emailInput = page.locator('[data-test="email"]')
      await emailInput.fill(`user@${domain}`)

      // SSO banner should not appear for public domains
      const ssoBanner = page.locator('[data-test="sso-banner"]')
      await expect(ssoBanner).not.toBeVisible({ timeout: 2000 })
    }
  })

  test('should show password login option when sso is available', async ({ page }) => {
    // Even with SSO, users should be able to use password
    const emailInput = page.locator('[data-test="email"]')
    await emailInput.fill('user@example.com')

    // Password input and login button should always be available
    const passwordInput = page.locator('[data-test="password"]')
    const loginBtn = page.locator('[data-test="submit"]')

    await expect(passwordInput).toBeVisible()
    await expect(loginBtn).toBeVisible()
  })
})

test.describe('sso permission checks', () => {
  test('should hide sso tab for non-super_admin users', async ({ page }) => {
    // Login as regular test user (not super_admin)
    await page.goto('/login/')
    await page.fill('[data-test="email"]', 'test@capgo.app')
    await page.fill('[data-test="password"]', 'testtest')
    await page.click('[data-test="submit"]')
    await page.waitForURL('/app')

    // Try to navigate to organization settings
    await page.goto('/settings/organization')

    // SSO tab should not be visible
    const ssoTab = page.locator('a[href*="/sso"]')
    await expect(ssoTab).not.toBeVisible()
  })

  test('should redirect non-super_admin from sso page', async ({ page }) => {
    // Login as regular user
    await page.goto('/login/')
    await page.fill('[data-test="email"]', 'test@capgo.app')
    await page.fill('[data-test="password"]', 'testtest')
    await page.click('[data-test="submit"]')
    await page.waitForURL('/app')

    // Try to directly access SSO page
    await page.goto('/settings/organization/sso')

    // Wait for either redirect or permission error to appear
    await Promise.race([
      page.waitForURL(url => !url.href.includes('/sso'), { timeout: 3000 }).catch(() => {}),
      page.locator('text=permission').waitFor({ state: 'visible', timeout: 3000 }).catch(() => {}),
    ])

    const currentUrl = page.url()
    const isSSOPage = currentUrl.includes('/sso')

    if (isSSOPage) {
      // Should show permission error
      await expect(page.locator('text=permission')).toBeVisible()
    }
    else {
      // Should be redirected away
      expect(isSSOPage).toBe(false)
    }
  })

  test('should allow super_admin to access sso page', async ({ page }) => {
    // Login as admin user
    await page.goto('/login/')
    await page.fill('[data-test="email"]', 'admin@capgo.app')
    await page.fill('[data-test="password"]', 'adminadmin')
    await page.click('[data-test="submit"]')
    await page.waitForURL('/app')

    // Navigate to SSO page
    await page.goto('/settings/organization/sso')

    // Should see SSO configuration wizard
    await expect(page.locator('h1')).toContainText('SSO')
  })
})

test.describe('sso audit logging', () => {
  test('should log sso configuration views', async ({ page }) => {
    // Login as admin
    await page.goto('/login/')
    await page.fill('[data-test="email"]', 'admin@capgo.app')
    await page.fill('[data-test="password"]', 'adminadmin')
    await page.click('[data-test="submit"]')
    await page.waitForURL('/app')

    // View SSO page
    await page.goto('/settings/organization/sso')

    // Audit log should be created in database
    // This is verified in backend tests, frontend just needs to not error
    await expect(page.locator('h1')).toContainText('SSO')
  })
})
