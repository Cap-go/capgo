import { expect, test } from '@playwright/test'

const BASE_URL = 'http://localhost:5173'

test('test selectable disallow no metadata warning', async ({ page }) => {
  await page.goto(`${BASE_URL}/app/p/com--demo--app/channel/22`)

  await page.click('li.mr-2:nth-child(4) > button:nth-child(1)')

  // Click on 'metadata'
  await page.locator('li.text-lg:nth-child(5) > label:nth-child(1) > div:nth-child(1) > div:nth-child(1) > div:nth-child(2) > select').selectOption({ value: 'version_number' })

  // Checks if the warning triggered
  await expect(page.locator('.k-ios > section:nth-child(4) > ol:nth-child(1) > li:nth-child(1) > div:nth-child(3) > div:nth-child(1)')).toContainText('Minimal update version')

  // Back to information page
  await page.click('li.mr-2:nth-child(1) > button:nth-child(1)')

  // Check if the 'minimal update version' is present
  await expect(page.locator('div.px-4:nth-child(3) > dt:nth-child(1)')).toContainText('Minimal update version')
  await expect(page.locator('div.px-4:nth-child(3) > dd:nth-child(2) > div:nth-child(1) > span:nth-child(1)')).toContainText('Undefined')

  // Go to the channel bundle
  await page.click('.cursor-pointer > div:nth-child(1) > span:nth-child(1)')

  // Check if the 'Minimal update version' is present
  await expect(page.locator('div.px-4:nth-child(6) > dt:nth-child(1)')).toContainText('Minimal update version')

  // Check if the input is empty
  // input.block
})
