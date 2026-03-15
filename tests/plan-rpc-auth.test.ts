import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../src/types/supabase.types'
import { createClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import {
  APIKEY_TEST_ALL,
  getSupabaseClient,
  ORG_ID,
  SUPABASE_ANON_KEY,
  SUPABASE_BASE_URL,
  USER_EMAIL,
  USER_EMAIL_NONMEMBER,
  USER_PASSWORD,
  USER_PASSWORD_NONMEMBER,
} from './test-utils.ts'

const TEST_APP_PREFIX = 'com.plan-rpc-auth'

interface RpcCase {
  label: string
  name: string
  params: Record<string, unknown>
  anonError?: string
}

const startDate = new Date().toISOString().slice(0, 10)
const endDate = new Date(Date.now() + 86400000).toISOString().slice(0, 10)

const rpcCases: RpcCase[] = [
  {
    label: 'get_app_metrics',
    name: 'get_app_metrics',
    params: { org_id: ORG_ID },
  },
  {
    label: 'get_app_metrics date range',
    name: 'get_app_metrics',
    params: { org_id: ORG_ID, start_date: startDate, end_date: endDate },
  },
  {
    label: 'get_global_metrics',
    name: 'get_global_metrics',
    params: { org_id: ORG_ID },
  },
  {
    label: 'get_global_metrics date range',
    name: 'get_global_metrics',
    params: { org_id: ORG_ID, start_date: startDate, end_date: endDate },
  },
  {
    label: 'get_current_plan_max_org',
    name: 'get_current_plan_max_org',
    params: { orgid: ORG_ID },
  },
  {
    label: 'get_current_plan_name_org',
    name: 'get_current_plan_name_org',
    params: { orgid: ORG_ID },
  },
  {
    label: 'get_cycle_info_org',
    name: 'get_cycle_info_org',
    params: { orgid: ORG_ID },
  },
  {
    label: 'get_plan_usage_percent_detailed',
    name: 'get_plan_usage_percent_detailed',
    params: { orgid: ORG_ID },
  },
  {
    label: 'get_plan_usage_percent_detailed cycle range',
    name: 'get_plan_usage_percent_detailed',
    params: { orgid: ORG_ID, cycle_start: startDate, cycle_end: endDate },
  },
]

const deleteOldVersionsRpc: RpcCase = {
  label: 'delete_old_deleted_versions',
  name: 'delete_old_deleted_versions',
  params: {},
  anonError: 'permission denied',
}

function getAnonClient() {
  if (!SUPABASE_BASE_URL) {
    throw new Error('SUPABASE_BASE_URL is missing for plan RPC auth tests')
  }
  if (!SUPABASE_ANON_KEY) {
    throw new Error('SUPABASE_ANON_KEY is missing for plan RPC auth tests')
  }

  return createClient<Database>(SUPABASE_BASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })
}

function getApiKeyClient(apiKey: string) {
  if (!SUPABASE_BASE_URL)
    throw new Error('SUPABASE_BASE_URL is missing for plan RPC auth tests')

  return createClient<Database>(SUPABASE_BASE_URL, apiKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })
}

async function getAuthenticatedClient(email: string, password: string): Promise<SupabaseClient<Database>> {
  if (!SUPABASE_BASE_URL)
    throw new Error('SUPABASE_BASE_URL is missing for plan RPC auth tests')
  if (!SUPABASE_ANON_KEY)
    throw new Error('SUPABASE_ANON_KEY is missing for plan RPC auth tests')

  const client = createClient<Database>(SUPABASE_BASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })

  const { error } = await client.auth.signInWithPassword({
    email,
    password,
  })
  if (error)
    throw error

  return client
}

describe('plan and usage RPC auth checks', () => {
  for (const rpc of rpcCases) {
    it.concurrent(`denies anon client for ${rpc.label}`, async () => {
      const client = getAnonClient()
      const { error } = await client.rpc(rpc.name as never, rpc.params as never)
      expect(error).toBeTruthy()
      expect((error as { message?: string } | null)?.message).toContain(rpc.anonError ?? 'NO_RIGHTS')
    })

    it.concurrent(`denies authenticated non-member for ${rpc.label}`, async () => {
      const client = await getAuthenticatedClient(USER_EMAIL_NONMEMBER, USER_PASSWORD_NONMEMBER)
      const { error } = await client.rpc(rpc.name as never, rpc.params as never)
      expect(error).toBeTruthy()
      expect((error as { message?: string } | null)?.message).toContain(rpc.anonError ?? 'NO_RIGHTS')
    })

    it.concurrent(`allows authenticated member for ${rpc.label}`, async () => {
      const client = await getAuthenticatedClient(USER_EMAIL, USER_PASSWORD)
      const { error } = await client.rpc(rpc.name as never, rpc.params as never)
      expect(error).toBeNull()
    })

    it.concurrent(`allows api key for ${rpc.label}`, async () => {
      const client = getApiKeyClient(APIKEY_TEST_ALL)
      const { error } = await client.rpc(rpc.name as never, rpc.params as never)
      expect(error).toBeNull()
    })

    it.concurrent(`allows service role for ${rpc.label}`, async () => {
      const { error } = await getSupabaseClient().rpc(rpc.name as never, rpc.params as never)
      expect(error).toBeNull()
    })
  }

  it('denies anon client for delete_old_deleted_versions', async () => {
    const client = getAnonClient()
    const { error } = await client.rpc(deleteOldVersionsRpc.name as never, deleteOldVersionsRpc.params as never)
    expect(error).toBeTruthy()
    expect((error as { message?: string } | null)?.message).toContain(deleteOldVersionsRpc.anonError ?? 'NO_RIGHTS')
  })

  it('denies authenticated non-member for delete_old_deleted_versions', async () => {
    const client = await getAuthenticatedClient(USER_EMAIL_NONMEMBER, USER_PASSWORD_NONMEMBER)
    const { error } = await client.rpc(deleteOldVersionsRpc.name as never, deleteOldVersionsRpc.params as never)
    expect(error).toBeTruthy()
    expect((error as { message?: string } | null)?.message).toContain(deleteOldVersionsRpc.anonError ?? 'NO_RIGHTS')
  })

  it('allows service role and removes isolated old deleted versions', async () => {
    const supabase = getSupabaseClient()
    const uniqueSuffix = Date.now().toString()
    const appId = `${TEST_APP_PREFIX}-${uniqueSuffix}`
    const versionName = `version-${uniqueSuffix}`

    const { error: appError } = await supabase.from('apps').insert({
      app_id: appId,
      owner_org: ORG_ID,
      icon_url: `https://example.com/${appId}.png`,
    })
    expect(appError).toBeNull()

    const staleDate = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000).toISOString()

    const { data: versionData, error: versionError } = await supabase.from('app_versions').insert({
      app_id: appId,
      name: versionName,
      owner_org: ORG_ID,
    }).select('id').single()

    if (versionError)
      throw versionError

    const versionId = versionData?.id
    expect(versionId).toBeTruthy()

    const { error: markDeletedError } = await supabase.from('app_versions').update({
      deleted: true,
      deleted_at: staleDate,
      updated_at: staleDate,
    }).eq('id', versionId)

    expect(markDeletedError).toBeNull()

    try {
      const { error } = await getSupabaseClient().rpc(deleteOldVersionsRpc.name as never, deleteOldVersionsRpc.params as never)
      expect(error).toBeNull()

      const { data: remainingVersion, error: remainingError } = await supabase.from('app_versions').select('id').eq('id', versionId).maybeSingle()
      expect(remainingError).toBeNull()
      expect(remainingVersion).toBeNull()
    }
    finally {
      if (versionId)
        await supabase.from('app_versions').delete().eq('id', versionId)
      await supabase.from('apps').delete().eq('app_id', appId)
    }
  })
})
