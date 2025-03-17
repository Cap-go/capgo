import { test as base, expect } from '@playwright/test'

// Extend basic test fixture
export const test = base.extend({
  // Add custom fixtures here
  page: async ({ page }, use) => {
    // Add custom commands to page
    page.login = async (email: string, password: string) => {
      await page.goto('/login/')
      await page.fill('[data-test="email"]', email)
      await page.fill('[data-test="password"]', password)
      await page.click('[data-test="submit"]')
      await page.waitForURL('/app/home')
    }

    await use(page)
  },
})

export { expect }
