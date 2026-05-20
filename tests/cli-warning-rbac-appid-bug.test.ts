// Regression test for the CLI warning that fires on @capgo/cli versions
// older than 7.107.0 when the caller's API key meets the conditions that
// trigger the PR #2282 appid-passthrough bug.
//
// The condition matrix this test exercises:
//
//   | mode    | limited_to_apps | use_new_rbac | cli_version  | fires? |
//   |---------|-----------------|--------------|--------------|--------|
//   | NULL    | non-empty       | true         | 7.106.0      | YES    |  (the bug case)
//   | NULL    | non-empty       | true         | 7.107.0      | NO     |  (cutoff)
//   | NULL    | non-empty       | true         | 7.107.1      | NO     |  (above cutoff)
//   | 'all'   | non-empty       | true         | 7.106.0      | NO     |  (not RBAC v2)
//   | NULL    | empty           | true         | 7.106.0      | NO     |  (no app restriction)
//   | NULL    | non-empty       | false        | 7.106.0      | NO     |  (RBAC off for org)
//
// Test plumbing matches tests/plan-check-appid-passthrough.test.ts:
//   - Auth admin createUser for the FK on public.users.
//   - The apikeys_force_server_key trigger overrides whatever `key` we pass,
//     so we read the actual plaintext back from INSERT ... RETURNING.

import type { Database } from '../src/types/supabase.types'
import { randomUUID } from 'node:crypto'
import { env } from 'node:process'
import { createClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getSupabaseClient, normalizeLocalhostUrl, SUPABASE_ANON_KEY } from './test-utils.ts'

const SUPABASE_URL = normalizeLocalhostUrl(env.SUPABASE_URL) ?? ''
const USE_CLOUDFLARE_WORKERS = env.USE_CLOUDFLARE_WORKERS === 'true'

if (!SUPABASE_URL)
  throw new Error('SUPABASE_URL is required for cli-warning-rbac-appid-bug tests')
if (!SUPABASE_ANON_KEY)
  throw new Error('SUPABASE_ANON_KEY is required for cli-warning-rbac-appid-bug tests')

const serviceRoleSupabase = getSupabaseClient()

const SUITE_ID = randomUUID()
const OWNER_EMAIL = `cli-warn-owner-${SUITE_ID}@capgo.test`
const CUSTOMER_ID = `cus_cli_warn_${SUITE_ID.replace(/-/g, '')}`
const APP_ID = `com.capgo.test.cli-warn.${SUITE_ID}`

let ownerUserId: string
let orgId: string
let appUuid: string

interface KeyHandle {
  id: number
  rbacId: string
  plain: string
}

interface CreateKeyOptions {
  mode: 'all' | null
  limitedToApps: string[]
}

async function provisionKey({ mode, limitedToApps }: CreateKeyOptions): Promise<KeyHandle> {
  const rbacId = randomUUID()
  const { data: row, error } = await serviceRoleSupabase
    .from('apikeys')
    .insert({
      user_id: ownerUserId,
      key: randomUUID(),
      mode,
      name: `cli-warn-${mode ?? 'rbacv2'}-${randomUUID()}`,
      limited_to_apps: limitedToApps,
      limited_to_orgs: [orgId],
      rbac_id: rbacId,
    })
    .select('id, rbac_id, key')
    .single()
  if (error)
    throw error
  if (!row.rbac_id)
    throw new Error('Expected apikey insert to return rbac_id')
  if (!row.key)
    throw new Error('Expected plaintext key in apikey insert RETURNING row')

  if (mode === null) {
    // RBAC v2 keys need at least one role binding so the org-read check inside
    // get_organization_cli_warnings doesn't reject the key with the "API key
    // does not have read access" warning before our new check runs.
    const { data: orgRole, error: roleError } = await serviceRoleSupabase
      .from('roles').select('id').eq('name', 'org_member').single()
    if (roleError)
      throw roleError
    const { error: bindError } = await serviceRoleSupabase.from('role_bindings').insert({
      principal_type: 'apikey',
      principal_id: row.rbac_id,
      role_id: orgRole.id,
      scope_type: 'org',
      org_id: orgId,
      granted_by: ownerUserId,
      is_direct: true,
    })
    if (bindError)
      throw bindError
  }

  return { id: row.id, rbacId: row.rbac_id, plain: row.key }
}

function capgkeyClient(key: string) {
  return createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { capgkey: key } },
  })
}

interface Warning {
  message: string
  fatal: boolean
}

async function callWarnings(key: string, cliVersion: string): Promise<Warning[]> {
  const client = capgkeyClient(key)
  const { data, error } = await client.rpc('get_organization_cli_warnings', {
    orgid: orgId,
    cli_version: cliVersion,
  })
  if (error)
    throw error
  return (data ?? []) as unknown as Warning[]
}

const RBAC_BUG_MARKER = 'CLI version'
const RBAC_BUG_HINT = '7.107.0'

function hasRbacBugWarning(warnings: Warning[]) {
  return warnings.some(w =>
    w.fatal === true
    && w.message.includes(RBAC_BUG_MARKER)
    && w.message.includes(RBAC_BUG_HINT),
  )
}

async function cleanupKey(handle: KeyHandle) {
  await serviceRoleSupabase.from('role_bindings').delete().eq('principal_id', handle.rbacId)
  await serviceRoleSupabase.from('apikeys').delete().eq('id', handle.id)
}

describe.skipIf(USE_CLOUDFLARE_WORKERS)('CLI warning: RBAC v2 + limited_to_apps + old CLI (PR #2282)', () => {
  beforeAll(async () => {
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

    const { data: planRow, error: planError } = await serviceRoleSupabase
      .from('plans').select('stripe_id').order('created_at', { ascending: true }).limit(1).single()
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

    const { data: orgRow, error: orgError } = await serviceRoleSupabase
      .from('orgs')
      .insert({
        created_by: ownerUserId,
        name: `CLI Warn Test Org ${SUITE_ID}`,
        management_email: OWNER_EMAIL,
        customer_id: CUSTOMER_ID,
        use_new_rbac: true,
      })
      .select('id')
      .single()
    if (orgError)
      throw orgError
    orgId = orgRow.id

    const { data: appRow, error: appError } = await serviceRoleSupabase
      .from('apps')
      .insert({
        app_id: APP_ID,
        name: 'CLI Warn Test App',
        icon_url: 'https://example.test/icon.png',
        user_id: ownerUserId,
        owner_org: orgId,
      })
      .select('id')
      .single()
    if (appError)
      throw appError
    if (!appRow.id)
      throw new Error('Expected app insert to return id')
    appUuid = appRow.id
  })

  afterAll(async () => {
    if (appUuid)
      await serviceRoleSupabase.from('apps').delete().eq('id', appUuid)
    if (orgId)
      await serviceRoleSupabase.from('orgs').delete().eq('id', orgId)
    await serviceRoleSupabase.from('stripe_info').delete().eq('customer_id', CUSTOMER_ID)
    if (ownerUserId) {
      await serviceRoleSupabase.from('users').delete().eq('id', ownerUserId)
      await serviceRoleSupabase.auth.admin.deleteUser(ownerUserId)
    }
  })

  it('fires fatal for RBAC v2 key with limited_to_apps on use_new_rbac org running CLI < 7.107.0', async () => {
    const key = await provisionKey({ mode: null, limitedToApps: [APP_ID] })
    try {
      const warnings = await callWarnings(key.plain, '7.106.0')
      expect(hasRbacBugWarning(warnings)).toBe(true)
      const w = warnings.find(x => hasRbacBugWarning([x]))!
      expect(w.message).toContain('npm i -g @capgo/cli@latest')
      expect(w.message).toContain('limited_to_apps')
    }
    finally {
      await cleanupKey(key)
    }
  })

  it('does NOT fire on CLI == 7.107.0 (cutoff)', async () => {
    const key = await provisionKey({ mode: null, limitedToApps: [APP_ID] })
    try {
      const warnings = await callWarnings(key.plain, '7.107.0')
      expect(hasRbacBugWarning(warnings)).toBe(false)
    }
    finally {
      await cleanupKey(key)
    }
  })

  it('does NOT fire on CLI > 7.107.0', async () => {
    const key = await provisionKey({ mode: null, limitedToApps: [APP_ID] })
    try {
      const warnings = await callWarnings(key.plain, '7.108.0')
      expect(hasRbacBugWarning(warnings)).toBe(false)
    }
    finally {
      await cleanupKey(key)
    }
  })

  it('does NOT fire for legacy mode=all key on old CLI (scope is RBAC v2 only)', async () => {
    const key = await provisionKey({ mode: 'all', limitedToApps: [APP_ID] })
    try {
      const warnings = await callWarnings(key.plain, '7.106.0')
      expect(hasRbacBugWarning(warnings)).toBe(false)
    }
    finally {
      await cleanupKey(key)
    }
  })

  it('does NOT fire when limited_to_apps is empty', async () => {
    const key = await provisionKey({ mode: null, limitedToApps: [] })
    try {
      const warnings = await callWarnings(key.plain, '7.106.0')
      expect(hasRbacBugWarning(warnings)).toBe(false)
    }
    finally {
      await cleanupKey(key)
    }
  })

  it('does NOT fire when org has use_new_rbac=false (RBAC off, no bug to warn about)', async () => {
    const { error: flipError } = await serviceRoleSupabase
      .from('orgs').update({ use_new_rbac: false }).eq('id', orgId)
    if (flipError)
      throw flipError
    const key = await provisionKey({ mode: null, limitedToApps: [APP_ID] })
    try {
      const warnings = await callWarnings(key.plain, '7.106.0')
      expect(hasRbacBugWarning(warnings)).toBe(false)
    }
    finally {
      await cleanupKey(key)
      await serviceRoleSupabase.from('orgs').update({ use_new_rbac: true }).eq('id', orgId)
    }
  })

  it('does NOT fire on unparseable CLI version strings (dev/next builds)', async () => {
    const key = await provisionKey({ mode: null, limitedToApps: [APP_ID] })
    try {
      for (const v of ['dev', 'next', '', 'not-a-version']) {
        const warnings = await callWarnings(key.plain, v)
        expect(hasRbacBugWarning(warnings)).toBe(false)
      }
    }
    finally {
      await cleanupKey(key)
    }
  })
})
