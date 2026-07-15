import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  appApiKeyBindings,
  BASE_URL,
  createIsolatedSeedAppOptions,
  executeSQL,
  getAuthHeaders,
  resetAndSeedAppData,
  resetAppData,
  SUPABASE_ANON_KEY,
  SUPABASE_BASE_URL,
} from './test-utils.ts'

vi.mock('../cli/src/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../cli/src/utils')>()
  const { createClient } = await import('@supabase/supabase-js')

  return {
    ...actual,
    createSupabaseClient: async (apikey: string, supaHost?: string, supaAnon?: string) => {
      if (!supaHost || !supaAnon)
        throw new Error('CLI preview lifecycle test requires a local Supabase host and anon key')

      return createClient(supaHost, supaAnon, {
        auth: {
          persistSession: false,
        },
        global: {
          headers: {
            capgkey: apikey,
          },
        },
      })
    },
    getConfig: async () => undefined,
    sendEvent: async () => {},
  }
})

const { addChannelInternal } = await import('../cli/src/channel/add.ts')
const { deleteChannelInternal } = await import('../cli/src/channel/delete.ts')

const id = randomUUID()
const APPNAME = `com.cli.preview.lifecycle.${id}`
const CHANNEL_NAME = `preview-${id.slice(0, 8)}`
const seedOptions = createIsolatedSeedAppOptions()

let authHeaders: Record<string, string>
let apiKeyId: number | null = null

beforeAll(async () => {
  authHeaders = await getAuthHeaders()
  await resetAndSeedAppData(APPNAME, seedOptions)
})

afterAll(async () => {
  try {
    if (apiKeyId !== null) {
      const deleteResponse = await fetch(`${BASE_URL}/apikey/${apiKeyId}`, {
        method: 'DELETE',
        headers: authHeaders,
      })
      expect(deleteResponse.status).toBe(200)
    }
  }
  finally {
    await resetAppData(APPNAME)
  }
})

describe('cli app preview lifecycle', () => {
  it('creates and deletes a channel with an app-only key, while preserving bundle-delete denial', async () => {
    const createResponse = await fetch(`${BASE_URL}/apikey`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        name: `cli-app-preview-${id}`,
        bindings: await appApiKeyBindings(APPNAME, 'app_preview'),
      }),
    })

    expect(createResponse.status).toBe(200)
    const apiKey = await createResponse.json<{ id: number, key: string, rbac_id: string }>()
    apiKeyId = apiKey.id
    expect(apiKey.key).toBeTruthy()

    const bindings = await executeSQL(
      `
      SELECT role_bindings.scope_type, roles.name AS role_name
      FROM public.role_bindings
      INNER JOIN public.roles ON roles.id = role_bindings.role_id
      WHERE role_bindings.principal_type = public.rbac_principal_apikey()
        AND role_bindings.principal_id = $1::uuid
      ORDER BY role_bindings.scope_type, roles.name
      `,
      [apiKey.rbac_id],
    )
    expect(bindings).toEqual([
      expect.objectContaining({
        scope_type: 'app',
        role_name: 'app_preview',
      }),
    ])

    const cliOptions = {
      apikey: apiKey.key,
      supaHost: SUPABASE_BASE_URL,
      supaAnon: SUPABASE_ANON_KEY,
    }

    await expect(addChannelInternal(CHANNEL_NAME, APPNAME, cliOptions, true))
      .resolves
      .toMatchObject({ name: CHANNEL_NAME })

    await expect(deleteChannelInternal(CHANNEL_NAME, APPNAME, {
      ...cliOptions,
      deleteBundle: true,
      successIfNotFound: false,
    }, true)).rejects.toThrow('bundle.delete')

    const channelsAfterDeniedBundleDelete = await executeSQL(
      'SELECT id FROM public.channels WHERE app_id = $1 AND name = $2',
      [APPNAME, CHANNEL_NAME],
    )
    expect(channelsAfterDeniedBundleDelete).toHaveLength(1)

    await expect(deleteChannelInternal(CHANNEL_NAME, APPNAME, {
      ...cliOptions,
      deleteBundle: false,
      successIfNotFound: false,
    }, true)).resolves.toBe(true)

    const remainingChannels = await executeSQL(
      'SELECT COUNT(*)::integer AS count FROM public.channels WHERE app_id = $1 AND name = $2',
      [APPNAME, CHANNEL_NAME],
    )
    expect(Number(remainingChannels[0]?.count ?? 0)).toBe(0)
  }, 60_000)
})
