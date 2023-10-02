import { expect, test } from '@playwright/test'

const BASE_URL = 'http://localhost:5173'

test('test selectable disallow no metadata warning', async ({ page }) => {
  await page.goto(`${BASE_URL}/app/p/com--demo--app/channel/22`)

  await page.click('li.mr-2:nth-child(4) > button:nth-child(1)')

  // Click on 'metadata'
  await page.locator('li.text-lg:nth-child(5) > label:nth-child(1) > div:nth-child(1) > div:nth-child(1) > div:nth-child(2) > select').selectOption({ value: 'version_number' })

  // Checks if the warning triggered
  await expect(page.locator('.k-ios > section:nth-child(4) > ol:nth-child(1) > li:nth-child(1) > div:nth-child(3) > div:nth-child(1)')).toContainText('Minimal update version')

  await page.waitForTimeout(10000)
})
