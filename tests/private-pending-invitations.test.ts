import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { getAuthHeadersForCredentials, getEndpointUrl, getSupabaseClient, PRODUCT_ID, USER_ID, USER_PASSWORD } from './test-utils.ts'

interface PendingInvitationFixture {
  runId: string
  invitedUserId: string
  orgId: string
  customerId: string
  invitedEmail: string
  storedInviteEmail: string
  orgEmail: string
}

function createFixture(): PendingInvitationFixture {
  const runId = randomUUID()
  const invitedEmail = `pending-invite-${runId}@capgo.app`
  return {
    runId,
    invitedUserId: randomUUID(),
    orgId: randomUUID(),
    customerId: `cus_pending_invite_${runId}`,
    invitedEmail,
    storedInviteEmail: invitedEmail.toUpperCase(),
    orgEmail: `pending-invite-org-${runId}@capgo.app`,
  }
}

async function cleanup(fixture: PendingInvitationFixture) {
  const supabase = getSupabaseClient()
  await supabase.from('role_bindings').delete().eq('principal_id', fixture.invitedUserId)
  await supabase.from('org_users').delete().eq('org_id', fixture.orgId)
  await supabase.from('tmp_users').delete().eq('org_id', fixture.orgId)
  await supabase.from('orgs').delete().eq('id', fixture.orgId)
  await supabase.from('stripe_info').delete().eq('customer_id', fixture.customerId)
  await supabase.from('users').delete().eq('id', fixture.invitedUserId)
  await supabase.auth.admin.deleteUser(fixture.invitedUserId)
}

async function seedPendingInvitation(fixture: PendingInvitationFixture) {
  const supabase = getSupabaseClient()

  const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
    id: fixture.invitedUserId,
    email: fixture.invitedEmail,
    password: USER_PASSWORD,
    email_confirm: true,
  })
  if (authError || !authUser.user)
    throw authError ?? new Error('Missing auth user')

  const { error: userError } = await supabase.from('users').insert({
    id: fixture.invitedUserId,
    email: fixture.invitedEmail,
    first_name: 'Pending',
    last_name: 'Invite',
  })
  if (userError)
    throw userError

  const { error: stripeError } = await supabase.from('stripe_info').insert({
    customer_id: fixture.customerId,
    status: 'succeeded',
    product_id: PRODUCT_ID,
    subscription_id: `sub_pending_invite_${fixture.runId}`,
    trial_at: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(),
    is_good_plan: true,
  })
  if (stripeError)
    throw stripeError

  const { error: orgError } = await supabase.from('orgs').insert({
    id: fixture.orgId,
    name: `Pending Invite Org ${fixture.runId}`,
    management_email: fixture.orgEmail,
    created_by: USER_ID,
    customer_id: fixture.customerId,
    use_new_rbac: true,
  })
  if (orgError)
    throw orgError

  const { data: invitation, error: tmpUserError } = await supabase.from('tmp_users').insert({
    email: fixture.storedInviteEmail,
    org_id: fixture.orgId,
    role: 'admin',
    rbac_role_name: 'org_admin',
    first_name: 'Pending',
    last_name: 'Invite',
  }).select('id').single()
  if (tmpUserError || !invitation)
    throw tmpUserError ?? new Error('Missing pending invitation')

  return invitation.id as number
}

async function getInvitedUserHeaders(fixture: PendingInvitationFixture) {
  return await getAuthHeadersForCredentials(fixture.invitedEmail, USER_PASSWORD)
}

describe('/private/pending_invitations', () => {
  it.concurrent('lists pending invitations without joining the organization', async () => {
    const fixture = createFixture()
    await cleanup(fixture)
    await seedPendingInvitation(fixture)

    try {
      const response = await fetch(getEndpointUrl('/private/pending_invitations'), {
        method: 'GET',
        headers: await getInvitedUserHeaders(fixture),
      })

      expect(response.status).toBe(200)
      const data = await response.json() as { invitations: Array<{ org_id: string, org_name: string, role: string }> }
      expect(data.invitations).toHaveLength(1)
      expect(data.invitations[0]).toMatchObject({
        org_id: fixture.orgId,
        role: 'org_admin',
      })

      const { data: membership, error: membershipError } = await getSupabaseClient()
        .from('org_users')
        .select('id')
        .eq('org_id', fixture.orgId)
        .eq('user_id', fixture.invitedUserId)
        .maybeSingle()

      expect(membershipError).toBeNull()
      expect(membership).toBeNull()
    }
    finally {
      await cleanup(fixture)
    }
  })

  it.concurrent('accepts a pending invitation only after an explicit join action', async () => {
    const fixture = createFixture()
    await cleanup(fixture)
    const invitationId = await seedPendingInvitation(fixture)

    try {
      const response = await fetch(getEndpointUrl('/private/pending_invitations'), {
        method: 'POST',
        headers: await getInvitedUserHeaders(fixture),
        body: JSON.stringify({
          action: 'accept',
          invitation_id: invitationId,
        }),
      })

      expect(response.status).toBe(200)
      const data = await response.json() as { status: string, accepted_org_id: string }
      expect(data.status).toBe('ok')
      expect(data.accepted_org_id).toBe(fixture.orgId)

      const supabase = getSupabaseClient()
      const { data: membership, error: membershipError } = await supabase
        .from('org_users')
        .select('user_right, rbac_role_name')
        .eq('org_id', fixture.orgId)
        .eq('user_id', fixture.invitedUserId)
        .maybeSingle()

      expect(membershipError).toBeNull()
      expect(membership).toMatchObject({
        user_right: 'admin',
        rbac_role_name: 'org_admin',
      })

      const { data: roleBinding, error: roleBindingError } = await supabase
        .from('role_bindings')
        .select('principal_type, principal_id, scope_type, org_id')
        .eq('org_id', fixture.orgId)
        .eq('principal_id', fixture.invitedUserId)
        .maybeSingle()

      expect(roleBindingError).toBeNull()
      expect(roleBinding).toMatchObject({
        principal_type: 'user',
        principal_id: fixture.invitedUserId,
        scope_type: 'org',
        org_id: fixture.orgId,
      })

      const { data: pendingInvite, error: pendingInviteError } = await supabase
        .from('tmp_users')
        .select('id')
        .eq('org_id', fixture.orgId)
        .eq('email', fixture.storedInviteEmail)
        .maybeSingle()

      expect(pendingInviteError).toBeNull()
      expect(pendingInvite).toBeNull()
    }
    finally {
      await cleanup(fixture)
    }
  })

  it.concurrent('declines pending invitations before creating an organization', async () => {
    const fixture = createFixture()
    await cleanup(fixture)
    await seedPendingInvitation(fixture)

    try {
      const response = await fetch(getEndpointUrl('/private/pending_invitations'), {
        method: 'POST',
        headers: await getInvitedUserHeaders(fixture),
        body: JSON.stringify({
          action: 'decline_all',
        }),
      })

      expect(response.status).toBe(200)
      const data = await response.json() as { status: string, declined_count: number, declined_org_ids: string[] }
      expect(data.status).toBe('ok')
      expect(data.declined_count).toBe(1)
      expect(data.declined_org_ids).toEqual([fixture.orgId])

      const supabase = getSupabaseClient()
      const { data: membership, error: membershipError } = await supabase
        .from('org_users')
        .select('id')
        .eq('org_id', fixture.orgId)
        .eq('user_id', fixture.invitedUserId)
        .maybeSingle()

      expect(membershipError).toBeNull()
      expect(membership).toBeNull()

      const { data: pendingInvite, error: pendingInviteError } = await supabase
        .from('tmp_users')
        .select('cancelled_at')
        .eq('org_id', fixture.orgId)
        .eq('email', fixture.storedInviteEmail)
        .maybeSingle()

      expect(pendingInviteError).toBeNull()
      expect(pendingInvite?.cancelled_at).toBeTruthy()
    }
    finally {
      await cleanup(fixture)
    }
  })
})
