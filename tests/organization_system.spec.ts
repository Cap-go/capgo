// import type { Page } from '@playwright/test'
import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import type { SupabaseType } from './utils'
import { BASE_URL, beforeEachTest, expectPopout, useSupabase, useSupabaseAdmin } from './utils'
import type { Database } from '~/types/supabase.types'

test.beforeEach(beforeEachTest)

test.describe('Test organization invite', () => {
  test.beforeAll(async () => {
    const supabase = await useSupabaseAdmin()

    const { error } = await supabase.from('org_users')
      .delete()
      .eq('user_id', '6f0d1a2e-59ed-4769-b9d7-4d9615b28fe5')

    await expect(error).toBeNull()
  })

  test('test invite user to org', async ({ page }) => {
    // await expect('abc'.length).toBe(3)

    await expect(page.locator('.space-x-3 > div:nth-child(1) > div:nth-child(1)')).toBeVisible()
    await page.locator('#organization-picker').click()

    const allOrgs = (await page.locator('ul.py-2').all())
    await expect(allOrgs).toHaveLength(1)

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
    await expect(page.locator('div.rounded-lg:nth-child(1)')).toBeVisible()
    await expect(page.locator('h3.text-xl')).toHaveText('Insert email of the user you want to invite')

    // Type email and click "invite"
    await page.fill('#dialog-input-field', 'test2@capgo.app')
    await page.click('div.p-6:nth-child(3) > button:nth-child(2)')
    await expect(page.locator('h3.text-xl')).toHaveText('Select user\'s permissions')

    // Click on "read" (TODO: click on all)
    await page.click('div.p-6:nth-child(3) > button:nth-child(2)')
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
