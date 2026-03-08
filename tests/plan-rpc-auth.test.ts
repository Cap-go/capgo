import { env } from 'node:process'
import { createClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { ORG_ID, getSupabaseClient } from './test-utils.ts'

const SUPABASE_URL = env.SUPABASE_URL
const SUPABASE_ANON_KEY = env.SUPABASE_ANON_KEY ?? ''

function normalizeLocalhostUrl(raw: string): string {
  try {
    const url = new URL(raw)
    if (url.hostname === 'localhost')
      url.hostname = '127.0.0.1'
    return url.toString().replace(/\/$/, '')
  }
  catch {
    return raw.replace('localhost', '127.0.0.1')
  }
}

type RpcCase = {
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
  {
    label: 'delete_old_deleted_versions',
    name: 'delete_old_deleted_versions',
    params: {},
    anonError: 'permission denied',
  },
]

function getAnonClient() {
  if (!SUPABASE_URL) {
    throw new Error('SUPABASE_URL is missing for plan RPC auth tests')
  }
  if (!SUPABASE_ANON_KEY) {
    throw new Error('SUPABASE_ANON_KEY is missing for plan RPC auth tests')
  }

  return createClient(normalizeLocalhostUrl(SUPABASE_URL), SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })
}

describe('Plan and usage RPC auth checks', () => {
  for (const rpc of rpcCases) {
    it.concurrent(`denies anon client for ${rpc.label}`, async () => {
      const client = getAnonClient()
      const { error } = await client.rpc(rpc.name as never, rpc.params as never)
      expect(error).toBeTruthy()
      expect((error as { message?: string } | null)?.message).toContain(rpc.anonError ?? 'NO_RIGHTS')
    })

    it.concurrent(`allows service role for ${rpc.label}`, async () => {
      const { error } = await getSupabaseClient().rpc(rpc.name as never, rpc.params as never)
      expect(error).toBeNull()
    })
  }
})
