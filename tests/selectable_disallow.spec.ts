import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { useSupabase } from './utils'

const BASE_URL = 'http://localhost:5173'

test('test selectable disallow (no AB)', async ({ page }) => {
  await page.goto(`${BASE_URL}/app/p/com--demo--app/channel/22`)

  // Click on 'settings'
  await page.click('li.mr-2:nth-child(4) > button:nth-child(1)')

  // Click on 'metadata'
  await page.locator('li.text-lg:nth-child(5) > label:nth-child(1) > div:nth-child(1) > div:nth-child(1) > div:nth-child(2) > select').selectOption({ value: 'version_number' })

  // Checks if the warning triggered
  await expect(page.locator('.k-ios > section:nth-child(4) > ol:nth-child(1) > li:nth-child(1) > div:nth-child(3) > div:nth-child(1)')).toContainText('Minimal update version')

  // At this stage the channel should be misconfigured
  await checkIfChannelIsValid('production', false, page)

  // Back to information page
  await page.goto(`${BASE_URL}/app/p/com--demo--app/channel/22`)

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

  // At this stage the channel should be configured properly
  await checkIfChannelIsValid('production', true, page)
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

  // At this stage both bundle A and B are the same. Bundle A should be undefined, same as bundle B
  // Let's check if this is true
  await checkIfChannelIsValid('no_access', false, page)

  // Back to information page
  await page.goto(`${BASE_URL}/app/p/com--demo--app/channel/23`)

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

  // We have to change bundle B, right now it points to the same bundle as bundle A
  // We could click on buttons, however this is not the scope of this test
  // We will use the supabase SDK authenticated as the user to change the bundle
  // We change this while on bundle A so that the next time we go to channel page we will see the change
  const supabase = await useSupabase()

  // Change the bundle
  const { error: bundleError } = await supabase
    .from('channels')
    .update({ secondVersion: 9601 })
    .eq('id', 23)

  // Check if this worked
  await expect(bundleError).toBeNull()

  // We still should have an "invalid channel" because bundle B metadat is still undefined
  await checkIfChannelIsValid('no_access', false, page)

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

  // At this stage the channel should be configured properly
  await checkIfChannelIsValid('no_access', true, page)
})

async function checkIfChannelIsValid(channel: string, valid: boolean, page: Page) {
  // Go to channels
  await page.goto(`${BASE_URL}/app/p/com--demo--app/channels`)

  // give this time to load
  await page.waitForTimeout(250)

  // Check if there is the error in the channels page (if testing if invalid)
  // Else if checking if valid the error should not be present
  // This creates a race conditions as some other test might cause a diffrent channel to be invalid
  // If this happens then this assertation will fail as the error is preaset but it was not caused by this test
  if (!valid)
    await expect(page.locator('#error-missconfig')).toBeVisible()
  else
    await expect(page.locator('#error-missconfig')).not.toBeVisible()

  // Get the channel selector
  const channelTable = await page.locator('table.w-full > tbody:nth-child(2)')
  const channelRows = await channelTable.getByRole('row').all()
  const rowLocator = channelRows.find(async el => (await el.innerHTML()).includes(channel))
  await expect(rowLocator).toBeDefined()

  // Now we get the 'misconfiguration' value
  const misconfigValue = await rowLocator!.locator('td:nth-child(4)')

  // Check if the value is 'yes'
  // If valid then misconfigured is 'no', else it is 'yes
  await expect(misconfigValue).toContainText(valid ? 'no' : 'yes')
}
