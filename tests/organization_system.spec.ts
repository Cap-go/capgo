// import type { Page } from '@playwright/test'
import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { BASE_URL, beforeEachTest } from './utils'

test.beforeEach(beforeEachTest)

test('test organization invite', async ({ page }) => {
  // await expect('abc'.length).toBe(3)

  await expect(page.locator('.space-x-3 > div:nth-child(1) > div:nth-child(1)')).toBeVisible()
  await page.locator('#organization-picker').click()

  const allOrgs = (await page.locator('ul.py-2').all())
  await expect(allOrgs).toHaveLength(1)

  await page.goto(`${BASE_URL}/dashboard/settings/organization/members`)
  await getAllMembers(page)

  // For now we do not check name, not the point of this test
})

async function getAllMembers(page: Page) {
  await page.waitForTimeout(500)

  const userTable = await page.locator('dl.divide-y')
  const userTableDivs = await userTable.all()
  console.log('a')

  const members = await Promise.all(userTableDivs.map(async (el) => {
    const email = await el.locator('div:nth-child(2)').innerText()
    const isModifiable = await el.locator('div:nth-child(3) > button:nth-child(1)').isVisible()
    const isDeletable = await el.locator('div:nth-child(3) > button:nth-child(2)').isVisible()
    return { email, isModifiable, isDeletable }
  }))

  console.log('a')
  // We make the assumption that only 2 channels exist, this is allways true (for now) in CI/CD
  //   const channelRows = (await userTable.all()).slice(0, 2)
  //   const failingChannels = await Promise.all(channelRows
  //     .map(async (el) => {
  //       const name = await el.locator('th:nth-child(1)').innerHTML()
  //       const failing = await el.locator('td:nth-child(4)').innerHTML()

//       return {
//         name,
//         failing,
//       }
//     }),
//   )
}
