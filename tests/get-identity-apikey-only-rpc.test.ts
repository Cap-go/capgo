import type { Database } from '../src/types/supabase.types'
import { env } from 'node:process'
import { createClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { APIKEY_TEST_ALL, getAuthHeadersForCredentials, USER_EMAIL, USER_PASSWORD } from './test-utils'

function normalizeLocalhostUrl(raw: string | undefined): string {
  if (!raw)
    return ''
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

const SUPABASE_URL = normalizeLocalhostUrl(env.SUPABASE_URL)
const SUPABASE_ANON_KEY = env.SUPABASE_ANON_KEY as string
const SUPABASE_SERVICE_KEY = (env.SUPABASE_SERVICE_KEY || env.SUPABASE_SERVICE_ROLE_KEY || env.SERVICE_ROLE_KEY) as string

const keyModes: Database['public']['Enums']['key_mode'][] = ['all', 'read', 'write']

async function createAuthenticatedClient() {
  const authHeaders = await getAuthHeadersForCredentials(USER_EMAIL, USER_PASSWORD)

  return createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: {
      headers: {
        ...authHeaders,
        capgkey: APIKEY_TEST_ALL,
      },
    },
    auth: {
      persistSession: false,
    },
  })
}

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
    expect((data as string)).toMatch(/^[0-9a-f-]{36}$/i)
  })

  it.concurrent('denies authenticated RPC access', async () => {
    const supabaseAuthenticated = await createAuthenticatedClient()

    const { data, error } = await supabaseAuthenticated.rpc('get_identity_apikey_only', { keymode: keyModes })

    expect(data).toBeNull()
    expect(error).not.toBeNull()
    expect(error?.message).toContain('permission denied')
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
