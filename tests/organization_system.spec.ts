// import type { Page } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'
import type { Locator, Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import pkg from 'deep-diff'
import type { SupabaseType } from './utils'
import { BASE_URL, SUPABASE_URL, awaitPopout, beforeEachTest, expectPopout, firstItemAsync, loginAsUser1, loginAsUser2, useSupabase, useSupabaseAdmin } from './utils'
import type { Database } from '~/types/supabase.types'

const { diff } = pkg

const __dirname = path.dirname(fileURLToPath(import.meta.url))

test.beforeEach(beforeEachTest)

const inviteTypes = ['read', 'upload', 'write', 'admin']

test.describe.configure({ mode: 'serial' })

test.describe('Test organization invite', () => {
  test.describe.configure({ mode: 'serial' })

  test.beforeEach(loginAsUser1)

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
      await expect(member.email).toBe(`test@capgo.app (super admin)`)
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
      await expect(orgUsers).toHaveLength(2) // 2 because owner IS in this list
      await expect(orgUsers?.find(user => (user.user_id as any).email === 'test2@capgo.app')).toBeTruthy()
    })
  }
})

test.describe('Test organization invitation accept', () => {
  test.describe.configure({ mode: 'serial' })

  const testWithInvitedUser = test.extend<object, { workerStorageState: string }>({
    // storageState: 'playwright/.auth/user2.json',
  })

  testWithInvitedUser.beforeEach(loginAsUser2)

  for (const inviteType of inviteTypes) {
    test.describe(`Test organization invitation accept (${inviteType})`, () => {
      test.describe.configure({ mode: 'serial' })

      // Generate invite
      testWithInvitedUser.beforeAll(async () => {
        const supabase = await useSupabaseAdmin()

        const { error: error1 } = await supabase.from('org_users')
          .delete()
          .eq('user_id', '6f0d1a2e-59ed-4769-b9d7-4d9615b28fe5')

        await expect(error1).toBeFalsy()

        const { error: error2 } = await supabase.from('org_users')
          .insert([{
            user_id: '6f0d1a2e-59ed-4769-b9d7-4d9615b28fe5',
            user_right: `invite_${inviteType}` as any,
            org_id: '046a36ac-e03c-4590-9257-bd6c9dba9ee8',
          }, {
            user_id: '6f0d1a2e-59ed-4769-b9d7-4d9615b28fe5',
            user_right: `super_admin` as any,
            org_id: '34a8c55d-2d0f-4652-a43f-684c7a9403ac',
          }])

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
        let supabase = await useSupabase(page)
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
          .eq('org_id', '046a36ac-e03c-4590-9257-bd6c9dba9ee8')
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
      changeChannelToggle: false,
      makeChannelDefault: false,
      changeSelectableDisallow: false,
      changeSecondVersionPercentageSlider: false,
      unlinkBundle: false,
      setBundleToChannel: false,
      setBundleMetadata: false,
      setDeviceCustomId: false,
      forceDeviceChannel: false,
      forceDeviceVersion: false,
      changeOrgPicture: false,
      changeOrgName: false,
    },
    upload: {
      deleteChannel: false,
      addChannel: false,
      changeChannelToggle: false,
      makeChannelDefault: false,
      changeSelectableDisallow: false,
      changeSecondVersionPercentageSlider: false,
      unlinkBundle: false,
      setBundleToChannel: false,
      setBundleMetadata: false,
      setDeviceCustomId: false,
      forceDeviceChannel: false,
      forceDeviceVersion: false,
      changeOrgPicture: false,
      changeOrgName: false,
    },
    write: {
      deleteChannel: false,
      addChannel: false,
      changeChannelToggle: false,
      makeChannelDefault: false,
      changeSelectableDisallow: false,
      changeSecondVersionPercentageSlider: false,
      unlinkBundle: true, // Important: Write HAS unlink bundle
      setBundleToChannel: true,
      setBundleMetadata: true,
      setDeviceCustomId: true,
      forceDeviceChannel: true,
      forceDeviceVersion: true,
      changeOrgPicture: false,
      changeOrgName: false,
    },
    admin: {
      deleteChannel: true,
      addChannel: true,
      changeChannelToggle: true,
      makeChannelDefault: true,
      changeSelectableDisallow: true,
      changeSecondVersionPercentageSlider: true,
      unlinkBundle: true,
      setBundleToChannel: true,
      setBundleMetadata: true,
      setDeviceCustomId: true,
      forceDeviceChannel: true,
      forceDeviceVersion: true,
      changeOrgPicture: true,
      changeOrgName: true,
    },
    super_admin: {
      deleteChannel: true,
      addChannel: true,
      changeChannelToggle: true,
      makeChannelDefault: true,
      changeSelectableDisallow: true,
      changeSecondVersionPercentageSlider: true,
      unlinkBundle: true,
      setBundleToChannel: true,
      setBundleMetadata: true,
      setDeviceCustomId: true,
      forceDeviceChannel: true,
      forceDeviceVersion: true,
      changeOrgPicture: true,
      changeOrgName: true,
    },
  }

  for (const [inviteType, permission] of new Map(Object.entries(permissionMatrix))) {
    let channelSnapshots = null as Database['public']['Tables']['channels']['Row'][] | null
    let bundleSnapshot = null as Database['public']['Tables']['app_versions']['Row'] | null
    let deviceSnapshot = null as Database['public']['Tables']['devices']['Row'] | null

    test.describe(`Test organization system permissions (${inviteType})`, () => {
      test.describe.configure({ mode: 'serial' })

      const testWithInvitedUser = test.extend<object, { workerStorageState: string }>({
        // User = owner if invite type === owner, otherwise user = invited
        // storageState: inviteType !== 'owner' ? 'playwright/.auth/user2.json' : 'playwright/.auth/user1.json',
      })

      testWithInvitedUser.beforeEach(inviteType !== 'owner' ? loginAsUser2 : loginAsUser1)

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

        const { data: bundleVersion, error: error4 } = await supabase.from('app_versions')
          .select('*')
          .eq('id', '9601')
          .single()

        await expect(error4).toBeFalsy()

        const { data: deviceData, error: error5 } = await supabase.from('devices')
          .select('*')
          .eq('device_id', '00009a6b-eefe-490a-9c60-8e965132ae51')
          .single()

        await expect(error5).toBeFalsy()

        const { error: error6 } = await supabase.from('channel_devices').delete().eq('device_id', '00009a6b-eefe-490a-9c60-8e965132ae51')
        await expect(error6).toBeFalsy()

        const { error: error7 } = await supabase.from('devices_override').delete().eq('device_id', '00009a6b-eefe-490a-9c60-8e965132ae51')
        await expect(error7).toBeFalsy()

        const { error: error8 } = await supabase.from('orgs').update({ logo: null, name: 'Demo org' }).eq('id', '046a36ac-e03c-4590-9257-bd6c9dba9ee8')
        expect(error8).toBeFalsy()

        // const { error: error8 } = await supabase.from('channel_devices').delete().eq('device_id', '00009a6b-eefe-490a-9c60-8e965132ae51')
        // await expect(error8).toBeFalsy()

        channelSnapshots = data
        bundleSnapshot = bundleVersion
        deviceSnapshot = deviceData
      })

      testWithInvitedUser.afterEach(async () => {
        await expect(channelSnapshots).toBeTruthy()
        await expect(bundleSnapshot).toBeTruthy()

        const supabase = await useSupabaseAdmin()
        const { error } = await supabase.from('channels').delete().eq('app_id', 'com.demo.app')

        expect(error).toBeFalsy()

        const { error: error3 } = await supabase.from('app_versions').delete().eq('id', '9601')
        await expect(error3).toBeFalsy()

        const { error: error4 } = await supabase.from('app_versions').insert(bundleSnapshot!)
        await expect(error4).toBeFalsy()

        const { error: error2 } = await supabase.from('channels').insert(channelSnapshots!)
        await expect(error2).toBeFalsy()

        const { error: error5 } = await supabase.from('devices').delete().eq('device_id', '00009a6b-eefe-490a-9c60-8e965132ae51')
        await expect(error5).toBeFalsy()

        const { error: error6 } = await supabase.from('devices').insert(deviceSnapshot!)
        await expect(error6).toBeFalsy()
      })

      testWithInvitedUser('Test user permissions', async ({ page }) => {
        const monthlyStatLocator = await (await page.locator('#mau-stat')).locator('#usage_val')

        // We ALLWAYS expect app to be accesible. We are added to the org
        let users = Number.parseInt((await monthlyStatLocator.innerText()).split(' ')[0])
        await expect(users).not.toBeNaN()
        await expect(users).toBeGreaterThanOrEqual(0) // Check if getting stats works

        if (inviteType !== 'owner') {
          const appsLocator = await page.locator('#my_apps')

          // This assumes that the loading works correctly.
          // Since test2@capgo.app does not have apps of it's own the default org should be the one that owns com--demo--app
          // We don't test that but if that assumtion fails the test will fail here
          const allApps = await appsLocator.locator('#top_apps > tbody > tr').all()
          await expect(allApps).toHaveLength(1)
          await allApps[0].click()
          await page.waitForURL('**\/com--demo--app')
        }
        else {
          await page.goto(`${BASE_URL}/app/package/com--demo--app`)
        }

        // Check again. This time for specific app
        users = Number.parseInt((await monthlyStatLocator.innerText()).split(' ')[0])
        await expect(users).not.toBeNaN()
        await expect(users).toBeGreaterThanOrEqual(0) // Check if getting stats works

        const bundlesTotalSelector = await page.locator('#bundles-total')
        const bundlesTotal = Number.parseInt(await bundlesTotalSelector.innerText())
        await expect(bundlesTotal).not.toBeNaN()
        await expect(bundlesTotal).toBeGreaterThanOrEqual(0) // Check if bundles graph work

        // Test this down stripe (channels, bundles, devices, updates)
        // None of those values should be zero. If it is then something is broken
        const specificAppStats = await page.locator('#app-stats')
        await Promise.all((await specificAppStats.locator('#stats-val').all()).map(async (stat) => {
          const innerText = await stat.innerHTML()
          const innerNumber = Number.parseInt(innerText)

          await expect(innerNumber).not.toBeNaN()
          await expect(innerNumber).toBeGreaterThanOrEqual(0)
        }))

        // go to 'channels'
        await page.goto(`${BASE_URL}/app/p/com--demo--app/channels`)

        // Get all channels for app from supabase
        const supabase = await useSupabaseAdmin() // Client supabase
        const { error: allChannelsSupabaseError, count: allChannelsCount } = await supabase
          .from('channels')
          .select('*', { count: 'exact' })
          .eq('app_id', 'com.demo.app')
        await expect(allChannelsSupabaseError).toBeFalsy()
        expect (allChannelsCount).toBeTruthy()

        // Expect the channel table to have the same count as supabase
        const allchannelsLocator = await page.locator('#custom_table > tbody > tr')
        await expect(allchannelsLocator).toHaveCount(allChannelsCount!)
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

        // Click on 'settings'
        await page.click('li.mr-2:nth-child(3) > button:nth-child(1)')

        const ktogglesSelector = await page.locator('#klist').locator('#ktoggle')
        const ktoggles = await ktogglesSelector.all()
        await expect(ktoggles.length).toBeGreaterThan(0) // We do not want to test nothing

        // We do a loop, instead of promise.all. This is to prevent a race condition

        for (const toggle of ktoggles) {
          const oldState = await toggle.isChecked()

          async function getSupabaseProdChannelState(supa1base: SupabaseType): Promise<Database['public']['Tables']['channels']['Row']> {
            const { data, error } = await supabase.from('channels')
              .select('*')
              .eq('name', 'production')
              .single()

            await expect(error).toBeFalsy()
            await expect(data).toBeTruthy()

            return data!
          }

          const oldSupabaseState = await getSupabaseProdChannelState(supabase)

          // https://github.com/microsoft/playwright/issues/5470
          if (permission.changeChannelToggle) {
            await Promise.all([
              page.waitForResponse(`${SUPABASE_URL}\/**`),
              toggle.click(),
            ])
          }
          else {
            await toggle.click()
          }

          let newState = await toggle.isChecked()

          const newSupabaseState = await getSupabaseProdChannelState(supabase)
          const diffArr = diff(oldSupabaseState, newSupabaseState)

          if (permission.changeChannelToggle) {
            expect(newState).toBe(!oldState)
            await expect(diffArr).toBeTruthy()
            await expect(diffArr?.length).toBeGreaterThanOrEqual(2)

            await toggle.click()
            newState = await toggle.isChecked()
            expect(newState).toBe(oldState)
          }

          else {
            await expect(diffArr).toBeFalsy()
            await expectPopout(page, 'Insufficient permissions')
          }
        }

        // We check the 'public' switch. This swich opens up a menu so we cannot add this in the loop
        const makeDefaultSwitchLocator = await page.locator('#klist').locator('#ktoggle-def')
        await makeDefaultSwitchLocator.click()

        if (permission.changeChannelToggle) {
          await expect(page.locator('#action-sheet')).toBeVisible()
          await page.locator('#action-sheet > div > button:nth-child(3)').click() // Click on 'cancel"
          await expect(page.locator('action-sheet')).toBeHidden()
        }
        else { await expectPopout(page, 'Insufficient permissions') }

        // Now we try to change selectableDisallow. This should fail for non admin/owner users

        if (permission.changeSelectableDisallow) {
          await page.locator('#selectableDisallow').selectOption({ value: 'version_number' })
          const newSelectableDisallowValue = await page.locator('#selectableDisallow').inputValue()
          await expect(newSelectableDisallowValue).toBe('version_number')
        }
        else {
          // First click
          await page.locator('#selectableDisallow').click()
          await expectPopout(page, 'Insufficient permissions')

          // Second force change val
          const newSelectableDisallowValue = await page.locator('#selectableDisallow').inputValue()
          await page.locator('#selectableDisallow').selectOption({ value: 'version_number' })
          const selectableDisallowValue = await page.locator('#selectableDisallow').inputValue()

          // Last check if even force fails
          await expectPopout(page, 'Insufficient permissions')
          await expect(newSelectableDisallowValue).toBe(selectableDisallowValue)
        }

        // Second version percentage slider
        const sliderLocator = await page.locator('#second-percentage-slider')
        await page.$eval('#second-percentage-slider', (element) => {
          element.scrollIntoView()
        })

        const sliderRect = await sliderLocator.evaluate(slider => slider.getBoundingClientRect())
        const xToClick = sliderRect.left + sliderRect.width * 0.5
        const yToClick = sliderRect.bottom - sliderRect.height * 0.5

        // We click in exacly half of the slider thus the % should be 50
        const oldSliderVal = await sliderLocator.inputValue()
        await page.mouse.click(xToClick, yToClick)
        const newSliderVal = await sliderLocator.inputValue()

        if (!permission.changeSecondVersionPercentageSlider) {
          await expectPopout(page, 'Insufficient permissions')
          expect(oldSliderVal).toBe(newSliderVal)
        }
        else {
          expect(newSliderVal).toBe('50') // We click exacly in half and we are admin/owner
        }

        // Unlink bundle click
        await page.locator('#unlink-bundle').click()

        if (permission.unlinkBundle) {
          await expect(page.locator('#action-sheet')).toBeVisible()
          await page.locator('#action-sheet > div > button:nth-child(2)').click() // Click on 'cancel"
          await expect(page.locator('#action-sheet')).toBeHidden()
        }
        else {
          await expectPopout(page, 'Insufficient permissions')
        }

        // So the channel test are FINALY done. Now let's do bundle.
        await page.goto(`${BASE_URL}/app/p/com--demo--app/bundles`)

        // Make sure we can see the bundles table
        const firstBunlde = await page.locator('#custom_table > tbody > tr:nth-child(1)')
        await expect(firstBunlde).toBeVisible()

        // Set supabase prod channel to 'metadata' disallow strategy
        const { error: errorSetMetadataOnProd } = await supabase.from('channels')
          .update({ disableAutoUpdate: 'version_number', version: 9601 })
          .eq('name', 'production')

        await expect(errorSetMetadataOnProd).toBeFalsy()

        // Go to a specific bundle
        await page.goto(`${BASE_URL}/app/p/com--demo--app/bundle/9601`)

        // Click on `Channel` to see the options available
        await page.locator('#open-channel').first().click()
        await expect(page.locator('#action-sheet')).toBeVisible()

        // Get all buttons
        let actionSheetButtons = await page.locator('#action-sheet > div > button').all()

        // Define a function to find a button. Usefull for further testing
        async function findButtonInActionSheet(actionSheetButtons: Locator[], text: string) {
          return firstItemAsync(actionSheetButtons, async (button) => {
            const innerHTML = await button.innerHTML()
            return innerHTML.toLowerCase().includes(text.toLowerCase())
          })
        }

        const setBundleToChannelButton = await findButtonInActionSheet(actionSheetButtons, 'Set bundle to channel')
        const unlinkButton = await findButtonInActionSheet(actionSheetButtons, 'unlink')

        if (permission.setBundleToChannel) {
          await expect(setBundleToChannelButton).toBeTruthy()
          await expect(unlinkButton).toBeTruthy()
        }
        else {
          await expect(setBundleToChannelButton).toBeFalsy()
          await expect(unlinkButton).toBeFalsy()
        }

        const cancelButton = await findButtonInActionSheet(actionSheetButtons, 'cancel')
        await expect(cancelButton).toBeTruthy()

        await cancelButton!.click()
        await expect(page.locator('action-sheet')).toBeHidden()

        await page.locator('#metadata-bundle').click()

        // If we have the setBundleMetadata perm nothing should happen, but we should be able to input.
        // This is tested in the `selectable_disallow.spec.ts` so I will not touch it here

        if (!permission.setBundleMetadata) {
          // See, but if we do not have the permission we should get a popout
          await expectPopout(page, 'Insufficient permissions')

          const readonly = await page.$eval('#inforow-input', (element) => {
            return element.hasAttribute('readonly')
          })

          expect(readonly).toBe(true)
        }

        await page.goto(`${BASE_URL}/app/p/com--demo--app/devices`)
        const firstDevice = await page.locator('#custom_table > tbody > tr:nth-child(1)')
        await expect(firstDevice).toBeVisible()

        // Go to a specific device
        await page.goto(`${BASE_URL}/app/p/com--demo--app/d/00009a6b-eefe-490a-9c60-8e965132ae51`)
        await page.click('#inforow-input')

        if (permission.setDeviceCustomId) {
          // Usually I would use crypto.random BUT the github CI/CD is on node 18
          // Thus crypto.randomUUID does not work :<
          // I stole this code from stackoverflow - https://stackoverflow.com/a/873856
          function createUUID() {
            // http://www.ietf.org/rfc/rfc4122.txt
            const s = [] as string[]
            const hexDigits: string = '0123456789abcdef'
            for (let i = 0; i < 36; i++)
              s[i] = hexDigits.substr(Math.floor(Math.random() * 0x10), 1)

            s[14] = '4' // bits 12-15 of the time_hi_and_version field to 0010
            s[19] = hexDigits.substr((s[19] as any & 0x3) | 0x8, 1) // bits 6-7 of the clock_seq_hi_and_reserved to 01
            s[8] = s[13] = s[18] = s[23] = '-'

            const uuid = s.join('')
            return uuid
          }

          await page.fill('#inforow-input', `test-${createUUID()}`)
          await expectPopout(page, 'Custom ID saved')
        }
        else {
          await expectPopout(page, 'Insufficient permissions')
        }

        const updateVersionLocator = page.locator('#update-version')
        await updateVersionLocator.click()

        if (permission.forceDeviceVersion) {
          await expect(page.locator('#action-sheet')).toBeVisible()
          actionSheetButtons = await page.locator('#action-sheet > div > button').all()

          // Now let's add an overwrite
          const specificVersion = await findButtonInActionSheet(actionSheetButtons, '1.0.0')
          await expect(specificVersion).toBeTruthy()
          await specificVersion!.click()

          await expectPopout(page, 'Version link')
          const { error: versionOverwriteError } = await supabase.from('devices_override')
            .select('version')
            .eq('device_id', '00009a6b-eefe-490a-9c60-8e965132ae51')
            .single()

          await expect(versionOverwriteError).toBeFalsy()

          await expect(page.locator('#action-sheet')).toBeHidden()

          // Now let's delete this version
          await updateVersionLocator.click()
          await expect(page.locator('#action-sheet')).toBeVisible()
          actionSheetButtons = await page.locator('#action-sheet > div > button').all()

          const removeButton = await findButtonInActionSheet(actionSheetButtons, 'remove')
          await expect(removeButton).toBeTruthy()
          await removeButton!.click()

          await awaitPopout(page)
          const finalRemoveButton = await findPopoutButton(page, 'delete')

          await expect(finalRemoveButton).toBeTruthy()
          await finalRemoveButton!.click()
          await expectPopout(page, 'Unlink version')

          const { error: versionOverwriteRemoveError, count: versionOverwritesCount } = await supabase.from('devices_override')
            .select('version', { count: 'exact' })
            .eq('device_id', '00009a6b-eefe-490a-9c60-8e965132ae51')

          await expect(versionOverwriteRemoveError).toBeFalsy()
          await expect(versionOverwritesCount).toBe(0)
        }
        else {
          await expectPopout(page, 'Insufficient permissions')
        }

        const updateChannelLocator = page.locator('#update-channel')
        await updateChannelLocator.click()

        if (permission.forceDeviceChannel) {
          await expect(page.locator('#action-sheet')).toBeVisible()
          actionSheetButtons = await page.locator('#action-sheet > div > button').all()

          // Now let's add an overwrite
          const specificChannel = await findButtonInActionSheet(actionSheetButtons, 'no_access')
          await expect(specificChannel).toBeTruthy()
          await specificChannel!.click()

          await expectPopout(page, 'Channel override setted')

          const { error: channelOverwriteError } = await supabase.from('channel_devices')
            .select('app_id')
            .eq('device_id', '00009a6b-eefe-490a-9c60-8e965132ae51')
            .single()

          await expect(channelOverwriteError).toBeFalsy()

          await expect(page.locator('#action-sheet')).toBeHidden()

          // Now let's delete this channel overwrite
          await updateChannelLocator.click()
          await expect(page.locator('#action-sheet')).toBeVisible()
          actionSheetButtons = await page.locator('#action-sheet > div > button').all()

          const removeButton = await findButtonInActionSheet(actionSheetButtons, 'remove')
          await expect(removeButton).toBeTruthy()
          await removeButton!.click()

          await awaitPopout(page)
          const finalRemoveButton = await findPopoutButton(page, 'delete')

          await expect(finalRemoveButton).toBeTruthy()
          await finalRemoveButton!.click()

          await expectPopout(page, 'Unlink channel')

          const { error: channelOverwriteRemoveError, count: channelOverwritesCount } = await supabase.from('channel_devices')
            .select('app_id', { count: 'exact' })
            .eq('device_id', '00009a6b-eefe-490a-9c60-8e965132ae51')

          await expect(channelOverwriteRemoveError).toBeFalsy()
          await expect(channelOverwritesCount).toBe(0)
        }
        else {
          await expectPopout(page, 'Insufficient permissions')
          const innerHtml = await updateChannelLocator.innerHTML()
          expect(innerHtml.includes('click to add')).toBe(false)
        }

        // TODO: Once stats are no longer a total mess test stats
        // Test org settings

        await page.goto(`${BASE_URL}/dashboard/settings/organization/general`)

        // Get supabase client user id and the current org owner
        const currentOrgDetails = await getOrgDetails(page, supabase)
        const clientSupabase = await useSupabase(page)

        const clientSupabaseUser = await clientSupabase.auth.getUser()
        await expect(clientSupabaseUser.error).toBeFalsy()
        await expect(clientSupabaseUser.data).toBeTruthy()
        await expect(clientSupabaseUser.data.user).toBeTruthy()

        const currentUserId = clientSupabaseUser!.data!.user!.id
        // Not, because we SHOULD never use the test2@capgo.app org as the defualt one
        // test2@capgo.app owns no apps - thus we should allways default to the test@capgo.app user id
        await expect(currentOrgDetails.created_by).not.toBe(currentUserId)

        // Let's select the 'demo org'

        await page.click('#organization-picker')
        const allOrgsLocator = await page.locator('#dropdown-org > ul > li')

        await expect(allOrgsLocator).toHaveCount(inviteType === 'owner' ? 1 : 2)
        const demoOrgButton = await firstItemAsync(await allOrgsLocator.all(), async (orgName) => {
          return (await orgName.innerHTML()).includes('Demo org')
        })

        expect(demoOrgButton).toBeTruthy()
        await demoOrgButton?.click()

        expect(await getOrgName(page)).toBe('Demo org')
        // Start by trying to change the picture. Might be a bit hard to test for

        await page.locator('#change-org-pic').click()

        if (permission.changeOrgPicture) {
          await expect(page.locator('#action-sheet')).toBeVisible()
          actionSheetButtons = await page.locator('#action-sheet > div > button').all()

          const browseFilesButton = await findButtonInActionSheet(actionSheetButtons, 'browse')
          await expect(browseFilesButton).toBeTruthy()
          const cameraInputLocator = page.locator('#_capacitor-camera-input-multiple')

          // Add an event listener to prevent file open from accually opening
          await page.evaluate(() => {
            const onClick = (event: MouseEvent) => {
              if (!event.target)
                return

              console.log('tar', event.target)

              if ('getAttribute' in event.target) {
                const element = event.target as any as Element
                const id = element.getAttribute('id')
                if (!id)
                  return

                if (!id.includes('camera-input'))
                  return

                event.preventDefault()
                document.removeEventListener('click', onClick, true)
              }
            }

            document.addEventListener('click', onClick, true)
          })

          // await page.evaluate(eventClickFunction => document.addEventListener('click', eventClickFunction), eventClickFunction)

          await browseFilesButton?.click()
          await expect(cameraInputLocator).toHaveCount(1)
          await cameraInputLocator.setInputFiles(path.join(__dirname, 'smile.png'))

          // I had a bug where the current org changed after upload. Make sure this does not happen again
          expect(await getOrgName(page)).toBe('Demo org')

          // Check if the avatar exists
          const avatarLocator = page.locator('#org-avatar')
          await expect(avatarLocator).toHaveCount(1)

          // Download the new avatar
          const avatarUrl = await avatarLocator.getAttribute('src')
          expect(avatarUrl).toBeTruthy()

          const avatarResponse = await fetch(avatarUrl!)
          expect(avatarResponse.status).toBe(200)

          const avatarRemoteData = new Uint8Array(await avatarResponse.arrayBuffer())
          expect(avatarRemoteData.length).toBeGreaterThan(0)

          // Read the local file
          const localAvatarData = new Uint8Array(readFileSync(path.join(__dirname, 'smile.png')))
          expect(localAvatarData.length).toBeGreaterThan(0)

          // Compare local avatar and the remote versions
          expect(localAvatarData.length).toBe(avatarRemoteData.length)
          const avatarsMatch = avatarRemoteData.every((v, i) => v === localAvatarData[i])
          expect(avatarsMatch).toBe(true)
        }
        else {
          await expectPopout(page, 'Insufficient permissions')
        }

        // Let's go and change the org's name
        await page.locator('#base-input').click()

        if (permission.changeOrgName) {
          await page.fill('#base-input', 'Demo org temp')
          await page.locator('#save-changes').click()
          await expectPopout(page, 'Organization updated successfully')

          const { data: orgSupabaseData, error: orgSupabaseError } = await supabase.from('orgs')
            .select('name')
            .eq('id', '046a36ac-e03c-4590-9257-bd6c9dba9ee8')
            .single()

          expect(orgSupabaseError).toBeFalsy()
          expect(orgSupabaseData).toBeTruthy()
          expect(orgSupabaseData!.name).toBe('Demo org temp')

          expect(await getOrgName(page)).toBe('Demo org temp')
        }
        else {
          await expectPopout(page, 'Insufficient permissions')
          expect(await page.locator('#base-input').getAttribute('readonly') === null).toBe(false)
        }

        // Now let's go test members. This is hopefuly the last thing to test
        await page.click('#tab-Members')

        // member-card
        // After page switch make sure we are still at the same org
        const expectedOrgName = permission.changeOrgName ? 'Demo org temp' : 'Demo org'
        expect(await getOrgName(page)).toBe(expectedOrgName)
        const allMembersLocator = await page.locator('#member-card')

        const { error: allMembersSupabaseError, count: allMembersSupaCount } = await supabase.from('org_users')
          .select('*', { count: 'exact' })
          .eq('org_id', '046a36ac-e03c-4590-9257-bd6c9dba9ee8')

        expect(allChannelsSupabaseError).toBeFalsy()
        expect(allMembersSupaCount).toBeTruthy
        expect(allChannelsCount).toBeGreaterThan(0)

        await expect(allMembersLocator).toHaveCount(allMembersSupaCount!)

        const mappedMembers = await Promise.all((await allMembersLocator.all()).map(async (memberLocator) => {
          const canEdit = await memberLocator.locator('wrench-button').isVisible()
          const canRemove = await memberLocator.locator('trash-button').isVisible()
          const email = await memberLocator.locator('#user-email').innerText()

          return { canEdit, canRemove, email }
        }))

        expect(clientSupabaseUser.data?.user?.email).toBeTruthy()
        const selfSupabaseUserEmail = clientSupabaseUser.data!.user!.email
        expect(selfSupabaseUserEmail).toBeTruthy()

        const selfMember = await mappedMembers.find(user => user.email.includes(selfSupabaseUserEmail!))
        expect(selfMember).toBeTruthy()
        expect(selfMember?.canEdit).toBeFalsy()
        expect(selfMember?.canRemove).toBeFalsy()
      })
    })
  }
})

async function getAllMembers(page: Page) {
  await page.goto(`${BASE_URL}/dashboard/settings/organization/members`)
  await expect(page.locator('#members-div')).toBeVisible()

  const userTable = await page.locator('#members-div')
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
    supabase = await useSupabase(page)

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
