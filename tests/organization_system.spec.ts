// import type { Page } from '@playwright/test'
import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { A, E } from 'ios/App/App/public/assets/Account-fa6ef73d'
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

test.describe('Test organization system permissions', () => {
  test.describe.configure({ mode: 'serial' })
  // const inviteTypes = ['read', 'upload', 'write', 'admin']
  const permissionMatrix = {
    read: {
      deleteChannel: false,
      addChannel: false,
    },
    upload: {
      deleteChannel: false,
      addChannel: false,
    },
    write: {
      deleteChannel: false,
      addChannel: false,
    },
    admin: {
      deleteChannel: true,
      addChannel: true,
    },
    owner: {
      deleteChannel: true,
      addChannel: true,
    },
  }

  for (const [inviteType, permission] of new Map(Object.entries(permissionMatrix))) {
    let channelSnapshots = null as Database['public']['Tables']['channels']['Row'][] | null

    test.describe(`Test organization system permissions (${inviteType})`, () => {
      test.describe.configure({ mode: 'serial' })

      const testWithInvitedUser = test.extend<object, { workerStorageState: string }>({
        // User = owner if invite type === owner, otherwise user = invited
        storageState: inviteType !== 'owner' ? 'playwright/.auth/user2.json' : 'playwright/.auth/user1.json',
      })

      // Generate invite
      testWithInvitedUser.beforeAll(async () => {
        const supabase = await useSupabaseAdmin()

        const { error: error1 } = await supabase.from('org_users')
          .delete()
          .eq('org_id', '046a36ac-e03c-4590-9257-bd6c9dba9ee8')

        await expect(error1).toBeFalsy()

        if (inviteType !== 'owner') {
          const { error: error2 } = await supabase.from('org_users')
            .insert({
              user_id: '6f0d1a2e-59ed-4769-b9d7-4d9615b28fe5',
              user_right: `${inviteType}` as any,
              org_id: '046a36ac-e03c-4590-9257-bd6c9dba9ee8',
            })

          await expect(error2).toBeFalsy()
        }

        const { data, error: error3 } = await supabase.from('channels')
          .select('*')
          .eq('app_id', 'com.demo.app')

        await expect(error3).toBeFalsy()
        await expect(data).toBeTruthy()

        channelSnapshots = data
      })

      testWithInvitedUser.afterAll(async () => {
        await expect(channelSnapshots).toBeTruthy()

        const supabase = await useSupabaseAdmin()
        const { error } = await supabase.from('channels').delete().eq('app_id', 'com.demo.app')

        expect(error).toBeFalsy()

        const { error: error2 } = await supabase.from('channels').insert(channelSnapshots!)
        await expect(error2).toBeFalsy()
      })

      testWithInvitedUser('Test user permissions', async ({ page }) => {
        const monthlyStatLocator = await (await page.locator('#mau-stat')).locator('#usage_val')

        // We ALLWAYS expect app to be accesible. We are added to the org
        let users = Number.parseInt((await monthlyStatLocator.innerText()).split(' ')[0])
        await expect(users).toBeTruthy()
        await expect(users).toBeGreaterThan(0) // Check if getting stats works

        if (inviteType !== 'owner') {
          const sharedAppsLocator = await page.locator('#shared')

          const allSharedApps = await sharedAppsLocator.locator('#top_apps > tbody > tr').all()
          await expect(allSharedApps).toHaveLength(1)
          await allSharedApps[0].click()
          await page.waitForURL('**\/com--demo--app')
        }
        else {
          await page.goto(`${BASE_URL}/app/package/com--demo--app`)
        }

        // Check again. This time for specific app
        users = Number.parseInt((await monthlyStatLocator.innerText()).split(' ')[0])
        await expect(users).toBeTruthy()
        await expect(users).toBeGreaterThan(0) // Check if getting stats works

        const bundlesTotalSelector = await page.locator('#bundles-total')
        const bundlesTotal = Number.parseInt(await bundlesTotalSelector.innerText())
        await expect(bundlesTotal).toBeTruthy()
        await expect(bundlesTotal).toBeGreaterThan(0) // Check if bundles graph work

        // Test this down stripe (channels, bundles, devices, updates)
        // None of those values should be zero. If it is then something is broken
        const specificAppStats = await page.locator('#app-stats')
        await Promise.all((await specificAppStats.locator('#stats-val').all()).map(async (stat) => {
          const innerText = await stat.innerHTML()
          const innerNumber = Number.parseInt(innerText)

          await expect(innerNumber).toBeTruthy()
          await expect(innerNumber).toBeGreaterThan(1)
        }))

        // go to 'channels'
        await page.goto(`${BASE_URL}/app/p/com--demo--app/channels`)

        // Get all channels for app from supabase
        const supabase = await useSupabaseAdmin() // Client supabase
        const { error: allChannelsSupabaseError, count: allChannelsCount } = await supabase
          .from('channels')
          .select('', { count: 'exact' })
          .eq('app_id', 'com.demo.app')
        await expect(allChannelsSupabaseError).toBeFalsy()

        // Expect the channel table to have the same count as supabase
        const allchannelsLocator = await page.locator('#custom_table > tbody > tr')
        await expect(allchannelsLocator).toHaveCount(2)
        const allChannels = await allchannelsLocator.all()

        // Attempt to delete a channel. That is based on the permission matrix
        await allChannels[0].locator('td:nth-child(5)').click()

        if (permission.deleteChannel) {
          await awaitPopout(page)
          const cancelButton = await findPopoutButton(page, 'cancel')

          await expect(cancelButton).toBeTruthy()
          await cancelButton!.click()
        }
        else {
          await expectPopout(page, 'Insufficient permissions')
        }

        // Attempt to create a channel (again, based on permission matrix)
        await page.locator('#create_channel').click()

        if (permission.addChannel) {
          await expect(page.locator('#kdialog-input')).toBeVisible()
          await page.locator('#kdialog-cancel').click()
        }
        else {
          await expectPopout(page, 'Insufficient permissions')
        }

        const productionChannel = await firstItemAsync(allChannels, async (locator) => {
          const innerHtml = await locator.innerHTML()
          return innerHtml.includes('production')
        })

        await expect(productionChannel).toBeTruthy()
        await productionChannel!.click()
        await page.waitForURL('**\/com--demo--app/channel/22')
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
