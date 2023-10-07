import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { BASE_URL, beforeEachTest, useSupabase } from './utils'

test.beforeEach(beforeEachTest)

test('test selectable disallow (no AB)', async ({ page }) => {
  await goto(page, `${BASE_URL}/app/p/com--demo--app/channel/22`)

  // Click on 'settings'
  await page.click('li.mr-2:nth-child(4) > button:nth-child(1)')

  // Click on 'metadata'
  await page.locator('#selectableDisallow').selectOption({ value: 'version_number' })

  // Checks if the warning triggered
  await expectPopout(page, 'Minimal update version')

  // At this stage the channel should be misconfigured
  await checkIfChannelIsValid('production', false, page)

  // Back to information page
  await goto(page, `${BASE_URL}/app/p/com--demo--app/channel/22`)

  // Check if the 'minimal update version' is present
  await expect(page.locator('div.px-4:nth-child(3) > dt:nth-child(1)')).toContainText('Minimal update version')
  await expect(page.locator('div.px-4:nth-child(3) > dd:nth-child(2) > div:nth-child(1) > span:nth-child(1)')).toContainText('Undefined')

  // Go to the channel bundle
  await page.click('.cursor-pointer > div:nth-child(1) > span:nth-child(1)')

  // Wait for url change
  await page.waitForURL('**')

  // Check if the 'Minimal update version' is present
  await expect(page.locator('div.px-4:nth-child(6) > dt:nth-child(1)')).toContainText('Minimal update version')

  // Check if the input is empty
  const inputValue = await page.$eval('input.block', el => (<HTMLInputElement>el).value)
  await expect(inputValue).toBeDefined()
  await expect(inputValue).toBe('')

  // Type 'invalid' into the min version input and check if the warning is present
  await page.fill('input.block', 'invalid')
  await expectPopout(page, 'Invalid semver version')

  // Clear the input and check if value was saved sucessfully
  await page.fill('input.block', '')
  await expectPopout(page, 'Updated minimal version')

  // Type '1.0.0' and check if value was saved sucessfully
  await page.fill('input.block', '1.0.0')
  await expectPopout(page, 'Updated minimal version')

  // At this stage the channel should be configured properly
  await checkIfChannelIsValid('production', true, page)
})

test('test selectable disallow (with AB)', async ({ page }) => {
  // Get supabase (auth + create client)
  const supabase = await useSupabase()

  // Prepare test
  const { error: bundleErrorPrepare } = await supabase
    .from('channels')
    .update({ version: 9652 })
    .eq('id', 23)

  await expect(bundleErrorPrepare).toBeNull()

  // Allow the router to load
  await page.goto(`${BASE_URL}/`)
  await page.waitForTimeout(START_TIMEOUT)

  await goto(page, `${BASE_URL}/app/p/com--demo--app/channel/23`)

  // Click on 'settings'
  await page.click('li.mr-2:nth-child(4) > button:nth-child(1)')

  // Enable AB testing
  await page.click('li.text-lg:nth-child(9) > label:nth-child(1) > div:nth-child(1) > div:nth-child(1) > div:nth-child(2) > div:nth-child(1)')

  // Check if AB was enabled sucessfully
  await expectPopout(page, 'Enabled AB testing')

  // Click on 'metadata'
  await page.locator('#selectableDisallow').selectOption({ value: 'version_number' })

  // Checks if the warning triggered
  await expectPopout(page, 'Minimal update version')

  // At this stage both bundle A and B are the same. Bundle A should be undefined, same as bundle B
  // Let's check if this is true
  await checkIfChannelIsValid('no_access', false, page)

  // Back to information page
  await goto(page, `${BASE_URL}/app/p/com--demo--app/channel/23`)

  // Check if the 'minimal update version' is present for both A and B bundle
  // Bundle A
  await expect(page.locator('div.px-4:nth-child(4) > dt:nth-child(1)')).toContainText('Minimal update version A')
  await expect(page.locator('div.px-4:nth-child(4) > dd:nth-child(2) > div:nth-child(1) > span:nth-child(1)')).toContainText('Undefined', { timeout: 20_000 })

  // Bundle B
  await expect(page.locator('div.px-4:nth-child(5) > dt:nth-child(1)')).toContainText('Minimal update version B')
  await expect(page.locator('div.px-4:nth-child(5) > dd:nth-child(2) > div:nth-child(1) > span:nth-child(1)')).toContainText('Undefined')

  // Go to bundle A
  // This?
  await page.click('.cursor-pointer > div:nth-child(1) > span:nth-child(1)')

  // Check if the 'Minimal update version' is present
  await expect(page.locator('div.px-4:nth-child(6) > dt:nth-child(1)')).toContainText('Minimal update version')

  // Check if the input is empty
  const inputValue = await page.$eval('input.block', el => (<HTMLInputElement>el).value)
  await expect(inputValue).toBeDefined()
  await expect(inputValue).toBe('')

  // Fill with '1.0.1' and check if value was saved sucessfully
  // Here we do not test for fails, we have the upper test for that
  await page.fill('input.block', '1.0.1')
  await expectPopout(page, 'Updated minimal version')

  // We have to change bundle B, right now it points to the same bundle as bundle A
  // We could click on buttons, however this is not the scope of this test
  // We will use the supabase SDK authenticated as the user to change the bundle
  // We change this while on bundle A so that the next time we go to channel page we will see the change

  // Change the second bundle
  const { error: bundleError } = await supabase
    .from('channels')
    .update({ secondVersion: 9653 })
    .eq('id', 23)

  // Check if this worked
  await expect(bundleError).toBeNull()

  // We still should have an "invalid channel" because bundle B metadat is still undefined
  await checkIfChannelIsValid('no_access', false, page)

  // Go back to channel page
  await goto(page, `${BASE_URL}/app/p/com--demo--app/channel/23`)

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
  await page.fill('input.block', '1.0.2')
  await expectPopout(page, 'Updated minimal version')

  // Go back to channel page
  await goto(page, `${BASE_URL}/app/p/com--demo--app/channel/23`)

  // Check if the B bundle is '1.0.2'
  await expect(page.locator('div.px-4:nth-child(5) > dd:nth-child(2) > div:nth-child(1) > span:nth-child(1)')).toContainText('1.0.2')

  // At this stage the channel should be configured properly
  await checkIfChannelIsValid('no_access', true, page)
})

async function checkIfChannelIsValid(channel: string, valid: boolean, page: Page) {
  // Go to channels
  await goto(page, `${BASE_URL}/app/p/com--demo--app/channels`)

  // give this time to load
  await page.waitForTimeout(500)

  // Get all channels and the values (check if failing + name)
  const channelTable = await page.locator('table.w-full > tbody:nth-child(2)')
  const channelRows = await channelTable.getByRole('row').all()
  const failingChannels = await Promise.all(channelRows
    .map(async (el) => {
      const name = await el.locator('th:nth-child(1)').innerHTML()
      const failing = await el.locator('td:nth-child(4)').innerHTML()

      return {
        name,
        failing,
      }
    }),
  )

  // If the channel is not valid, check if the error should be visible
  const errorLocator = page.locator('#error-missconfig')
  const errorVisible = await errorLocator.isVisible()
  if (!valid) {
    // toBeVisible has a wait, errorVisible is just the value for the current moment
    // It might take a while for this error to show
    await expect(errorLocator).toBeVisible()
  }
  else {
    // The error might be visible becouse a diffrent channel is misconfigured, in tcase we should have at least one failing channel
    if (errorVisible) {
      const otherFails = failingChannels.filter(el => el.name !== channel && el.failing === 'yes')
      expect(otherFails.length).toBeGreaterThan(0)
    }
  }

  // If valid then misconfigured is 'no', else it is 'yes
  await expect(failingChannels.find(el => el.name === channel && el.failing === (valid ? 'no' : 'yes'))).toBeDefined()
}

async function expectPopout(page: Page, toHave: string) {
  // Check if the popout has the correct text
  const popOutLocator = '.k-ios > section:nth-child(4) > ol:nth-child(1) > li:nth-child(1) > div:nth-child(3) > div:nth-child(1)'
  await expect(page.locator(popOutLocator)).toContainText(toHave)

  // Close all popouts
  let popOutVisible = true
  while (popOutVisible) {
    // Close the popout
    await page.click('.k-ios > section:nth-child(4) > ol:nth-child(1) > li:nth-child(1) > button:nth-child(1)')

    await page.waitForTimeout(250)

    // Check if the popout is still visible
    popOutVisible = await page.locator(popOutLocator).isVisible()
  }
}

// We have to go around this wierd dev server
// This is becouse the router is kind of wierd in this dev server (it is not happen in prod)
// I had to write this like this so it's reiable
// Perhaps there is a better way but this works 100% of times
// This dev server is here only becouse vite's failed on the first request making the test unreliable
async function goto(page: Page, url: string) {
  await page.goto(url)
  // await page.waitForURL('**\/app/home')
  // // Big timeout to let the router start
  // await page.waitForTimeout(1500)
  // await page.evaluate(url => window.location.href = url, url)
}
