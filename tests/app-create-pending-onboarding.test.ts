import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { afterAll, describe, expect, it } from 'vitest'
import {
  BASE_URL,
  createDirectApiKeyWithBindings,
  getSupabaseClient,
  ORG_ID,
  resetAppData,
  SUPABASE_ANON_KEY,
  SUPABASE_BASE_URL,
  USER_ID,
} from './test-utils.ts'

describe('app create with leftover pending onboarding app', () => {
  const pendingAppId = `com.test.pending.onboarding.${randomUUID()}`
  const newAppId = `com.test.create.with.pending.${randomUUID()}`
  const adminPendingAppId = `com.test.pending.admin.${randomUUID()}`
  const adminNewAppId = `com.test.create.admin.${randomUUID()}`
  let memberApiKey = ''
  let adminApiKey = ''

  afterAll(async () => {
    await resetAppData(pendingAppId)
    await resetAppData(newAppId)
    await resetAppData(adminPendingAppId)
    await resetAppData(adminNewAppId)
    const supabase = getSupabaseClient()
    if (memberApiKey)
      await supabase.from('apikeys').delete().eq('key', memberApiKey)
    if (adminApiKey)
      await supabase.from('apikeys').delete().eq('key', adminApiKey)
  })

  it('allows org_member API keys to create a new app while a pending onboarding app exists', async () => {
    const supabase = getSupabaseClient()

    const { error: pendingError } = await supabase.from('apps').insert({
      app_id: pendingAppId,
      name: 'Pending onboarding leftover',
      icon_url: '',
      owner_org: ORG_ID,
      user_id: USER_ID,
      need_onboarding: true,
      created_from_onboarding: true,
    })
    expect(pendingError, JSON.stringify(pendingError)).toBeNull()

    memberApiKey = randomUUID()
    await createDirectApiKeyWithBindings({
      key: memberApiKey,
      name: `org member create with pending ${randomUUID()}`,
      orgId: ORG_ID,
      roleName: 'org_member',
    })

    const createResponse = await fetch(`${BASE_URL}/app`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'capgkey': memberApiKey,
      },
      body: JSON.stringify({
        owner_org: ORG_ID,
        app_id: newAppId,
        name: `App ${newAppId}`,
        icon: '',
        need_onboarding: false,
        created_from_onboarding: true,
      }),
    })
    const createBody = await createResponse.json().catch(() => null)
    expect(createResponse.status, JSON.stringify(createBody)).toBe(200)
    expect((createBody as { app_id?: string }).app_id).toBe(newAppId)

    const completeResponse = await fetch(`${BASE_URL}/app/${pendingAppId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'capgkey': memberApiKey,
      },
      body: JSON.stringify({
        need_onboarding: false,
      }),
    })
    const completeBody = await completeResponse.json().catch(() => null)
    expect(completeResponse.status, JSON.stringify(completeBody)).toBe(200)
    expect((completeBody as { need_onboarding?: boolean }).need_onboarding).toBe(false)
  })

  it('keeps PostgREST apps insert working for org_admin API keys with a pending sibling app', async () => {
    const supabase = getSupabaseClient()
    const { error: pendingError } = await supabase.from('apps').insert({
      app_id: adminPendingAppId,
      name: 'Pending onboarding leftover admin',
      icon_url: '',
      owner_org: ORG_ID,
      user_id: USER_ID,
      need_onboarding: true,
      created_from_onboarding: true,
    })
    expect(pendingError, JSON.stringify(pendingError)).toBeNull()

    adminApiKey = randomUUID()
    await createDirectApiKeyWithBindings({
      key: adminApiKey,
      name: `org admin create with pending ${randomUUID()}`,
      orgId: ORG_ID,
      roleName: 'org_admin',
    })

    const anonClient = createClient(SUPABASE_BASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { capgkey: adminApiKey } },
      auth: { persistSession: false },
    })

    const { error: insertError } = await anonClient.from('apps').insert({
      app_id: adminNewAppId,
      name: `App ${adminNewAppId}`,
      icon_url: '',
      owner_org: ORG_ID,
      user_id: USER_ID,
    })
    expect(insertError, JSON.stringify(insertError)).toBeNull()
  })
})
