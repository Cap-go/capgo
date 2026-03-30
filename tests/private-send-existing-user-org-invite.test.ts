import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getAuthHeaders, getEndpointUrl, getSupabaseClient, USER_EMAIL_NONMEMBER, USER_ID, USER_ID_NONMEMBER } from './test-utils.ts'

const id = randomUUID()
const testOrgId = randomUUID()
const testCustomerId = `cus_existing_invite_${id}`
const testOrgEmail = `existing-invite-${id}@capgo.app`

let authHeaders: Record<string, string>

beforeAll(async () => {
  authHeaders = await getAuthHeaders()

  const { error: stripeError } = await getSupabaseClient().from('stripe_info').insert({
    customer_id: testCustomerId,
    status: 'succeeded',
    product_id: 'prod_LQIregjtNduh4q',
    subscription_id: `sub_${id}`,
    trial_at: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(),
    is_good_plan: true,
  })
  if (stripeError)
    throw stripeError

  const { error: orgError } = await getSupabaseClient().from('orgs').insert({
    id: testOrgId,
    name: `Existing Invite Org ${id}`,
    management_email: testOrgEmail,
    created_by: USER_ID,
    customer_id: testCustomerId,
    use_new_rbac: false,
  })
  if (orgError)
    throw orgError

  const { error: orgUsersError } = await getSupabaseClient().from('org_users').insert([
    {
      org_id: testOrgId,
      user_id: USER_ID,
      user_right: 'super_admin',
    },
    {
      org_id: testOrgId,
      user_id: USER_ID_NONMEMBER,
      user_right: 'invite_read',
    },
  ])
  if (orgUsersError)
    throw orgUsersError
})

afterAll(async () => {
  await getSupabaseClient().from('org_users').delete().eq('org_id', testOrgId)
  await getSupabaseClient().from('orgs').delete().eq('id', testOrgId)
  await getSupabaseClient().from('stripe_info').delete().eq('customer_id', testCustomerId)
})

describe('[POST] /private/send_existing_user_org_invite', () => {
  it('returns ok for an existing user with a pending org invitation', async () => {
    const response = await fetch(getEndpointUrl('/private/send_existing_user_org_invite'), {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        email: USER_EMAIL_NONMEMBER,
        org_id: testOrgId,
      }),
    })

    expect(response.status).toBe(200)
    const data = await response.json() as { status: string }
    expect(data.status).toBe('ok')
  })
})
