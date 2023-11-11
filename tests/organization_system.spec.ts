// import type { Page } from '@playwright/test'
import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import type { SupabaseType } from './utils'
import { BASE_URL, awaitPopout, beforeEachTest, expectPopout, firstItemAsync, useSupabase, useSupabaseAdmin } from './utils'
import type { Database } from '~/types/supabase.types'

test.beforeEach(beforeEachTest)

const inviteTypes = ['read', 'upload', 'write', 'admin']

test.describe.configure({ mode: 'serial' })

test.describe('Test organization invite', () => {
  test.describe.configure({ mode: 'serial' })

  test.beforeEach(async () => {
    const supabase = await useSupabaseAdmin()

    const { error } = await supabase.from('org_users')
      .delete()
      .eq('user_id', '6f0d1a2e-59ed-4769-b9d7-4d9615b28fe5')

    await expect(error).toBeNull()
  })

  for (const inviteType of inviteTypes) {
    test(`test invite user to org (${inviteType})`, async ({ page }) => {
      // await expect('abc'.length).toBe(3)

      await expect(page.locator('.space-x-3 > div:nth-child(1) > div:nth-child(1)')).toBeVisible()
      await page.locator('#organization-picker').click()

      const allOrgsLocator = await page.locator('#dropdown-org > ul > li')
      await expect(allOrgsLocator).toHaveCount(1)

      await page.goto(`${BASE_URL}/dashboard/settings/organization/members`)
      await getAllMembers(page)

      // For now we do not check name, not the point of this test
      const members = await getAllMembers(page)
      await expect(members).toHaveLength(1)

      const member = members[0]
      await expect(member.email).toBe('test@capgo.app')
      await expect(member.isDeletable).toBeFalsy()
      await expect(member.isModifiable).toBeFalsy()

      // Let's invite shall we?
      await page.click('button.text-white:nth-child(2)')
      await awaitPopout(page)
      await expect(page.locator('h3.text-xl')).toHaveText('Insert email of the user you want to invite')

      // Type email and click "invite"
      await page.fill('#dialog-input-field', 'test2@capgo.app')
      await page.click('div.p-6:nth-child(3) > button:nth-child(2)')
      await expect(page.locator('h3.text-xl')).toHaveText('Select user\'s permissions')

      // Click on "read" (TODO: click on all)

      const correctButton = await findPopoutButton(page, inviteType)
      await expect(correctButton).toBeDefined()
      await correctButton?.click()

      await expectPopout(page, 'Successfully invited user to org')

      // Did we invite?
      const supabase = await useSupabaseAdmin()
      const organization = await getOrgDetails(page, supabase)

      const { data: orgUsers, error } = await supabase.from('org_users')
        .select(`
          user_id ( email ),
          user_right
        `)
        .eq('org_id', organization.id)

      await expect(error).toBeNull()
      await expect(orgUsers).toBeTruthy()
      await expect(orgUsers).toHaveLength(1) // 1 because owner is not in this list
      await expect((orgUsers![0].user_id as any).email).toBe('test2@capgo.app')
    })
  }
})

test.describe('Test organization invitation accept', () => {
  test.describe.configure({ mode: 'serial' })

  const testWithInvitedUser = test.extend<object, { workerStorageState: string }>({
    storageState: 'playwright/.auth/user2.json',
  })

  for (const inviteType of inviteTypes) {
    test.describe(`Test organization invitation accept (${inviteType})`, () => {
      test.describe.configure({ mode: 'serial' })

      // Generate invite
      testWithInvitedUser.beforeAll(async () => {
        const supabase = await useSupabaseAdmin()

        const { error: error1 } = await supabase.from('org_users')
          .delete()
          .eq('org_id', '046a36ac-e03c-4590-9257-bd6c9dba9ee8')

        await expect(error1).toBeFalsy()

        const { error: error2 } = await supabase.from('org_users')
          .insert({
            user_id: '6f0d1a2e-59ed-4769-b9d7-4d9615b28fe5',
            app_id: 'com.demo.app',
            user_right: `invite_${inviteType}` as any,
            org_id: '046a36ac-e03c-4590-9257-bd6c9dba9ee8',
          })

        await expect(error2).toBeFalsy()
      })

      testWithInvitedUser('Test accept invite', async ({ page }) => {
        // Click on the organization picker
        await expect(page.locator('.space-x-3 > div:nth-child(1) > div:nth-child(1)')).toBeVisible()
        await page.locator('#organization-picker').click()

        // Get all organizations we can access
        const allOrgsLocator = await page.locator('#dropdown-org > ul > li')
        await expect(allOrgsLocator).toHaveCount(2)
        const allOrgs = await allOrgsLocator.all()

        // Check the name of the 'demo org' (We invite user to this org above)
        let supabase = await useSupabase()
        const { data: demoOrgName, error } = await supabase.from('orgs')
          .select()
          .eq('id', '046a36ac-e03c-4590-9257-bd6c9dba9ee8')
          .single()

        await expect(error).toBeFalsy()
        await expect(demoOrgName?.name).toBeTruthy()

        // Get the button to click (The organziation that we have been invited)
        const orgToAcceptInvite = await firstItemAsync(allOrgs, async (org) => {
          const innerHtml = await org.innerHTML()

          return innerHtml.includes(demoOrgName!.name)
        })

        await expect(orgToAcceptInvite).toBeTruthy()

        // Click on the org that we have been invited to
        await orgToAcceptInvite!.click()
        await awaitPopout(page)

        // find accept button and click it
        const acceptButton = await findPopoutButton(page, 'accept')
        await expect(acceptButton).toBeDefined()
        await acceptButton?.click()

        await expectPopout(page, 'accepted oranization inviation')

        // Check if role has changed in supabase
        supabase = await useSupabaseAdmin()
        const { data: orgUser, error: orgUserError } = await supabase.from('org_users')
          .select('user_right')
          .eq('user_id', '6f0d1a2e-59ed-4769-b9d7-4d9615b28fe5')
          .single()

        await expect(orgUserError).toBeFalsy()
        await expect(orgUser).toBeDefined()
        await expect(orgUser?.user_right).toBe(inviteType)
      })
    })
  }
})

async function getAllMembers(page: Page) {
  await page.goto(`${BASE_URL}/dashboard/settings/organization/members`)
  await page.waitForTimeout(500)

  const userTable = await page.locator('dl.divide-y')
  const userTableDivs = await userTable.all()

  const members = await Promise.all(userTableDivs.map(async (el) => {
    const email = await el.locator('div:nth-child(2)').innerText()
    const isModifiable = await el.locator('div:nth-child(3) > button:nth-child(1)').isVisible()
    const isDeletable = await el.locator('div:nth-child(3) > button:nth-child(2)').isVisible()
    return { email, isModifiable, isDeletable }
  }))

  return members
}

async function getOrgName(page: Page): Promise<string> {
  await expect(page.locator('div.mr-2 > div:nth-child(1)')).toBeVisible()
  const name = await page.locator('#organization-picker').innerText()

  return name
}

async function getOrgDetails(page: Page, supabase?: SupabaseType): Promise<Database['public']['Tables']['orgs']['Row']> {
  if (!supabase)
    supabase = await useSupabase()

  const orgName = await getOrgName(page)

  const { error, data } = await supabase.from('orgs')
    .select('*')
    .eq('name', orgName)
    .single()

  await expect(error).toBeNull()
  await expect(data).toBeDefined()

  return data!
}

async function findPopoutButton(page: Page, buttonText: string) {
  const allButtons = await page.locator('div.p-6:nth-child(3)').getByRole('button').all()
  const correctButton = await firstItemAsync(allButtons, async button => (await button.innerHTML()).toLowerCase().includes(buttonText))

  return correctButton
}
