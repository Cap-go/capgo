import type { Database } from '../src/types/supabase.types'
import { createClient } from '@supabase/supabase-js'
import { env } from 'node:process'
import { describe, expect, it } from 'vitest'
import { APIKEY_TEST_ALL } from './test-utils'

const SUPABASE_URL = env.SUPABASE_URL as string
const SUPABASE_ANON_KEY = env.SUPABASE_ANON_KEY as string
const SUPABASE_SERVICE_KEY = (env.SUPABASE_SERVICE_KEY || env.SUPABASE_SERVICE_ROLE_KEY || env.SERVICE_ROLE_KEY) as string

const keyModes = ['all', 'read', 'write'] as const

describe('get_identity_apikey_only RPC permissions', () => {
  it.concurrent('denies anonymous RPC access', async () => {
    const supabaseAnon = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { capgkey: APIKEY_TEST_ALL } },
    })

    const { data, error } = await supabaseAnon.rpc('get_identity_apikey_only', { keymode: keyModes })

    expect(data).toBeNull()
    expect(error).not.toBeNull()
    expect(error?.message).toContain('permission denied')
  })

  it.concurrent('allows service role RPC access', async () => {
    const supabaseServiceRole = createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      global: { headers: { capgkey: APIKEY_TEST_ALL } },
    })

    const { data, error } = await supabaseServiceRole.rpc('get_identity_apikey_only', { keymode: keyModes })

    expect(error).toBeNull()
    expect(typeof data).toBe('string')
    expect((data as string)).toMatch(/^[0-9a-fA-F-]{36}$/)
  })

  it.concurrent('returns null for invalid API key on service role', async () => {
    const supabaseServiceRole = createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      global: { headers: { capgkey: '00000000-0000-0000-0000-000000000000' } },
    })

    const { data, error } = await supabaseServiceRole.rpc('get_identity_apikey_only', { keymode: keyModes })

    expect(error).toBeNull()
    expect(data).toBeNull()
  })
})
