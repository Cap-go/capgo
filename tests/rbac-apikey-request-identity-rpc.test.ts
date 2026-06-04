import type { Database } from '../src/types/supabase.types'
import type { SupabaseClient } from '@supabase/supabase-js'
import { env } from 'node:process'
import { createClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { APIKEY_TEST_ORG_SUPER_ADMIN, getAuthHeadersForCredentials, USER_EMAIL, USER_ID, USER_PASSWORD } from './test-utils'

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

function isRetryableRpcTransportError(error: { message?: string } | null) {
  return error?.message?.includes('fetch failed') === true
}

async function requestActorUserId(client: SupabaseClient<Database>) {
  let result: Awaited<ReturnType<typeof client.rpc<'request_actor_user_id'>>>

  for (let attempt = 0; attempt < 3; attempt++) {
    result = await client.rpc('request_actor_user_id')
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
        capgkey: APIKEY_TEST_ORG_SUPER_ADMIN,
      },
    },
    auth: {
      persistSession: false,
    },
  })
}

describe('request_actor_user_id RPC permissions', () => {
  it.concurrent('allows anonymous API-key request identity resolution', async () => {
    const supabaseAnon = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { capgkey: APIKEY_TEST_ORG_SUPER_ADMIN } },
    })

    const { data, error } = await requestActorUserId(supabaseAnon)

    expect(error).toBeNull()
    expect(data).toBe(USER_ID)
  })

  it.concurrent('allows service role API-key request identity resolution', async () => {
    const supabaseServiceRole = createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      global: { headers: { capgkey: APIKEY_TEST_ORG_SUPER_ADMIN } },
    })

    const { data, error } = await requestActorUserId(supabaseServiceRole)

    expect(error).toBeNull()
    expect(data).toBe(USER_ID)
  })

  it.concurrent('prefers the JWT actor when both JWT and API key headers are present', async () => {
    const supabaseAuthenticated = await createAuthenticatedClient()

    const { data, error } = await requestActorUserId(supabaseAuthenticated)

    expect(error).toBeNull()
    expect(data).toBe(USER_ID)
  })

  it.concurrent('returns null for invalid API key on service role', async () => {
    const supabaseServiceRole = createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      global: { headers: { capgkey: '00000000-0000-0000-0000-000000000000' } },
    })

    const { data, error } = await requestActorUserId(supabaseServiceRole)

    expect(error).toBeNull()
    expect(data).toBeNull()
  })
})
