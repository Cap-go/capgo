import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'
import { getAuthHeadersForCredentials, getEndpointUrl, getSupabaseClient, PRODUCT_ID, USER_ID, USER_PASSWORD } from './test-utils.ts'

const runId = randomUUID()
const invitedUserId = randomUUID()
const orgId = randomUUID()
const customerId = `cus_pending_invite_${runId}`
const invitedEmail = `pending-invite-${runId}@capgo.app`
const storedInviteEmail = invitedEmail.toUpperCase()
const orgEmail = `pending-invite-org-${runId}@capgo.app`

async function cleanup() {
  const supabase = getSupabaseClient()
  await supabase.from('role_bindings').delete().eq('principal_id', invitedUserId)
  await supabase.from('org_users').delete().eq('org_id', orgId)
  await supabase.from('tmp_users').delete().eq('org_id', orgId)
  await supabase.from('orgs').delete().eq('id', orgId)
  await supabase.from('stripe_info').delete().eq('customer_id', customerId)
  await supabase.from('users').delete().eq('id', invitedUserId)
  await supabase.auth.admin.deleteUser(invitedUserId)
}

async function seedPendingInvitation() {
  const supabase = getSupabaseClient()

  const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
    id: invitedUserId,
    email: invitedEmail,
    password: USER_PASSWORD,
    email_confirm: true,
  })
  if (authError || !authUser.user)
    throw authError ?? new Error('Missing auth user')

  const { error: userError } = await supabase.from('users').insert({
    id: invitedUserId,
    email: invitedEmail,
    first_name: 'Pending',
    last_name: 'Invite',
  })
  if (userError)
    throw userError

  const { error: stripeError } = await supabase.from('stripe_info').insert({
    customer_id: customerId,
    status: 'succeeded',
    product_id: PRODUCT_ID,
    subscription_id: `sub_pending_invite_${runId}`,
    trial_at: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(),
    is_good_plan: true,
  })
  if (stripeError)
    throw stripeError

  const { error: orgError } = await supabase.from('orgs').insert({
    id: orgId,
    name: `Pending Invite Org ${runId}`,
    management_email: orgEmail,
    created_by: USER_ID,
    customer_id: customerId,
    use_new_rbac: true,
  })
  if (orgError)
    throw orgError

  const { data: invitation, error: tmpUserError } = await supabase.from('tmp_users').insert({
    email: storedInviteEmail,
    org_id: orgId,
    role: 'admin',
    rbac_role_name: 'org_admin',
    first_name: 'Pending',
    last_name: 'Invite',
  }).select('id').single()
  if (tmpUserError || !invitation)
    throw tmpUserError ?? new Error('Missing pending invitation')

  return invitation.id as number
}

async function getInvitedUserHeaders() {
  return await getAuthHeadersForCredentials(invitedEmail, USER_PASSWORD)
}

afterEach(async () => {
  await cleanup()
})

describe('/private/pending_invitations', () => {
  it('lists pending invitations without joining the organization', async () => {
    await cleanup()
    await seedPendingInvitation()

    const response = await fetch(getEndpointUrl('/private/pending_invitations'), {
      method: 'GET',
      headers: await getInvitedUserHeaders(),
    })

    expect(response.status).toBe(200)
    const data = await response.json() as { invitations: Array<{ org_id: string, org_name: string, role: string }> }
    expect(data.invitations).toHaveLength(1)
    expect(data.invitations[0]).toMatchObject({
      org_id: orgId,
      role: 'org_admin',
    })

    const { data: membership, error: membershipError } = await getSupabaseClient()
      .from('org_users')
      .select('id')
      .eq('org_id', orgId)
      .eq('user_id', invitedUserId)
      .maybeSingle()

    expect(membershipError).toBeNull()
    expect(membership).toBeNull()
  })

  it('accepts a pending invitation only after an explicit join action', async () => {
    await cleanup()
    const invitationId = await seedPendingInvitation()

    const response = await fetch(getEndpointUrl('/private/pending_invitations'), {
      method: 'POST',
      headers: await getInvitedUserHeaders(),
      body: JSON.stringify({
        action: 'accept',
        invitation_id: invitationId,
      }),
    })

    expect(response.status).toBe(200)
    const data = await response.json() as { status: string, accepted_org_id: string }
    expect(data.status).toBe('ok')
    expect(data.accepted_org_id).toBe(orgId)

    const supabase = getSupabaseClient()
    const { data: membership, error: membershipError } = await supabase
      .from('org_users')
      .select('user_right, rbac_role_name')
      .eq('org_id', orgId)
      .eq('user_id', invitedUserId)
      .maybeSingle()

    expect(membershipError).toBeNull()
    expect(membership).toMatchObject({
      user_right: 'admin',
      rbac_role_name: 'org_admin',
    })

    const { data: roleBinding, error: roleBindingError } = await supabase
      .from('role_bindings')
      .select('principal_type, principal_id, scope_type, org_id')
      .eq('org_id', orgId)
      .eq('principal_id', invitedUserId)
      .maybeSingle()

    expect(roleBindingError).toBeNull()
    expect(roleBinding).toMatchObject({
      principal_type: 'user',
      principal_id: invitedUserId,
      scope_type: 'org',
      org_id: orgId,
    })

    const { data: pendingInvite, error: pendingInviteError } = await supabase
      .from('tmp_users')
      .select('id')
      .eq('org_id', orgId)
      .eq('email', storedInviteEmail)
      .maybeSingle()

    expect(pendingInviteError).toBeNull()
    expect(pendingInvite).toBeNull()
  })

  it('declines pending invitations before creating an organization', async () => {
    await cleanup()
    await seedPendingInvitation()

    const response = await fetch(getEndpointUrl('/private/pending_invitations'), {
      method: 'POST',
      headers: await getInvitedUserHeaders(),
      body: JSON.stringify({
        action: 'decline_all',
      }),
    })

    expect(response.status).toBe(200)
    const data = await response.json() as { status: string, declined_count: number, declined_org_ids: string[] }
    expect(data.status).toBe('ok')
    expect(data.declined_count).toBe(1)
    expect(data.declined_org_ids).toEqual([orgId])

    const supabase = getSupabaseClient()
    const { data: membership, error: membershipError } = await supabase
      .from('org_users')
      .select('id')
      .eq('org_id', orgId)
      .eq('user_id', invitedUserId)
      .maybeSingle()

    expect(membershipError).toBeNull()
    expect(membership).toBeNull()

    const { data: pendingInvite, error: pendingInviteError } = await supabase
      .from('tmp_users')
      .select('cancelled_at')
      .eq('org_id', orgId)
      .eq('email', storedInviteEmail)
      .maybeSingle()

    expect(pendingInviteError).toBeNull()
    expect(pendingInvite?.cancelled_at).toBeTruthy()
  })
})
