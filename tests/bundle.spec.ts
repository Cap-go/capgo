import { expect, test } from '@playwright/test'

test('test bundle', async ({ page }) => {
  await page.goto('http://localhost:5173/login')

  // Fill in the username and password fields
  await page.fill('input[name="email"]', 'test@capgo.app')
  await page.fill('input[name="password"]', 'testtest')

  // Click the submit button
  await page.getByRole('button', { name: 'Log in' }).click()

  // Expect the URL to change to the logged in dashboard
  await expect(page).toHaveURL('http://localhost:5173/app/home')

  // Go to the production channel
  page.goto('http://localhost:5173/app/p/com--demo--app/channel/22')
  // eslint-disable-next-line n/prefer-global/process
  await expect(page.locator('.cursor-pointer > div:nth-child(1) > span:nth-child(1)')).toHaveText(process.env.BUNDLE!)
})
