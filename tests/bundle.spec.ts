import { expect, test } from '@playwright/test'

const BASE_URL = 'http://localhost:5173'

test('test bundle', async ({ page }) => {
  // High timeout, because the first HTTP payload takes a while to load
  test.setTimeout(60_000)
  await page.goto(`${BASE_URL}/login`)

  // Fill in the username and password fields
  await page.fill('input[name="email"]', 'test@capgo.app')
  await page.fill('input[name="password"]', 'testtest')

  // Click the submit button
  await page.getByRole('button', { name: 'Log in' }).click()

  // Expect the URL to change to the logged in dashboard
  await expect(page).toHaveURL(`${BASE_URL}/app/home`)

  // Go to the production channel
  page.goto(`${BASE_URL}/app/p/com--demo--app/channel/22`)
  // eslint-disable-next-line n/prefer-global/process
  await expect(page.locator('.cursor-pointer > div:nth-child(1) > span:nth-child(1)')).toHaveText(process.env.BUNDLE!)
})
