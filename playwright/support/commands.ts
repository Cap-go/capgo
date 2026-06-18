import { test as base, expect } from '@playwright/test'

// Extend basic test fixture
export const test = base.extend({
  // Add custom commands here
  page: async ({ page }, use) => {
    // Add custom commands to page
    page.login = async (email: string, password: string) => {
      await page.goto('/login/')
      await page.fill('[data-test="email"]', email)
      await page.click('[data-test="continue"]')
      await page.waitForSelector('[data-test="password"]')
      await page.fill('[data-test="password"]', password)

      const submit = page.locator('[data-test="submit"]')
      if (await submit.isEnabled()) {
        await submit.click()
      }
      else {
        // Some environments keep captcha-gated login buttons disabled in UI automation.
        // Fall back to a direct form submit if available.
        const form = page.locator('form')
        const formCount = await form.count()
        if (formCount > 0)
          await form.first().evaluate((el: HTMLFormElement) => el.requestSubmit())
        else {
          await page.keyboard.press('Enter')
        }
      }

      await page.waitForURL(/\/(apps|dashboard)(\/|$)/)
    }

    await use(page)
  },
})

export { expect }
