import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { type } from 'arktype'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { parseSchema, safeParseSchema } from '../supabase/functions/_backend/utils/ark_validation.ts'

import {
  BASE_URL,
  getAuthHeadersForCredentials,
  getSupabaseClient,
  headers,
  normalizeLocalhostUrl,
  SUPABASE_ANON_KEY,
  SUPABASE_BASE_URL,
  TEST_EMAIL,
  USER_ADMIN_EMAIL,
  USER_EMAIL,
  USER_ID,
  USER_ID_2,
  USER_PASSWORD,
} from './test-utils.ts'

const normalizedSupabaseBaseUrl = normalizeLocalhostUrl(SUPABASE_BASE_URL) ?? SUPABASE_BASE_URL

const ORG_ID = randomUUID()
const globalId = randomUUID()
const name = `Test Organization ${globalId}`
const customerId = `cus_test_${ORG_ID}`
const website = 'https://test-organization.example/'

beforeAll(async () => {
  // Create stripe_info for this test org
  const { error: stripeError } = await getSupabaseClient().from('stripe_info').insert({
    customer_id: customerId,
    status: 'succeeded',
    product_id: 'prod_LQIregjtNduh4q',
    subscription_id: `sub_${globalId}`,
    trial_at: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(),
    is_good_plan: true,
  })
  if (stripeError)
    throw stripeError

  const { error } = await getSupabaseClient().from('orgs').insert({
    id: ORG_ID,
    name,
    management_email: TEST_EMAIL,
    created_by: USER_ID,
    customer_id: customerId,
    website,
    use_new_rbac: false, // Explicitly legacy — this suite tests the legacy permission path
  })
  if (error)
    throw error

  // Add the test user as super_admin to the org so they can access it via API
  const { error: orgUserError } = await getSupabaseClient().from('org_users').insert({
    org_id: ORG_ID,
    user_id: USER_ID,
    user_right: 'super_admin',
  })
  if (orgUserError)
    throw orgUserError
})

afterAll(async () => {
  // Clean up test organization, org_users relation, and stripe_info
  await getSupabaseClient().from('org_users').delete().eq('org_id', ORG_ID)
  await getSupabaseClient().from('orgs').delete().eq('id', ORG_ID)
  await getSupabaseClient().from('stripe_info').delete().eq('customer_id', customerId)
})

describe('read-mode API keys cannot access destructive organization routes', () => {
  const readOnlyOrgId = randomUUID()
  const readOnlyGlobalId = randomUUID()
  const readOnlyName = `Test Read-Only Organization ${readOnlyGlobalId}`
  const readOnlyCustomerId = `cus_test_${readOnlyOrgId}`
  let readOnlyKey = ''
  let readOnlyKeyId = 0
  const readOnlyHeaders = {
    'Content-Type': 'application/json',
  }

  beforeAll(async () => {
    const { error: stripeError } = await getSupabaseClient().from('stripe_info').insert({
      customer_id: readOnlyCustomerId,
      status: 'succeeded',
      product_id: 'prod_LQIregjtNduh4q',
      subscription_id: `sub_${readOnlyGlobalId}`,
      trial_at: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(),
      is_good_plan: true,
    })
    expect(stripeError).toBeNull()

    const { error: orgError } = await getSupabaseClient().from('orgs').insert({
      id: readOnlyOrgId,
      name: readOnlyName,
      management_email: TEST_EMAIL,
      created_by: USER_ID,
      customer_id: readOnlyCustomerId,
      require_apikey_expiration: false,
      use_new_rbac: false, // Explicitly legacy — this suite tests the legacy permission path
    })
    expect(orgError).toBeNull()

    const { error: orgUserError } = await getSupabaseClient().from('org_users').insert({
      org_id: readOnlyOrgId,
      user_id: USER_ID,
      user_right: 'super_admin',
    })
    expect(orgUserError).toBeNull()

    // Seed the key directly so this suite stays focused on organization-route auth.
    // API key creation behavior is covered in apikey-specific tests and can run in parallel.
    const { data: createdKey, error: createError } = await getSupabaseClient()
      .from('apikeys')
      .insert({
        user_id: USER_ID,
        key: randomUUID(),
        key_hash: null,
        mode: 'read',
        name: `Organization read-only regression ${randomUUID()}`,
        limited_to_orgs: [readOnlyOrgId],
      })
      .select('id, key')
      .single()

    expect(createError).toBeNull()
    expect(createdKey?.id).toBeTypeOf('number')
    expect(createdKey?.key).toBeTypeOf('string')
    if (!createdKey?.key || typeof createdKey.id !== 'number') {
      throw new Error('Failed to seed read-only API key')
    }

    readOnlyKey = createdKey.key
    readOnlyKeyId = createdKey.id
  })

  afterAll(async () => {
    if (readOnlyKeyId) {
      await getSupabaseClient().from('apikeys').delete().eq('id', readOnlyKeyId)
    }
    await getSupabaseClient().from('org_users').delete().eq('org_id', readOnlyOrgId)
    await getSupabaseClient().from('orgs').delete().eq('id', readOnlyOrgId)
    await getSupabaseClient().from('stripe_info').delete().eq('customer_id', readOnlyCustomerId)
  })

  it.concurrent('rejects POST /organization/members', async () => {
    const response = await fetch(`${BASE_URL}/organization/members`, {
      headers: { ...readOnlyHeaders, capgkey: readOnlyKey },
      method: 'POST',
      body: JSON.stringify({
        orgId: readOnlyOrgId,
        email: USER_ADMIN_EMAIL,
        invite_type: 'read',
      }),
    })

    expect(response.status).toBe(401)
  })

  it.concurrent('rejects DELETE /organization/members', async () => {
    const response = await fetch(`${BASE_URL}/organization/members?orgId=${readOnlyOrgId}&email=${USER_ADMIN_EMAIL}`, {
      headers: { ...readOnlyHeaders, capgkey: readOnlyKey },
      method: 'DELETE',
    })

    expect(response.status).toBe(401)
  })

  it.concurrent('rejects PUT /organization', async () => {
    const response = await fetch(`${BASE_URL}/organization`, {
      headers: { ...readOnlyHeaders, capgkey: readOnlyKey },
      method: 'PUT',
      body: JSON.stringify({
        orgId: readOnlyOrgId,
        name: `Blocked update ${randomUUID()}`,
      }),
    })

    expect(response.status).toBe(401)
  })

  it.concurrent('rejects POST /organization', async () => {
    const response = await fetch(`${BASE_URL}/organization`, {
      headers: { ...readOnlyHeaders, capgkey: readOnlyKey },
      method: 'POST',
      body: JSON.stringify({
        orgId: readOnlyOrgId,
        name: `Blocked create ${randomUUID()}`,
      }),
    })

    expect(response.status).toBe(401)
    // Ensure this is blocked by API-key auth (key mode allowlist), not by RLS deeper in the handler.
    const payload = await response.json() as { error?: string }
    expect(payload.error).toBe('invalid_apikey')
  })

  it.concurrent('rejects DELETE /organization', async () => {
    const response = await fetch(`${BASE_URL}/organization?orgId=${readOnlyOrgId}`, {
      headers: { ...readOnlyHeaders, capgkey: readOnlyKey },
      method: 'DELETE',
    })

    expect(response.status).toBe(401)
  })

  it.concurrent('allows GET /organization for accessible organizations', async () => {
    const response = await fetch(`${BASE_URL}/organization?orgId=${readOnlyOrgId}`, {
      headers: { ...readOnlyHeaders, capgkey: readOnlyKey },
      method: 'GET',
    })

    expect(response.status).toBe(200)
    const responseType = type({ id: 'string', name: 'string' })
    expect(parseSchema(responseType, await response.json())).toEqual(expect.objectContaining({ id: readOnlyOrgId, name: readOnlyName }))
  })

  it.concurrent('allows GET /organization/members for accessible organizations', async () => {
    const response = await fetch(`${BASE_URL}/organization/members?orgId=${readOnlyOrgId}`, {
      headers: { ...readOnlyHeaders, capgkey: readOnlyKey },
      method: 'GET',
    })

    expect(response.status).toBe(200)
    const members = type({
      uid: 'string',
      email: 'string',
      role: 'string',
    }).array()
    expect(parseSchema(members, await response.json()).some(member => member.uid === USER_ID)).toBe(true)
  })

  it.concurrent('allows GET /organization/members for same user without org scope limits', async () => {
    const response = await fetch(`${BASE_URL}/organization/members?orgId=${ORG_ID}`, {
      headers,
      method: 'GET',
    })

    expect(response.status).toBe(200)
    const members = type({
      uid: 'string',
      email: 'string',
      role: 'string',
    }).array()
    expect(parseSchema(members, await response.json()).some(member => member.uid === USER_ID)).toBe(true)
  })

  it.concurrent('rejects GET /organization/members outside limited_to_orgs scope', async () => {
    const response = await fetch(`${BASE_URL}/organization/members?orgId=${ORG_ID}`, {
      headers: { ...readOnlyHeaders, capgkey: readOnlyKey },
      method: 'GET',
    })

    expect(response.status).toBe(400)
    const payload = await response.json() as { error: string }
    expect(payload.error).toBe('cannot_access_organization')
  })

  it.concurrent('allows GET /organization/audit for accessible organizations', async () => {
    const response = await fetch(`${BASE_URL}/organization/audit?orgId=${readOnlyOrgId}`, {
      headers: { ...readOnlyHeaders, capgkey: readOnlyKey },
      method: 'GET',
    })

    expect(response.status).toBe(200)
    // The audit endpoint is allowed for read-mode keys; payload may be empty for a new org.
    expect(await response.json()).toBeDefined()
  })
})

describe('scoped write API keys cannot cross organization boundaries', () => {
  const allowedOrgId = randomUUID()
  const targetOrgId = randomUUID()
  const targetOrgName = `Scoped target ${randomUUID()}`
  const targetCustomerId = `cus_scope_target_${randomUUID()}`
  const scopedKeyName = `Scoped org write ${randomUUID()}`
  const imagePath = `org/${targetOrgId}/scope-bypass-${randomUUID()}.txt`
  let scopedKey = ''
  let scopedKeyId = 0

  beforeAll(async () => {
    const { error: stripeError } = await getSupabaseClient().from('stripe_info').insert({
      customer_id: targetCustomerId,
      status: 'succeeded',
      product_id: 'prod_LQIregjtNduh4q',
      subscription_id: `sub_${randomUUID()}`,
      trial_at: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(),
      is_good_plan: true,
    })
    expect(stripeError).toBeNull()

    const { error: allowedOrgError } = await getSupabaseClient().from('orgs').insert({
      id: allowedOrgId,
      name: `Scoped allowed ${randomUUID()}`,
      management_email: TEST_EMAIL,
      created_by: USER_ID,
      use_new_rbac: true,
    })
    expect(allowedOrgError).toBeNull()

    const { error: targetOrgError } = await getSupabaseClient().from('orgs').insert({
      id: targetOrgId,
      name: targetOrgName,
      management_email: TEST_EMAIL,
      created_by: USER_ID,
      customer_id: targetCustomerId,
      use_new_rbac: true,
    })
    expect(targetOrgError).toBeNull()

    const { data: createdKey, error: createKeyError } = await getSupabaseClient()
      .from('apikeys')
      .insert({
        user_id: USER_ID,
        key: randomUUID(),
        key_hash: null,
        mode: 'write',
        name: scopedKeyName,
        limited_to_orgs: [allowedOrgId],
      })
      .select('id, key')
      .single()

    expect(createKeyError).toBeNull()
    expect(createdKey?.key).toBeTruthy()
    expect(createdKey?.id).toBeTypeOf('number')

    if (!createdKey?.key || typeof createdKey.id !== 'number') {
      throw new Error('Failed to create scoped write API key')
    }

    scopedKey = createdKey.key
    scopedKeyId = createdKey.id

    const imageContent = new Blob(['scope bypass regression'], { type: 'text/plain' })
    const { error: uploadError } = await getSupabaseClient()
      .storage
      .from('images')
      .upload(imagePath, imageContent, {
        contentType: 'text/plain',
        upsert: true,
      })

    expect(uploadError).toBeNull()
  })

  afterAll(async () => {
    if (scopedKeyId) {
      await getSupabaseClient().from('apikeys').delete().eq('id', scopedKeyId)
    }

    await getSupabaseClient().storage.from('images').remove([imagePath])
    await getSupabaseClient().from('role_bindings').delete().eq('org_id', allowedOrgId)
    await getSupabaseClient().from('role_bindings').delete().eq('org_id', targetOrgId)
    await getSupabaseClient().from('org_users').delete().eq('org_id', allowedOrgId)
    await getSupabaseClient().from('org_users').delete().eq('org_id', targetOrgId)
    await getSupabaseClient().from('orgs').delete().eq('id', allowedOrgId)
    await getSupabaseClient().from('orgs').delete().eq('id', targetOrgId)
    await getSupabaseClient().from('stripe_info').delete().eq('customer_id', targetCustomerId)
  })

  it.concurrent('rejects DELETE /organization outside limited_to_orgs scope without deleting images', async () => {
    const response = await fetch(`${BASE_URL}/organization?orgId=${targetOrgId}`, {
      headers: {
        'Content-Type': 'application/json',
        'capgkey': scopedKey,
      },
      method: 'DELETE',
    })

    expect(response.status).toBe(403)
    const payload = await response.json() as { error: string }
    expect(payload.error).toBe('invalid_org_id')

    const { data: targetOrg, error: targetOrgError } = await getSupabaseClient()
      .from('orgs')
      .select('id')
      .eq('id', targetOrgId)
      .maybeSingle()

    expect(targetOrgError).toBeNull()
    expect(targetOrg?.id).toBe(targetOrgId)

    const { data: imageList, error: imageError } = await getSupabaseClient()
      .storage
      .from('images')
      .list(`org/${targetOrgId}`)

    expect(imageError).toBeNull()
    expect(imageList?.some(file => file.name === imagePath.split('/').at(-1))).toBe(true)
  })

  it.concurrent('rejects DELETE /organization/members outside limited_to_orgs scope without deleting role bindings', async () => {
    const addMemberResponse = await fetch(`${BASE_URL}/organization/members`, {
      headers,
      method: 'POST',
      body: JSON.stringify({
        orgId: targetOrgId,
        email: USER_ADMIN_EMAIL,
        invite_type: 'read',
      }),
    })
    expect(addMemberResponse.status).toBe(200)

    const { data: userData, error: userError } = await getSupabaseClient().from('users').select('id').eq('email', USER_ADMIN_EMAIL).single()
    expect(userError).toBeNull()
    expect(userData?.id).toBeTruthy()

    const { data: bindingsBefore, error: bindingsBeforeError } = await getSupabaseClient()
      .from('role_bindings')
      .select('id')
      .eq('principal_type', 'user')
      .eq('principal_id', userData!.id)
      .eq('org_id', targetOrgId)

    expect(bindingsBeforeError).toBeNull()
    expect(bindingsBefore!.length).toBeGreaterThan(0)

    const response = await fetch(`${BASE_URL}/organization/members?orgId=${targetOrgId}&email=${USER_ADMIN_EMAIL}`, {
      headers: {
        'Content-Type': 'application/json',
        'capgkey': scopedKey,
      },
      method: 'DELETE',
    })

    expect(response.status).toBe(400)
    const payload = await response.json() as { error: string }
    expect(payload.error).toBe('cannot_access_organization')

    const { data: membershipAfter, error: membershipAfterError } = await getSupabaseClient()
      .from('org_users')
      .select('org_id, user_id')
      .eq('org_id', targetOrgId)
      .eq('user_id', userData!.id)
      .maybeSingle()

    expect(membershipAfterError).toBeNull()
    expect(membershipAfter?.org_id).toBe(targetOrgId)

    const { data: bindingsAfter, error: bindingsAfterError } = await getSupabaseClient()
      .from('role_bindings')
      .select('id')
      .eq('principal_type', 'user')
      .eq('principal_id', userData!.id)
      .eq('org_id', targetOrgId)

    expect(bindingsAfterError).toBeNull()
    expect(bindingsAfter!.length).toBeGreaterThan(0)

    await getSupabaseClient().from('org_users').delete().eq('org_id', targetOrgId).eq('user_id', userData!.id)
  })
})

describe('x-limited-key-id subkeys enforce organization scope on middlewareKey routes', () => {
  const scopedOrgId = randomUUID()
  const blockedOrgId = randomUUID()
  const scopedCustomerId = `cus_scoped_${scopedOrgId}`
  const blockedCustomerId = `cus_blocked_${blockedOrgId}`
  let parentKey = ''
  let parentKeyId = 0
  let scopedSubkeyId = 0

  beforeAll(async () => {
    const supabase = getSupabaseClient()

    const { error: scopedStripeError } = await supabase.from('stripe_info').insert({
      customer_id: scopedCustomerId,
      status: 'succeeded',
      product_id: 'prod_LQIregjtNduh4q',
      subscription_id: `sub_${randomUUID()}`,
      trial_at: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(),
      is_good_plan: true,
    })
    expect(scopedStripeError).toBeNull()

    const { error: blockedStripeError } = await supabase.from('stripe_info').insert({
      customer_id: blockedCustomerId,
      status: 'succeeded',
      product_id: 'prod_LQIregjtNduh4q',
      subscription_id: `sub_${randomUUID()}`,
      trial_at: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(),
      is_good_plan: true,
    })
    expect(blockedStripeError).toBeNull()

    const { error: orgError } = await supabase.from('orgs').insert([
      {
        id: scopedOrgId,
        name: `Scoped org ${randomUUID()}`,
        management_email: TEST_EMAIL,
        created_by: USER_ID,
        customer_id: scopedCustomerId,
        use_new_rbac: false,
      },
      {
        id: blockedOrgId,
        name: `Blocked org ${randomUUID()}`,
        management_email: TEST_EMAIL,
        created_by: USER_ID,
        customer_id: blockedCustomerId,
        use_new_rbac: false,
      },
    ])
    expect(orgError).toBeNull()

    const { error: orgUsersError } = await supabase.from('org_users').insert([
      { org_id: scopedOrgId, user_id: USER_ID, user_right: 'super_admin' },
      { org_id: blockedOrgId, user_id: USER_ID, user_right: 'super_admin' },
    ])
    expect(orgUsersError).toBeNull()

    const { data: parentKeyData, error: parentKeyError } = await supabase
      .from('apikeys')
      .insert({
        user_id: USER_ID,
        key: randomUUID(),
        key_hash: null,
        mode: 'all',
        name: `Parent key ${randomUUID()}`,
        limited_to_orgs: [],
        limited_to_apps: [],
      })
      .select('id, key')
      .single()
    expect(parentKeyError).toBeNull()
    if (!parentKeyData?.key || typeof parentKeyData.id !== 'number') {
      throw new TypeError('Failed to seed parent API key')
    }
    parentKey = parentKeyData.key
    parentKeyId = parentKeyData.id

    const { data: subkeyData, error: subkeyError } = await supabase
      .from('apikeys')
      .insert({
        user_id: USER_ID,
        key: randomUUID(),
        key_hash: null,
        mode: 'read',
        name: `Scoped subkey ${randomUUID()}`,
        limited_to_orgs: [scopedOrgId],
        limited_to_apps: [],
      })
      .select('id')
      .single()
    expect(subkeyError).toBeNull()
    if (typeof subkeyData?.id !== 'number') {
      throw new TypeError('Failed to seed scoped subkey')
    }
    scopedSubkeyId = subkeyData.id
  })

  afterAll(async () => {
    const supabase = getSupabaseClient()

    if (scopedSubkeyId) {
      await supabase.from('apikeys').delete().eq('id', scopedSubkeyId)
    }
    if (parentKeyId) {
      await supabase.from('apikeys').delete().eq('id', parentKeyId)
    }

    await supabase.from('org_users').delete().in('org_id', [scopedOrgId, blockedOrgId])
    await supabase.from('orgs').delete().in('id', [scopedOrgId, blockedOrgId])
    await supabase.from('stripe_info').delete().in('customer_id', [scopedCustomerId, blockedCustomerId])
  })

  it.concurrent('limits GET /organization to the subkey org', async () => {
    const response = await fetch(`${BASE_URL}/organization`, {
      headers: {
        'Content-Type': 'application/json',
        'authorization': parentKey,
        'x-limited-key-id': String(scopedSubkeyId),
      },
      method: 'GET',
    })

    expect(response.status).toBe(200)
    const payload = z.array(z.object({ id: z.string(), name: z.string() })).parse(await response.json())
    expect(payload.map(org => org.id)).toEqual([scopedOrgId])
  })

  it.concurrent('rejects GET /organization/members outside the subkey org scope', async () => {
    const response = await fetch(`${BASE_URL}/organization/members?orgId=${blockedOrgId}`, {
      headers: {
        'Content-Type': 'application/json',
        'authorization': parentKey,
        'x-limited-key-id': String(scopedSubkeyId),
      },
      method: 'GET',
    })

    expect(response.status).toBe(400)
    const payload = await response.json() as { error: string }
    expect(payload.error).toBe('cannot_access_organization')
  })
})

describe('[GET] /organization', () => {
  it('get organization', async () => {
    const response = await fetch(`${BASE_URL}/organization`, {
      headers,
    })
    expect(response.status).toBe(200)
    const responseType = type({ id: 'string', name: 'string' }).array()
    expect(parseSchema(responseType, await response.json()).length).toBeGreaterThan(0)
  })

  it('get organization by id', async () => {
    const response = await fetch(`${BASE_URL}/organization?orgId=${ORG_ID}`, {
      headers,
    })
    expect(response.status).toBe(200)
    const responseType = type({ id: 'string', name: 'string', website: 'string | null' })
    const safe = safeParseSchema(responseType, await response.json())
    expect(safe.success).toBe(true)
    if (!safe.success)
      throw safe.error
    expect(safe.data).toEqual(expect.objectContaining({ id: ORG_ID, name, website }))
  })

  it('get organization with invalid orgId', async () => {
    const invalidOrgId = randomUUID()
    const response = await fetch(`${BASE_URL}/organization?orgId=${invalidOrgId}`, {
      headers,
    })
    expect(response.status).toBe(400)
    const responseData = await response.json() as { error: string }
    expect(responseData.error).toBe('invalid_org_id')
  })
})

describe('[GET] /organization/members', () => {
  it('get organization members', async () => {
    const response = await fetch(`${BASE_URL}/organization/members?orgId=${ORG_ID}`, {
      headers,
    })
    expect(response.status).toBe(200)
    const responseType = type({
      uid: 'string',
      email: 'string',
      image_url: 'string',
      role: 'string',
    }).array()
    const safe = safeParseSchema(responseType, await response.json())
    expect(safe.success).toBe(true)
    if (!safe.success)
      throw safe.error
    expect(safe.data.length).toBeGreaterThanOrEqual(1)

    const testUser = safe.data.find(m => m.uid === USER_ID)
    expect(testUser).toBeTruthy()
    expect(testUser?.email).toBe(USER_EMAIL)
    expect(testUser?.role).toBe('super_admin')
  })

  it('get organization members with missing orgId', async () => {
    const response = await fetch(`${BASE_URL}/organization/members`, {
      headers,
    })
    expect(response.status).toBe(400)
    const responseData = await response.json() as { error: string }
    expect(responseData.error).toBe('invalid_body')
  })

  it('get organization members with invalid orgId', async () => {
    const invalidOrgId = randomUUID()
    const response = await fetch(`${BASE_URL}/organization/members?orgId=${invalidOrgId}`, {
      headers,
    })
    expect(response.status).toBe(400)
    const responseData = await response.json() as { error: string }
    expect(responseData.error).toBe('cannot_access_organization')
  })

  it('get organization members includes pending invitations (tmp_users)', async () => {
    const testEmail = `pending-invite-${randomUUID()}@test.com`

    // Insert a pending invitation directly into tmp_users
    const { error: insertError } = await getSupabaseClient().from('tmp_users').insert({
      email: testEmail,
      org_id: ORG_ID,
      role: 'admin',
      first_name: 'Test',
      last_name: 'User',
    })
    expect(insertError).toBeNull()

    // Fetch members via API
    const response = await fetch(`${BASE_URL}/organization/members?orgId=${ORG_ID}`, {
      headers,
    })
    expect(response.status).toBe(200)

    const members = await response.json() as Array<{
      uid: string
      email: string
      role: string
      is_tmp?: boolean
    }>

    // Find the pending invitation
    const pendingMember = members.find(m => m.email === testEmail)
    expect(pendingMember).toBeTruthy()
    expect(pendingMember?.is_tmp).toBe(true)
    expect(pendingMember?.role).toBe('invite_admin') // Role should be prefixed with invite_

    // Cleanup
    await getSupabaseClient().from('tmp_users').delete().eq('email', testEmail).eq('org_id', ORG_ID)
  })

  it('get organization members excludes cancelled pending invitations', async () => {
    const testEmail = `cancelled-invite-${randomUUID()}@test.com`

    // Insert a cancelled pending invitation
    const { error: insertError } = await getSupabaseClient().from('tmp_users').insert({
      email: testEmail,
      org_id: ORG_ID,
      role: 'admin',
      first_name: 'Cancelled',
      last_name: 'User',
      cancelled_at: new Date().toISOString(),
    })
    expect(insertError).toBeNull()

    // Fetch members via API
    const response = await fetch(`${BASE_URL}/organization/members?orgId=${ORG_ID}`, {
      headers,
    })
    expect(response.status).toBe(200)

    const members = await response.json() as Array<{
      uid: string
      email: string
      role: string
      is_tmp?: boolean
    }>

    // The cancelled invitation should NOT be in the list
    const cancelledMember = members.find(m => m.email === testEmail)
    expect(cancelledMember).toBeUndefined()

    // Cleanup
    await getSupabaseClient().from('tmp_users').delete().eq('email', testEmail).eq('org_id', ORG_ID)
  })

  it('get organization members excludes expired pending invitations (older than 7 days)', async () => {
    const testEmail = `expired-invite-${randomUUID()}@test.com`

    // Insert an expired pending invitation (8 days ago)
    const expiredDate = new Date()
    expiredDate.setDate(expiredDate.getDate() - 8)

    const { error: insertError } = await getSupabaseClient().from('tmp_users').insert({
      email: testEmail,
      org_id: ORG_ID,
      role: 'read',
      first_name: 'Expired',
      last_name: 'User',
      created_at: expiredDate.toISOString(),
      updated_at: expiredDate.toISOString(),
    })
    expect(insertError).toBeNull()

    // Fetch members via API
    const response = await fetch(`${BASE_URL}/organization/members?orgId=${ORG_ID}`, {
      headers,
    })
    expect(response.status).toBe(200)

    const members = await response.json() as Array<{
      uid: string
      email: string
      role: string
      is_tmp?: boolean
    }>

    // The expired invitation should NOT be in the list
    const expiredMember = members.find(m => m.email === testEmail)
    expect(expiredMember).toBeUndefined()

    // Cleanup
    await getSupabaseClient().from('tmp_users').delete().eq('email', testEmail).eq('org_id', ORG_ID)
  })
})

describe('[POST] /organization/members', () => {
  it('add organization member', async () => {
    const response = await fetch(`${BASE_URL}/organization/members`, {
      headers,
      method: 'POST',
      body: JSON.stringify({
        orgId: ORG_ID,
        email: USER_ADMIN_EMAIL,
        invite_type: 'read',
      }),
    })

    const responseData = await response.json()
    expect(response.status).toBe(200)
    const responseType = type({
      status: 'string',
    })
    const safe = safeParseSchema(responseType, responseData)
    expect(safe.success).toBe(true)
    if (!safe.success)
      throw safe.error
    expect(safe.data.status).toBe('ok')

    const { data: userData, error: userError } = await getSupabaseClient().from('users').select().eq('email', USER_ADMIN_EMAIL).single()
    expect(userError).toBeNull()
    expect(userData).toBeTruthy()
    expect(userData?.email).toBe(USER_ADMIN_EMAIL)

    const { data, error } = await getSupabaseClient().from('org_users').select().eq('org_id', ORG_ID).eq('user_id', userData!.id).single()
    expect(error).toBeNull()
    expect(data).toBeTruthy()
    expect(data?.org_id).toBe(ORG_ID)
    expect(data?.user_right).toBe('invite_read')

    // Cleanup: Remove the added member to avoid affecting other tests
    await getSupabaseClient().from('org_users').delete().eq('org_id', ORG_ID).eq('user_id', userData!.id)
  })

  it('add organization member with invalid body', async () => {
    const response = await fetch(`${BASE_URL}/organization/members`, {
      headers,
      method: 'POST',
      body: JSON.stringify({}), // Missing required fields
    })
    expect(response.status).toBe(400)
    const responseData = await response.json() as { error: string }
    expect(responseData.error).toBe('invalid_json_parse_body')
  })

  it('add organization member with invalid orgId', async () => {
    const invalidOrgId = randomUUID()
    const response = await fetch(`${BASE_URL}/organization/members`, {
      headers,
      method: 'POST',
      body: JSON.stringify({
        orgId: invalidOrgId,
        email: USER_ADMIN_EMAIL,
        invite_type: 'read',
      }),
    })
    expect(response.status).toBe(400)
    const responseData = await response.json() as { error: string }
    expect(responseData.error).toBe('cannot_access_organization')
  })

  it('add organization member with missing email', async () => {
    const response = await fetch(`${BASE_URL}/organization/members`, {
      headers,
      method: 'POST',
      body: JSON.stringify({
        orgId: ORG_ID,
        invite_type: 'read',
      }),
    })
    expect(response.status).toBe(400)
    const responseData = await response.json() as { error: string }
    expect(responseData.error).toBe('invalid_body')
  })
})

describe('[DELETE] /organization/members', () => {
  it('delete organization member', async () => {
    const { data: userData, error: userError } = await getSupabaseClient().from('users').select().eq('email', USER_ADMIN_EMAIL).single()
    expect(userError).toBeNull()
    expect(userData).toBeTruthy()
    expect(userData?.email).toBe(USER_ADMIN_EMAIL)

    const { error } = await getSupabaseClient().from('org_users').insert({
      org_id: ORG_ID,
      user_id: userData!.id,
      user_right: 'read',
    })
    expect(error).toBeNull()

    // The sync_org_user_to_role_binding_on_insert trigger automatically creates role_bindings
    // when a user is added to org_users. Verify the trigger created the binding.
    const { data: rbacData, error: rbacFetchError } = await getSupabaseClient()
      .from('role_bindings')
      .select()
      .eq('principal_type', 'user')
      .eq('principal_id', userData!.id)
      .eq('org_id', ORG_ID)
    expect(rbacFetchError).toBeNull()
    expect(rbacData).toBeTruthy()
    expect(rbacData!.length).toBeGreaterThan(0)

    const response = await fetch(`${BASE_URL}/organization/members?orgId=${ORG_ID}&email=${USER_ADMIN_EMAIL}`, {
      headers,
      method: 'DELETE',
    })
    expect(response.status).toBe(200)
    const responseType = type({
      status: 'string',
    })
    const safe = safeParseSchema(responseType, await response.json())
    expect(safe.success).toBe(true)
    if (!safe.success)
      throw safe.error
    expect(safe.data.status).toBe('ok')

    const { data, error: orgUserError } = await getSupabaseClient().from('org_users').select().eq('org_id', ORG_ID).eq('user_id', userData!.id).single()
    expect(orgUserError).toBeTruthy()
    expect(data).toBeNull()

    // Verify role_bindings were also cleaned up
    const { data: rbacDataAfterDelete } = await getSupabaseClient().from('role_bindings').select().eq('principal_type', 'user').eq('principal_id', userData!.id).eq('org_id', ORG_ID)
    expect(rbacDataAfterDelete).toHaveLength(0)
  })

  it('delete organization member with invalid body', async () => {
    const response = await fetch(`${BASE_URL}/organization/members`, {
      headers,
      method: 'DELETE',
    })
    expect(response.status).toBe(400)
    const responseData = await response.json() as { error: string }
    expect(responseData.error).toBe('invalid_json_parse_body')
  })

  it('delete organization member with invalid orgId', async () => {
    const invalidOrgId = randomUUID()
    const response = await fetch(`${BASE_URL}/organization/members?orgId=${invalidOrgId}&email=${USER_ADMIN_EMAIL}`, {
      headers,
      method: 'DELETE',
    })
    expect(response.status).toBe(400)
    const responseData = await response.json() as { error: string }
    expect(responseData.error).toBe('cannot_access_organization')
  })

  it('delete organization member with non-existent email', async () => {
    const nonExistentEmail = `nonexistent-${randomUUID()}@example.com`
    const response = await fetch(`${BASE_URL}/organization/members?orgId=${ORG_ID}&email=${nonExistentEmail}`, {
      headers,
      method: 'DELETE',
    })
    expect(response.status).toBe(404)
    const responseData = await response.json() as { error: string }
    expect(responseData.error).toBe('user_not_found')
  })
})

describe('[POST] /organization', () => {
  it.concurrent('create organization', async () => {
    const name = `Created Organization ${new Date().toISOString()}`
    const website = 'HTTPS://capgo.app'
    const response = await fetch(`${BASE_URL}/organization`, {
      headers,
      method: 'POST',
      body: JSON.stringify({ name, website }),
    })
    expect(response.status).toBe(200)
    const responseType = type({
      id: 'string.uuid',
    })
    const safe = safeParseSchema(responseType, await response.json())
    expect(safe.success).toBe(true)
    if (!safe.success)
      throw safe.error
    expect(safe.data.id).toBeDefined()

    try {
      const { data, error } = await getSupabaseClient().from('orgs').select().eq('id', safe.data.id).single()
      expect(error).toBeNull()
      expect(data).toBeTruthy()
      expect(data?.name).toBe(name)
      expect(data?.website).toBe('https://capgo.app/')
      // New orgs should default to RBAC enabled
      expect(data?.use_new_rbac).toBe(true)
    }
    finally {
      await getSupabaseClient().from('orgs').delete().eq('id', safe.data.id)
    }
  })

  it('create organization with missing name', async () => {
    const response = await fetch(`${BASE_URL}/organization`, {
      headers,
      method: 'POST',
      body: JSON.stringify({}), // Missing name
    })
    expect(response.status).toBe(400)
    const responseData = await response.json() as { error: string }
    expect(responseData.error).toBe('invalid_json_parse_body')
  })

  it('create organization with invalid body format', async () => {
    const response = await fetch(`${BASE_URL}/organization`, {
      headers,
      method: 'POST',
      body: 'invalid json', // Invalid JSON
    })
    expect(response.status).toBeGreaterThanOrEqual(400)
  })

  it('create organization with empty name', async () => {
    const response = await fetch(`${BASE_URL}/organization`, {
      headers,
      method: 'POST',
      body: JSON.stringify({ name: '' }), // Empty name
    })
    expect(response.status).toBe(400)
    const responseData = await response.json() as { error: string }
    expect(responseData.error).toBe('invalid_body')
  })

  it.concurrent('create organization rejects invalid website scheme', async () => {
    const response = await fetch(`${BASE_URL}/organization`, {
      headers,
      method: 'POST',
      body: JSON.stringify({
        name: `Created Organization ${new Date().toISOString()}`,
        website: 'ftp://capgo.app',
      }),
    })
    expect(response.status).toBe(400)
    const responseData = await response.json() as { error: string }
    expect(responseData.error).toBe('invalid_body')
  })

  it.concurrent('create organization rejects credential-bearing website urls', async () => {
    const response = await fetch(`${BASE_URL}/organization`, {
      headers,
      method: 'POST',
      body: JSON.stringify({
        name: `Created Organization ${new Date().toISOString()}`,
        website: 'https://user:pass@capgo.app',
      }),
    })
    expect(response.status).toBe(400)
    const responseData = await response.json() as { error: string }
    expect(responseData.error).toBe('invalid_body')
  })
})

describe('[PUT] /organization', () => {
  it.concurrent('update organization', async () => {
    const orgId = randomUUID()
    const originalName = `Update Base Organization ${new Date().toISOString()}`
    const name = `Updated Organization ${new Date().toISOString()}`
    const website = 'https://www.capgo.app/docs'
    const { error: createError } = await getSupabaseClient().from('orgs').insert({
      id: orgId,
      name: originalName,
      management_email: TEST_EMAIL,
      created_by: USER_ID,
      website: 'https://base.example/',
      use_new_rbac: false,
    })
    if (createError)
      throw createError
    const { error: orgUserError } = await getSupabaseClient().from('org_users').insert({
      org_id: orgId,
      user_id: USER_ID,
      user_right: 'super_admin',
    })
    if (orgUserError)
      throw orgUserError

    try {
      const response = await fetch(`${BASE_URL}/organization`, {
        headers,
        method: 'PUT',
        body: JSON.stringify({ orgId, name, website }),
      })
      expect(response.status).toBe(200)
      const responseType = type({
        id: 'string.uuid',
        data: 'unknown',
      })
      const safe = safeParseSchema(responseType, await response.json())
      expect(safe.success).toBe(true)
      if (!safe.success)
        throw safe.error
      expect(safe.data.id).toBe(orgId)

      const { data, error } = await getSupabaseClient().from('orgs').select().eq('id', orgId).single()
      expect(error).toBeNull()
      expect(data).toBeTruthy()
      expect(data?.name).toBe(name)
      expect(data?.website).toBe(website)
    }
    finally {
      await getSupabaseClient().from('org_users').delete().eq('org_id', orgId)
      await getSupabaseClient().from('orgs').delete().eq('id', orgId)
    }
  })

  it('update organization with invalid body', async () => {
    const response = await fetch(`${BASE_URL}/organization`, {
      headers,
      method: 'PUT',
      body: JSON.stringify({}), // Missing required fields
    })
    expect(response.status).toBe(400)
    const responseData = await response.json() as { error: string }
    expect(responseData.error).toBe('invalid_json_parse_body')
  })

  it('update organization with invalid orgId', async () => {
    const invalidOrgId = randomUUID()
    const response = await fetch(`${BASE_URL}/organization`, {
      headers,
      method: 'PUT',
      body: JSON.stringify({ orgId: invalidOrgId, name: 'New Name' }),
    })
    expect(response.status).toBe(400)
    const responseData = await response.json() as { error: string }
    expect(responseData.error).toBe('cannot_access_organization')
  })

  it('update organization with missing orgId', async () => {
    const response = await fetch(`${BASE_URL}/organization`, {
      headers,
      method: 'PUT',
      body: JSON.stringify({ name: 'New Name' }), // Missing orgId
    })
    expect(response.status).toBe(400)
    const responseData = await response.json() as { error: string }
    expect(responseData.error).toBe('invalid_body')
  })

  it.concurrent('update organization rejects invalid website scheme', async () => {
    const response = await fetch(`${BASE_URL}/organization`, {
      headers,
      method: 'PUT',
      body: JSON.stringify({
        orgId: ORG_ID,
        name: `Updated Organization ${new Date().toISOString()}`,
        website: 'ftp://www.capgo.app/docs',
      }),
    })
    expect(response.status).toBe(400)
    const responseData = await response.json() as { error: string }
    expect(responseData.error).toBe('invalid_body')
  })

  it.concurrent('update organization rejects credential-bearing website urls', async () => {
    const response = await fetch(`${BASE_URL}/organization`, {
      headers,
      method: 'PUT',
      body: JSON.stringify({
        orgId: ORG_ID,
        name: `Updated Organization ${new Date().toISOString()}`,
        website: 'https://user:pass@www.capgo.app/docs',
      }),
    })
    expect(response.status).toBe(400)
    const responseData = await response.json() as { error: string }
    expect(responseData.error).toBe('invalid_body')
  })
})

describe('[DELETE] /organization', () => {
  it('delete organization successfully', async () => {
    const id = randomUUID()
    const customerId = `cus_test_${id}`
    const startDate = '2026-01-01'
    const endDate = '2026-01-31'

    // Create stripe_info for this test org
    const { error: stripeError } = await getSupabaseClient().from('stripe_info').insert({
      customer_id: customerId,
      status: 'succeeded',
      subscription_id: `sub_${id}`,
      product_id: 'prod_LQIregjtNduh4q',
      trial_at: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(),
      is_good_plan: true,
    })
    expect(stripeError).toBeNull()

    const { error } = await getSupabaseClient().from('orgs').insert({
      id,
      name: `Test Organization ${new Date().toISOString()}`,
      management_email: TEST_EMAIL,
      created_by: USER_ID,
      customer_id: customerId,
    })
    expect(error).toBeNull()

    const { data: dataOrg, error: errorOrg } = await getSupabaseClient().from('orgs').select().eq('id', id).single()
    expect(errorOrg).toBeNull()
    expect(dataOrg).toBeTruthy()

    const { error: metricsCacheError } = await getSupabaseClient().from('org_metrics_cache').insert({
      org_id: id,
      start_date: startDate,
      end_date: endDate,
      mau: 1,
      storage: 2,
      bandwidth: 3,
      build_time_unit: 4,
      get: 5,
      fail: 6,
      install: 7,
      uninstall: 8,
    })
    expect(metricsCacheError).toBeNull()

    const response = await fetch(`${BASE_URL}/organization?orgId=${id}`, {
      headers,
      method: 'DELETE',
    })
    expect(response.status).toBe(200)
    const responseData = await response.json() as { status: string }
    expect(responseData.status).toBe('ok')

    const { data: dataOrg2, error: errorOrg2 } = await getSupabaseClient().from('orgs').select().eq('id', id).single()
    expect(errorOrg2).toBeTruthy()
    expect(dataOrg2).toBeNull()

    const { data: cachedMetrics, error: cachedMetricsError } = await getSupabaseClient()
      .from('org_metrics_cache')
      .select('org_id')
      .eq('org_id', id)
      .maybeSingle()
    expect(cachedMetricsError).toBeNull()
    expect(cachedMetrics).toBeNull()

    await getSupabaseClient().from('stripe_info').delete().eq('customer_id', customerId)
  })

  it('delete organization with missing orgId', async () => {
    const response = await fetch(`${BASE_URL}/organization`, {
      headers,
      method: 'DELETE',
    })
    expect(response.status).toBe(400)
    const responseData = await response.json() as { error: string }
    expect(responseData.error).toBe('invalid_json_parse_body')
  })

  it('fail to delete non-existent organization', async () => {
    const nonExistentId = randomUUID()

    const response = await fetch(`${BASE_URL}/organization?orgId=${nonExistentId}`, {
      headers,
      method: 'DELETE',
    })

    // Should return error as the organization doesn't exist
    expect(response.status).toBeGreaterThanOrEqual(400)
    const responseData = await response.json() as { error: string }
    expect(responseData.error).not.toBe('Organization deleted')
  })

  it('fail to delete organization not owned by user', async () => {
    // First, get an existing user that's not our test user
    const { data: anotherUser, error: userError } = await getSupabaseClient()
      .from('users')
      .select('id')
      .neq('id', USER_ID)
      .limit(1)
      .single()

    expect(userError).toBeNull()
    expect(anotherUser).toBeTruthy()

    // Skip the test if we couldn't find another user
    if (!anotherUser) {
      console.warn('Skipping test: Could not find another user to use as owner')
      return
    }

    // Create organization with a different owner
    const id = randomUUID()
    const differentOwnerId = anotherUser.id
    const customerId = `cus_test_${id}`

    // Create stripe_info for this test org
    const { error: stripeError } = await getSupabaseClient().from('stripe_info').insert({
      customer_id: customerId,
      status: 'succeeded',
      subscription_id: `sub_${id}`,
      product_id: 'prod_LQIregjtNduh4q',
      trial_at: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(),
      is_good_plan: true,
    })
    expect(stripeError).toBeNull()

    const { error } = await getSupabaseClient().from('orgs').insert({
      id,
      name: `Organization Not Owned ${new Date().toISOString()}`,
      management_email: `not-owned-${id}@example.com`,
      created_by: differentOwnerId, // Use an existing user ID
      customer_id: customerId,
    })
    expect(error).toBeNull()

    // Verify organization was created
    const { data: dataOrg, error: errorOrg } = await getSupabaseClient().from('orgs').select().eq('id', id).single()
    expect(errorOrg).toBeNull()
    expect(dataOrg).toBeTruthy()

    if (dataOrg) {
      expect(dataOrg.created_by).toBe(differentOwnerId)
    }

    // Add test user as a member but not owner
    const { error: memberError } = await getSupabaseClient().from('org_users').insert({
      org_id: id,
      user_id: USER_ID,
      user_right: 'admin', // Even with admin rights, shouldn't be able to delete
    })
    expect(memberError).toBeNull()

    // Try to delete the organization
    const response = await fetch(`${BASE_URL}/organization?orgId=${id}`, {
      headers,
      method: 'DELETE',
    })

    // Should be forbidden since the user isn't the owner
    expect(response.status).toBe(403)
    const responseData = await response.json() as { error: string }
    expect(responseData.error).toBe('invalid_org_id')

    // Verify the organization still exists
    const { data: dataOrgAfter, error: errorOrgAfter } = await getSupabaseClient().from('orgs').select().eq('id', id).single()
    expect(errorOrgAfter).toBeNull()
    expect(dataOrgAfter).toBeTruthy()

    // Clean up
    await getSupabaseClient().from('org_users').delete().eq('org_id', id).eq('user_id', USER_ID)
    await getSupabaseClient().from('orgs').delete().eq('id', id)
    await getSupabaseClient().from('stripe_info').delete().eq('customer_id', customerId)
  })
})

describe('[PUT] /organization - enforce_hashed_api_keys setting', () => {
  const enforceOrgId = randomUUID()
  const enforceGlobalId = randomUUID()
  const enforceCustomerId = `cus_test_${enforceOrgId}`
  const enforceWebsite = 'https://hashed-enforcement.example/'
  let user2AuthHeaders: Record<string, string> | null = null

  beforeAll(async () => {
    const { error: stripeError } = await getSupabaseClient().from('stripe_info').insert({
      customer_id: enforceCustomerId,
      status: 'succeeded',
      product_id: 'prod_LQIregjtNduh4q',
      subscription_id: `sub_${enforceGlobalId}`,
      trial_at: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(),
      is_good_plan: true,
    })
    expect(stripeError).toBeNull()

    const { error: orgError } = await getSupabaseClient().from('orgs').insert({
      id: enforceOrgId,
      name: `Hashed Enforcement Organization ${enforceGlobalId}`,
      management_email: TEST_EMAIL,
      created_by: USER_ID_2,
      customer_id: enforceCustomerId,
      website: enforceWebsite,
      use_new_rbac: false,
    })
    expect(orgError).toBeNull()

    const { error: orgUserError } = await getSupabaseClient().from('org_users').insert({
      org_id: enforceOrgId,
      user_id: USER_ID_2,
      user_right: 'super_admin',
    })
    expect(orgUserError).toBeNull()

    user2AuthHeaders = await getAuthHeadersForCredentials('test2@capgo.app', USER_PASSWORD)
  })

  afterAll(async () => {
    await getSupabaseClient().from('org_users').delete().eq('org_id', enforceOrgId)
    await getSupabaseClient().from('orgs').delete().eq('id', enforceOrgId)
    await getSupabaseClient().from('stripe_info').delete().eq('customer_id', enforceCustomerId)
  })

  it('update organization enforce_hashed_api_keys to true', async () => {
    if (!user2AuthHeaders)
      throw new Error('Missing auth headers for test2@capgo.app')

    // First, ensure it's false
    await getSupabaseClient().from('orgs').update({ enforce_hashed_api_keys: false }).eq('id', enforceOrgId)

    const response = await fetch(`${BASE_URL}/organization`, {
      headers: user2AuthHeaders,
      method: 'PUT',
      body: JSON.stringify({
        orgId: enforceOrgId,
        enforce_hashed_api_keys: true,
      }),
    })
    expect(response.status).toBe(200)
    const responseData = await response.json() as { id: string, data: any }
    expect(responseData.id).toBe(enforceOrgId)

    // Verify the setting was updated
    const { data, error } = await getSupabaseClient().from('orgs').select('enforce_hashed_api_keys').eq('id', enforceOrgId).single()
    expect(error).toBeNull()
    expect(data?.enforce_hashed_api_keys).toBe(true)

    // Reset to false
    await getSupabaseClient().from('orgs').update({ enforce_hashed_api_keys: false }).eq('id', enforceOrgId)
  })

  it('update organization enforce_hashed_api_keys to false', async () => {
    if (!user2AuthHeaders)
      throw new Error('Missing auth headers for test2@capgo.app')

    // First, set it to true
    await getSupabaseClient().from('orgs').update({ enforce_hashed_api_keys: true }).eq('id', enforceOrgId)

    const response = await fetch(`${BASE_URL}/organization`, {
      headers: user2AuthHeaders,
      method: 'PUT',
      body: JSON.stringify({
        orgId: enforceOrgId,
        enforce_hashed_api_keys: false,
      }),
    })
    expect(response.status).toBe(200)
    const responseData = await response.json() as { id: string, data: any }
    expect(responseData.id).toBe(enforceOrgId)

    // Verify the setting was updated
    const { data, error } = await getSupabaseClient().from('orgs').select('enforce_hashed_api_keys').eq('id', enforceOrgId).single()
    expect(error).toBeNull()
    expect(data?.enforce_hashed_api_keys).toBe(false)
  })

  it('get_orgs_v7 returns enforce_hashed_api_keys field', async () => {
    // Set a known value
    const rpcWebsite = enforceWebsite
    const previousWebsite = enforceWebsite
    await getSupabaseClient().from('orgs').update({ enforce_hashed_api_keys: true, website: rpcWebsite }).eq('id', enforceOrgId)

    // Call get_orgs_v7 via RPC
    const { data, error } = await getSupabaseClient().rpc('get_orgs_v7', { userid: USER_ID_2 })
    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)

    // Find our test org
    const testOrg = data?.find((org: { gid: string }) => org.gid === enforceOrgId)
    expect(testOrg).toBeTruthy()
    expect(testOrg).toHaveProperty('enforce_hashed_api_keys')
    expect(testOrg!.enforce_hashed_api_keys).toBe(true)
    expect(testOrg).toHaveProperty('stats_updated_at')
    expect(testOrg).toHaveProperty('stats_refresh_requested_at')
    expect(testOrg).toHaveProperty('website')
    expect(testOrg!.website).toBe(rpcWebsite)

    // Reset
    await getSupabaseClient().from('orgs').update({ enforce_hashed_api_keys: false, website: previousWebsite }).eq('id', enforceOrgId)
  })

  it.concurrent('rejects public RPC access to get_orgs_v7(userid)', async () => {
    if (!normalizedSupabaseBaseUrl || !SUPABASE_ANON_KEY)
      throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY are required for this test')

    const publicSupabase = createClient(normalizedSupabaseBaseUrl, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: false,
      },
    })

    const { data, error } = await publicSupabase.rpc('get_orgs_v7', {
      userid: USER_ID,
    })

    expect(data).toBeNull()
    expect(error?.code).toBe('42501')
  })

  it.concurrent('rejects authenticated RPC access to get_orgs_v7(userid)', async () => {
    if (!normalizedSupabaseBaseUrl || !SUPABASE_ANON_KEY)
      throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY are required for this test')

    const authClient = createClient(normalizedSupabaseBaseUrl, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: false,
      },
    })

    const { error: signInError } = await authClient.auth.signInWithPassword({
      email: USER_EMAIL,
      password: USER_PASSWORD,
    })
    expect(signInError).toBeNull()

    const { data, error } = await authClient.rpc('get_orgs_v7', {
      userid: USER_ID,
    })

    expect(data).toBeNull()
    expect(error?.code).toBe('42501')

    await authClient.auth.signOut()
  })
})

// ─── RBAC mode coverage ──────────────────────────────────────────────────────
// New orgs default to use_new_rbac = true. The suite below runs the same key
// member operations against an explicitly RBAC-enabled org so that the RBAC
// permission path (role_bindings) is exercised alongside the legacy tests above.

const ORG_ID_RBAC = randomUUID()
const globalIdRbac = randomUUID()
const nameRbac = `RBAC Test Organization ${globalIdRbac}`

describe('rbac mode - organization member operations', () => {
  beforeAll(async () => {
    const { error } = await getSupabaseClient().from('orgs').insert({
      id: ORG_ID_RBAC,
      name: nameRbac,
      management_email: TEST_EMAIL,
      created_by: USER_ID,
      use_new_rbac: true, // Explicitly RBAC — tests the RBAC permission path
    })
    if (error)
      throw error

    // The generate_org_user_on_org_create trigger creates org_users(super_admin)
    // and role_bindings(org_super_admin) for created_by automatically.
  })

  afterAll(async () => {
    await getSupabaseClient().from('role_bindings').delete().eq('org_id', ORG_ID_RBAC)
    await getSupabaseClient().from('org_users').delete().eq('org_id', ORG_ID_RBAC)
    await getSupabaseClient().from('orgs').delete().eq('id', ORG_ID_RBAC)
  })

  it('[GET] /organization - get RBAC org by id', async () => {
    const response = await fetch(`${BASE_URL}/organization?orgId=${ORG_ID_RBAC}`, {
      headers,
    })
    expect(response.status).toBe(200)
    const responseType = type({ id: 'string', name: 'string' })
    const safe = safeParseSchema(responseType, await response.json())
    expect(safe.success).toBe(true)
    if (!safe.success)
      throw safe.error
    expect(safe.data).toEqual(expect.objectContaining({ id: ORG_ID_RBAC, name: nameRbac }))
  })

  it('[GET] /organization/members - returns members via role_bindings (RBAC path)', async () => {
    const response = await fetch(`${BASE_URL}/organization/members?orgId=${ORG_ID_RBAC}`, {
      headers,
    })
    expect(response.status).toBe(200)
    const responseType = type({
      uid: 'string',
      email: 'string',
      image_url: 'string',
      role: 'string',
    }).array()
    const safe = safeParseSchema(responseType, await response.json())
    expect(safe.success).toBe(true)
    if (!safe.success)
      throw safe.error

    const testUser = safe.data.find(m => m.uid === USER_ID)
    expect(testUser).toBeTruthy()
    expect(testUser?.email).toBe(USER_EMAIL)
    expect(testUser?.role).toBe('super_admin')
  })

  it('[PUT] /organization - update RBAC org name', async () => {
    const updatedName = `RBAC Updated ${new Date().toISOString()}`
    const response = await fetch(`${BASE_URL}/organization`, {
      headers,
      method: 'PUT',
      body: JSON.stringify({ orgId: ORG_ID_RBAC, name: updatedName }),
    })
    expect(response.status).toBe(200)
    const responseType = type({ id: 'string.uuid', data: 'unknown' })
    const safe = safeParseSchema(responseType, await response.json())
    expect(safe.success).toBe(true)
    if (!safe.success)
      throw safe.error
    expect(safe.data.id).toBe(ORG_ID_RBAC)
  })

  it('[POST] /organization/members - add member in RBAC mode (sync trigger creates role_binding)', async () => {
    const response = await fetch(`${BASE_URL}/organization/members`, {
      headers,
      method: 'POST',
      body: JSON.stringify({
        orgId: ORG_ID_RBAC,
        email: USER_ADMIN_EMAIL,
        invite_type: 'read',
      }),
    })
    expect(response.status).toBe(200)

    const { data: userData } = await getSupabaseClient().from('users').select().eq('email', USER_ADMIN_EMAIL).single()
    expect(userData).toBeTruthy()

    // Verify org_users entry exists
    const { data: orgUser } = await getSupabaseClient().from('org_users').select().eq('org_id', ORG_ID_RBAC).eq('user_id', userData!.id).single()
    expect(orgUser).toBeTruthy()
    expect(orgUser?.user_right).toBe('invite_read')

    // Verify role_binding was created by sync trigger
    const { data: binding } = await getSupabaseClient().from('role_bindings').select().eq('principal_type', 'user').eq('principal_id', userData!.id).eq('org_id', ORG_ID_RBAC)
    expect(binding).toBeTruthy()
    expect(binding!.length).toBeGreaterThan(0)

    // Cleanup
    await getSupabaseClient().from('org_users').delete().eq('org_id', ORG_ID_RBAC).eq('user_id', userData!.id)
  })

  it('[DELETE] /organization/members - remove member in RBAC mode cleans up role_bindings', async () => {
    const { data: userData } = await getSupabaseClient().from('users').select().eq('email', USER_ADMIN_EMAIL).single()
    expect(userData).toBeTruthy()

    // Add member (sync trigger creates role_binding)
    await getSupabaseClient().from('org_users').insert({
      org_id: ORG_ID_RBAC,
      user_id: userData!.id,
      user_right: 'read',
    })

    const { data: bindingsBefore } = await getSupabaseClient().from('role_bindings').select().eq('principal_type', 'user').eq('principal_id', userData!.id).eq('org_id', ORG_ID_RBAC)
    expect(bindingsBefore!.length).toBeGreaterThan(0)

    const response = await fetch(`${BASE_URL}/organization/members?orgId=${ORG_ID_RBAC}&email=${USER_ADMIN_EMAIL}`, {
      headers,
      method: 'DELETE',
    })
    expect(response.status).toBe(200)

    // org_users removed
    const { data: orgUserAfter } = await getSupabaseClient().from('org_users').select().eq('org_id', ORG_ID_RBAC).eq('user_id', userData!.id)
    expect(orgUserAfter).toHaveLength(0)

    // role_bindings also cleaned up
    const { data: bindingsAfter } = await getSupabaseClient().from('role_bindings').select().eq('principal_type', 'user').eq('principal_id', userData!.id).eq('org_id', ORG_ID_RBAC)
    expect(bindingsAfter).toHaveLength(0)
  })
})

describe('hashed API key enforcement integration', () => {
  it('find_apikey_by_value finds hashed key', async () => {
    // Create a hashed API key via API
    const createResponse = await fetch(`${BASE_URL}/apikey`, {
      headers,
      method: 'POST',
      body: JSON.stringify({
        name: 'test-hashed-key-for-find',
        mode: 'all',
        hashed: true,
      }),
    })
    const createData = await createResponse.json<{ key: string, key_hash: string, id: number }>()
    expect(createResponse.status).toBe(200)
    expect(createData.key).toBeTruthy()
    expect(createData.key_hash).toBeTruthy()

    // Use the plain key to find it via the database function
    const { data, error } = await getSupabaseClient().rpc('find_apikey_by_value', { key_value: createData.key })
    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
    expect(data!.length).toBe(1)
    expect(data![0].id).toBe(createData.id)
    expect(data![0].key_hash).toBe(createData.key_hash)
    // The key column should be null for hashed keys
    expect(data![0].key).toBeNull()

    // Cleanup
    await fetch(`${BASE_URL}/apikey/${createData.id}`, {
      headers,
      method: 'DELETE',
    })
  })

  it('find_apikey_by_value returns empty for non-existent key', async () => {
    const { data, error } = await getSupabaseClient().rpc('find_apikey_by_value', { key_value: 'non-existent-key-abc123' })
    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
    expect(data!.length).toBe(0)
  })

  it('verify_api_key_hash works correctly', async () => {
    const testKey = 'test-verification-key-xyz'

    // First, get what the hash should be by creating and checking a key
    // The hash is SHA-256 hex encoded
    const { data: hashResult, error: hashError } = await getSupabaseClient().rpc('verify_api_key_hash', {
      plain_key: testKey,
      stored_hash: '4b3c5c3c3b3a3938373635343332313029282726252423222120', // Wrong hash
    })
    expect(hashError).toBeNull()
    expect(hashResult).toBe(false)

    // Calculate correct hash using the function itself
    // We can test this by creating a hashed key and verifying
    const createResponse = await fetch(`${BASE_URL}/apikey`, {
      headers,
      method: 'POST',
      body: JSON.stringify({
        name: 'test-verify-hash-key',
        mode: 'all',
        hashed: true,
      }),
    })
    const createData = await createResponse.json<{ key: string, key_hash: string, id: number }>()
    expect(createResponse.status).toBe(200)

    // Verify the hash matches the plain key
    const { data: verifyResult, error: verifyError } = await getSupabaseClient().rpc('verify_api_key_hash', {
      plain_key: createData.key,
      stored_hash: createData.key_hash,
    })
    expect(verifyError).toBeNull()
    expect(verifyResult).toBe(true)

    // Cleanup
    await fetch(`${BASE_URL}/apikey/${createData.id}`, {
      headers,
      method: 'DELETE',
    })
  })
})
