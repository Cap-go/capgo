import type { Database } from '../src/types/supabase.types'
import type { SupabaseClient } from '@supabase/supabase-js'
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
const USE_CLOUDFLARE = env.USE_CLOUDFLARE_WORKERS === 'true'

const keyModes: Database['public']['Enums']['key_mode'][] = ['all', 'read', 'write']

function isRetryableRpcTransportError(error: { message?: string } | null) {
  return error?.message?.includes('fetch failed') === true
}

async function getIdentityApikeyOnly(client: SupabaseClient<Database>) {
  let result: Awaited<ReturnType<typeof client.rpc<'get_identity_apikey_only'>>>

  for (let attempt = 0; attempt < 3; attempt++) {
    result = await client.rpc('get_identity_apikey_only', { keymode: keyModes })
    if (!isRetryableRpcTransportError(result.error) || attempt === 2)
      return result

    await new Promise(resolve => setTimeout(resolve, 200 * (attempt + 1)))
  }

  return result!
}

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

describe.skipIf(USE_CLOUDFLARE)('get_identity_apikey_only RPC permissions', () => {
  it.concurrent('denies anonymous RPC access', async () => {
    const supabaseAnon = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { capgkey: APIKEY_TEST_ALL } },
    })

    const { data, error } = await getIdentityApikeyOnly(supabaseAnon)

    expect(data).toBeNull()
    expect(error).not.toBeNull()
    expect(error?.message).toContain('permission denied')
  })

  it.concurrent('allows service role RPC access', async () => {
    const supabaseServiceRole = createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      global: { headers: { capgkey: APIKEY_TEST_ALL } },
    })

    const { data, error } = await getIdentityApikeyOnly(supabaseServiceRole)

    expect(error).toBeNull()
    expect(typeof data).toBe('string')
    expect((data as string)).toMatch(/^[0-9a-f-]{36}$/i)
  })

  it.concurrent('denies authenticated RPC access', async () => {
    const supabaseAuthenticated = await createAuthenticatedClient()

    const { data, error } = await getIdentityApikeyOnly(supabaseAuthenticated)

    expect(data).toBeNull()
    expect(error).not.toBeNull()
    expect(error?.message).toContain('permission denied')
  })

  it.concurrent('returns null for invalid API key on service role', async () => {
    const supabaseServiceRole = createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      global: { headers: { capgkey: '00000000-0000-0000-0000-000000000000' } },
    })

    const { data, error } = await getIdentityApikeyOnly(supabaseServiceRole)

    expect(error).toBeNull()
    expect(data).toBeNull()
  })
})
