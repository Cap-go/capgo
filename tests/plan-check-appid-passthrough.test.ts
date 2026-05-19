// Regression test for the "Plan upgrade required for upload" RBAC bug.
//
// Background: is_allowed_action_org_action(orgid, actions) internally calls
// check_min_rights with app_id = NULL. For an RBAC-managed API key with
// limited_to_apps set (typical for capgo CLI uploads bound to one app), the
// app-scope restriction in rbac_check_permission_direct denies the call
// because the key is restricted to apps but the caller passed no app context.
// The CLI then surfaces this as "Plan upgrade required for upload" even when
// the plan is healthy.
//
// The migration in 20260518071442_plan_check_passthrough_appid.sql adds a
// 3-arg overload that threads appid into check_min_rights. This test
// exercises all three paths via PostgREST so we catch any regression in:
//   1. The bug repro (2-arg call denies for limited_to_apps keys).
//   2. The fix (3-arg call with matching appid allows).
//   3. The safety invariant (3-arg call with non-matching appid still denies).

import type { Database } from '../src/types/supabase.types'
import { randomUUID } from 'node:crypto'
import { env } from 'node:process'
import { createClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getSupabaseClient, normalizeLocalhostUrl, SUPABASE_ANON_KEY } from './test-utils.ts'

const SUPABASE_URL = normalizeLocalhostUrl(env.SUPABASE_URL) ?? ''
const USE_CLOUDFLARE_WORKERS = env.USE_CLOUDFLARE_WORKERS === 'true'

if (!SUPABASE_URL)
  throw new Error('SUPABASE_URL is required for plan-check appid passthrough tests')
if (!SUPABASE_ANON_KEY)
  throw new Error('SUPABASE_ANON_KEY is required for plan-check appid passthrough tests')

const serviceRoleSupabase = getSupabaseClient()

const SUITE_ID = randomUUID()
const OWNER_EMAIL = `plan-check-owner-${SUITE_ID}@capgo.test`
const CUSTOMER_ID = `cus_plan_check_${SUITE_ID.replace(/-/g, '')}`
const PRIMARY_APP_ID = `com.capgo.test.primary.${SUITE_ID}`
const OTHER_APP_ID = `com.capgo.test.other.${SUITE_ID}`

let ownerUserId: string
let orgId: string
let primaryAppUuid: string
let otherAppUuid: string
let apiKeyPlain: string
let apiKeyRow: { id: number, rbac_id: string }

function createCapgkeyClient(apikey: string) {
  return createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        capgkey: apikey,
      },
    },
  })
}

describe.skipIf(USE_CLOUDFLARE_WORKERS)('plan-check appid passthrough (RBAC + limited_to_apps)', () => {
  beforeAll(async () => {
    // 1. User. public.users has a FK to auth.users, so we provision via
    //    auth admin first. The CLI authenticates by capgkey header, not by
    //    a Supabase JWT, but the FK still needs satisfying.
    const { data: authUser, error: authUserError } = await serviceRoleSupabase.auth.admin.createUser({
      email: OWNER_EMAIL,
      password: `Capgo!${SUITE_ID}`,
      email_confirm: true,
    })
    if (authUserError)
      throw authUserError
    ownerUserId = authUser.user.id

    const { error: userError } = await serviceRoleSupabase.from('users').insert({
      id: ownerUserId,
      email: OWNER_EMAIL,
    })
    if (userError)
      throw userError

    // 2. Healthy stripe_info. status = 'succeeded', no *_exceeded flags,
    //    so is_paying_and_good_plan_org_action's billing branch returns true
    //    once auth passes.
    const { data: planRow, error: planError } = await serviceRoleSupabase
      .from('plans')
      .select('stripe_id')
      .order('created_at', { ascending: true })
      .limit(1)
      .single()
    if (planError)
      throw planError

    const { error: stripeError } = await serviceRoleSupabase.from('stripe_info').insert({
      customer_id: CUSTOMER_ID,
      product_id: planRow.stripe_id,
      status: 'succeeded',
      subscription_anchor_start: new Date(Date.now() - 10 * 86400_000).toISOString(),
      subscription_anchor_end: new Date(Date.now() + 20 * 86400_000).toISOString(),
    })
    if (stripeError)
      throw stripeError

    // 3. Org with use_new_rbac = true so check_min_rights routes through
    //    rbac_check_permission_direct (the function that has the
    //    limited_to_apps gate).
    const { data: orgRow, error: orgError } = await serviceRoleSupabase
      .from('orgs')
      .insert({
        created_by: ownerUserId,
        name: `Plan Check Test Org ${SUITE_ID}`,
        management_email: OWNER_EMAIL,
        customer_id: CUSTOMER_ID,
        use_new_rbac: true,
      })
      .select('id')
      .single()
    if (orgError)
      throw orgError
    orgId = orgRow.id

    // 4. Two apps in the same org - one the key is allowed for, one it isn't.
    //    Same-org apps prove the rejection comes from limited_to_apps, not from
    //    the cross-org check in check_min_rights.
    const { data: primaryAppRow, error: primaryAppError } = await serviceRoleSupabase
      .from('apps')
      .insert({
        app_id: PRIMARY_APP_ID,
        name: 'Plan Check Primary App',
        icon_url: 'https://example.test/icon.png',
        user_id: ownerUserId,
        owner_org: orgId,
      })
      .select('id')
      .single()
    if (primaryAppError)
      throw primaryAppError
    if (!primaryAppRow.id)
      throw new Error('Expected primary app insert to return an id')
    primaryAppUuid = primaryAppRow.id

    const { data: otherAppRow, error: otherAppError } = await serviceRoleSupabase
      .from('apps')
      .insert({
        app_id: OTHER_APP_ID,
        name: 'Plan Check Other App',
        icon_url: 'https://example.test/icon.png',
        user_id: ownerUserId,
        owner_org: orgId,
      })
      .select('id')
      .single()
    if (otherAppError)
      throw otherAppError
    if (!otherAppRow.id)
      throw new Error('Expected other app insert to return an id')
    otherAppUuid = otherAppRow.id

    // 5. RBAC-managed API key: mode = NULL, limited_to_apps = [PRIMARY_APP_ID],
    //    distinct rbac_id used as the role-binding principal. The
    //    apikeys_force_server_key trigger overrides whatever we pass in
    //    for `key` and replaces it with a server-generated UUID, so we
    //    must read the actual key back from the INSERT ... RETURNING
    //    result (the AFTER trigger that strips the plain key for hashed
    //    keys is DEFERRABLE INITIALLY DEFERRED and runs at commit, so
    //    the RETURNING clause still sees the plaintext).
    const rbacId = randomUUID()
    const { data: apikeyRow, error: apikeyError } = await serviceRoleSupabase
      .from('apikeys')
      .insert({
        user_id: ownerUserId,
        key: randomUUID(),
        mode: null,
        name: `plan-check-rbac-${SUITE_ID}`,
        limited_to_apps: [PRIMARY_APP_ID],
        limited_to_orgs: [orgId],
        rbac_id: rbacId,
      })
      .select('id, rbac_id, key')
      .single()
    if (apikeyError)
      throw apikeyError
    if (!apikeyRow.rbac_id)
      throw new Error('Expected apikey insert to return rbac_id')
    if (!apikeyRow.key)
      throw new Error('Expected plaintext key in apikey insert RETURNING row')
    apiKeyRow = { id: apikeyRow.id, rbac_id: apikeyRow.rbac_id }
    apiKeyPlain = apikeyRow.key

    // 6. Role bindings: org_member at org scope gives org.read,
    //    app_uploader at app scope gives app.read / app.upload_bundle.
    //    Mirrors what /apikey POST creates for a CLI-issued RBAC key.
    const { data: orgRoleRow, error: orgRoleError } = await serviceRoleSupabase
      .from('roles')
      .select('id')
      .eq('name', 'org_member')
      .single()
    if (orgRoleError)
      throw orgRoleError

    const { data: appRoleRow, error: appRoleError } = await serviceRoleSupabase
      .from('roles')
      .select('id')
      .eq('name', 'app_uploader')
      .single()
    if (appRoleError)
      throw appRoleError

    const { error: bindingError } = await serviceRoleSupabase.from('role_bindings').insert([
      {
        principal_type: 'apikey',
        principal_id: apiKeyRow.rbac_id,
        role_id: orgRoleRow.id,
        scope_type: 'org',
        org_id: orgId,
        granted_by: ownerUserId,
        is_direct: true,
      },
      {
        principal_type: 'apikey',
        principal_id: apiKeyRow.rbac_id,
        role_id: appRoleRow.id,
        scope_type: 'app',
        org_id: orgId,
        app_id: primaryAppUuid,
        granted_by: ownerUserId,
        is_direct: true,
      },
    ])
    if (bindingError)
      throw bindingError
  })

  afterAll(async () => {
    if (apiKeyRow?.id)
      await serviceRoleSupabase.from('role_bindings').delete().eq('principal_id', apiKeyRow.rbac_id)
    if (apiKeyRow?.id)
      await serviceRoleSupabase.from('apikeys').delete().eq('id', apiKeyRow.id)
    if (primaryAppUuid)
      await serviceRoleSupabase.from('apps').delete().eq('id', primaryAppUuid)
    if (otherAppUuid)
      await serviceRoleSupabase.from('apps').delete().eq('id', otherAppUuid)
    if (orgId)
      await serviceRoleSupabase.from('orgs').delete().eq('id', orgId)
    await serviceRoleSupabase.from('stripe_info').delete().eq('customer_id', CUSTOMER_ID)
    if (ownerUserId) {
      await serviceRoleSupabase.from('users').delete().eq('id', ownerUserId)
      await serviceRoleSupabase.auth.admin.deleteUser(ownerUserId)
    }
  })

  it('denies the 2-arg call (regression of the original bug)', async () => {
    const client = createCapgkeyClient(apiKeyPlain)
    const { data, error } = await client.rpc('is_allowed_action_org_action', {
      orgid: orgId,
      actions: ['storage'],
    })
    expect(error).toBeNull()
    // Limited_to_apps key + null app context => RBAC app-scope restriction
    // denies. Before the fix, the CLI's checkPlanValidUpload always called
    // this 2-arg variant and tripped this path.
    expect(data).toBe(false)
  })

  it('allows the 3-arg call when appid matches limited_to_apps (the fix)', async () => {
    const client = createCapgkeyClient(apiKeyPlain)
    const args = {
      orgid: orgId,
      actions: ['storage'],
      appid: PRIMARY_APP_ID,
    } as never
    const { data, error } = await client.rpc('is_allowed_action_org_action', args)
    expect(error).toBeNull()
    expect(data).toBe(true)
  })

  it('still denies the 3-arg call when appid does not match limited_to_apps (safety invariant)', async () => {
    const client = createCapgkeyClient(apiKeyPlain)
    const args = {
      orgid: orgId,
      actions: ['storage'],
      appid: OTHER_APP_ID,
    } as never
    const { data, error } = await client.rpc('is_allowed_action_org_action', args)
    expect(error).toBeNull()
    // Key is limited_to_apps = [PRIMARY_APP_ID], so an upload-plan check for
    // OTHER_APP_ID must still be rejected even though both apps are in the
    // same org.
    expect(data).toBe(false)
  })
})
