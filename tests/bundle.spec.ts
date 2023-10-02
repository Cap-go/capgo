import { expect, test } from '@playwright/test'

const BASE_URL = 'http://localhost:5173'

test('test bundle', async ({ page }) => {
  // Go to the production channel
  page.goto(`${BASE_URL}/app/p/com--demo--app/channel/22`)
  // eslint-disable-next-line n/prefer-global/process
  await expect(page.locator('.cursor-pointer > div:nth-child(1) > span:nth-child(1)')).toHaveText(process.env.BUNDLE!, { timeout: 60_000 })
})
