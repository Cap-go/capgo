import { expect, test } from '@playwright/test'

const BASE_URL = 'http://localhost:5173'

test('test selectable disallow (no AB)', async ({ page }) => {
  await page.goto(`${BASE_URL}/app/p/com--demo--app/channel/22`)

  // Click on 'settings'
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
  const inputValue = await page.$eval('input.block', el => (<HTMLInputElement>el).value)
  await expect(inputValue).toBeDefined()
  await expect(inputValue).toBe('')

  // Type 'invalid' into the min version input and check if the warning is present
  await page.type('input.block', 'invalid', { delay: 50 })
  await expect(page.locator('.k-ios > section:nth-child(4) > ol:nth-child(1) > li:nth-child(1) > div:nth-child(3) > div:nth-child(1)')).toContainText('Invalid semver version')

  // Clear the input and check if value was saved sucessfully
  await page.fill('input.block', '')
  await expect(page.locator('.k-ios > section:nth-child(4) > ol:nth-child(1) > li:nth-child(1) > div:nth-child(3) > div:nth-child(1)')).toContainText('Updated minimal version')

  // Type '1.0.0' and check if value was saved sucessfully
  await page.type('input.block', '1.0.0', { delay: 50 })
  await expect(page.locator('.k-ios > section:nth-child(4) > ol:nth-child(1) > li:nth-child(1) > div:nth-child(3) > div:nth-child(1)')).toContainText('Updated minimal version')
})

test('test selectable disallow (with AB)', async ({ page }) => {
  await page.goto(`${BASE_URL}/app/p/com--demo--app/channel/23`)

  // Click on 'settings'
  await page.click('li.mr-2:nth-child(4) > button:nth-child(1)')

  // Enable AB testing
  await page.click('li.text-lg:nth-child(9) > label:nth-child(1) > div:nth-child(1) > div:nth-child(1) > div:nth-child(2) > div:nth-child(1)')

  // Check if AB was enabled sucessfully
  await expect(page.locator('.k-ios > section:nth-child(4) > ol:nth-child(1) > li:nth-child(1) > div:nth-child(3) > div:nth-child(1)')).toContainText('Enabled AB testing')

  // Click on 'metadata'
  await page.locator('li.text-lg:nth-child(5) > label:nth-child(1) > div:nth-child(1) > div:nth-child(1) > div:nth-child(2) > select').selectOption({ value: 'version_number' })

  // Checks if the warning triggered
  await expect(page.locator('.k-ios > section:nth-child(4) > ol:nth-child(1) > li:nth-child(1) > div:nth-child(3) > div:nth-child(1)')).toContainText('Minimal update version')

  // Back to information page
  await page.click('li.mr-2:nth-child(1) > button:nth-child(1)')

  // Check if the 'minimal update version' is present for both A and B bundle
  // Bundle A
  await expect(page.locator('div.px-4:nth-child(4) > dt:nth-child(1)')).toContainText('Minimal update version A')
  await expect(page.locator('div.px-4:nth-child(4) > dd:nth-child(2) > div:nth-child(1) > span:nth-child(1)')).toContainText('Undefined')

  // Bundle B
  await expect(page.locator('div.px-4:nth-child(5) > dt:nth-child(1)')).toContainText('Minimal update version B')
  await expect(page.locator('div.px-4:nth-child(5) > dd:nth-child(2) > div:nth-child(1) > span:nth-child(1)')).toContainText('Undefined')

  // Go to bundle A
  await page.click('.cursor-pointer > div:nth-child(1) > span:nth-child(1)')

  // Check if the 'Minimal update version' is present
  await expect(page.locator('div.px-4:nth-child(6) > dt:nth-child(1)')).toContainText('Minimal update version')

  // Check if the input is empty
  const inputValue = await page.$eval('input.block', el => (<HTMLInputElement>el).value)
  await expect(inputValue).toBeDefined()
  await expect(inputValue).toBe('')

  // Fill with '1.0.1' and check if value was saved sucessfully
  // Here we do not test for fails, we have the upper test for that
  await page.type('input.block', '1.0.1', { delay: 50 })
  await expect(page.locator('.k-ios > section:nth-child(4) > ol:nth-child(1) > li:nth-child(1) > div:nth-child(3) > div:nth-child(1)')).toContainText('Updated minimal version')

  // Go back to channel page
  await page.goto(`${BASE_URL}/app/p/com--demo--app/channel/23`)

  // Check if the A bundle is '1.0.1'
  await expect(page.locator('div.px-4:nth-child(4) > dd:nth-child(2) > div:nth-child(1) > span:nth-child(1)')).toContainText('1.0.1')

  // Go to bundle B
  // For now this fails, bundle B is the same bundle as bundle A
  await page.click('div.px-4:nth-child(3) > dd:nth-child(2) > div:nth-child(1) > span:nth-child(1)')

  // Check if the 'Minimal update version' is present
  await expect(page.locator('div.px-4:nth-child(6) > dt:nth-child(1)')).toContainText('Minimal update version')

  // Check if the input is empty
  const inputValue2 = await page.$eval('input.block', el => (<HTMLInputElement>el).value)
  await expect(inputValue2).toBeDefined()
  await expect(inputValue2).toBe('')

  // Type 1.0.2 into the input
  await page.type('input.block', '1.0.2', { delay: 50 })
  await expect(page.locator('.k-ios > section:nth-child(4) > ol:nth-child(1) > li:nth-child(1) > div:nth-child(3) > div:nth-child(1)')).toContainText('Updated minimal version')

  // Go back to channel page
  await page.goto(`${BASE_URL}/app/p/com--demo--app/channel/23`)

  // Check if the B bundle is '1.0.2'
  await expect(page.locator('div.px-4:nth-child(5) > dd:nth-child(2) > div:nth-child(1) > span:nth-child(1)')).toContainText('1.0.2')
})
