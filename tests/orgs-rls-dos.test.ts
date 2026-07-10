import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { APIKEY_TEST_ALL, executeSQL, fetchWithRetry, getAuthHeaders, SUPABASE_ANON_KEY, SUPABASE_BASE_URL, USER_ID } from './test-utils.ts'

function getAnonHeaders() {
  if (!SUPABASE_BASE_URL || !SUPABASE_ANON_KEY)
    throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY are required for orgs RLS DoS tests')

  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  }
}

function getApiKeyHeaders(apiKey = APIKEY_TEST_ALL) {
  return {
    ...getAnonHeaders(),
    capgkey: apiKey,
  }
}

function fetchRest(path: string, headers: Record<string, string>) {
  return fetchWithRetry(`${SUPABASE_BASE_URL}/rest/v1/${path}`, { headers })
}

describe('orgs RLS DoS regression', () => {
  it.concurrent('returns an empty response for unauthenticated unfiltered reads', async () => {
    const response = await fetchRest('orgs?select=id&limit=1', getAnonHeaders())
    const body = await response.text()

    expect(response.status, body).toBe(200)
    expect(JSON.parse(body)).toEqual([])
  })

  it.concurrent('returns an empty response for invalid API keys without raising', async () => {
    const response = await fetchRest('orgs?select=id&limit=1', getApiKeyHeaders(randomUUID()))
    const body = await response.text()

    expect(response.status, body).toBe(200)
    expect(JSON.parse(body)).toEqual([])
  })

  it.concurrent('falls back to the JWT identity when an invalid API key header is present', async () => {
    const authHeaders = await getAuthHeaders()
    const response = await fetchRest('orgs?select=id&limit=1', {
      ...authHeaders,
      apikey: SUPABASE_ANON_KEY,
      capgkey: randomUUID(),
    })
    const body = await response.text()
    const rows = JSON.parse(body) as Array<{ id: string }>

    expect(response.status, body).toBe(200)
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.every(row => typeof row.id === 'string')).toBe(true)
  })

  it.concurrent('falls back to the JWT identity for app reads when an invalid API key header is present', async () => {
    const authHeaders = await getAuthHeaders()
    const headers = {
      ...authHeaders,
      apikey: SUPABASE_ANON_KEY,
      capgkey: randomUUID(),
    }
    const probes = [
      { path: 'apps?select=app_id&limit=1', column: 'app_id' },
      { path: 'channels?select=id&limit=1', column: 'id' },
      { path: 'app_versions?select=id&limit=1', column: 'id' },
    ]

    for (const probe of probes) {
      const response = await fetchRest(probe.path, headers)
      const body = await response.text()
      const rows = JSON.parse(body) as Array<Record<string, unknown>>

      expect(response.status, body).toBe(200)
      expect(rows.length).toBeGreaterThan(0)
      expect(rows.every(row => row[probe.column] != null)).toBe(true)
    }
  })

  it.concurrent('keeps unrelated anonymous reads available during parallel org probes', async () => {
    const headers = getAnonHeaders()

    const responses = await Promise.all(Array.from({ length: 8 }, () => fetchRest('orgs?select=id&limit=1', headers)))
    const bodies = await Promise.all(responses.map(response => response.text()))

    for (const [index, response] of responses.entries()) {
      expect(response.status, bodies[index]).toBe(200)
      expect(JSON.parse(bodies[index])).toEqual([])
    }

    const response = await fetchRest('apps?select=app_id&limit=1', headers)
    const body = await response.text()

    expect(response.status, body).toBe(200)
  })

  it.concurrent('keeps Capgo API key reads on orgs working', async () => {
    const response = await fetchRest('orgs?select=id&limit=1', getApiKeyHeaders())
    const body = await response.text()
    const rows = JSON.parse(body) as Array<{ id: string }>

    expect(response.status, body).toBe(200)
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.every(row => typeof row.id === 'string')).toBe(true)
  })

  it('does not expose org rows to app-scoped API keys', async () => {
    const appScopedKey = randomUUID()
    const [apiKey] = await executeSQL(`
      WITH inserted_key AS (
        INSERT INTO public.apikeys (user_id, key, key_hash, name, expires_at)
        VALUES ($1, $2, NULL, $3, NULL)
        RETURNING id, rbac_id, user_id
      ),
      target_app AS (
        SELECT id, owner_org
        FROM public.apps
        WHERE app_id = $4
        LIMIT 1
      ),
      app_role AS (
        SELECT id
        FROM public.roles
        WHERE name = 'app_reader'
          AND scope_type = public.rbac_scope_app()
        LIMIT 1
      ),
      inserted_binding AS (
        INSERT INTO public.role_bindings (
          principal_type,
          principal_id,
          role_id,
          scope_type,
          org_id,
          app_id,
          granted_by,
          reason,
          is_direct
        )
        SELECT
          public.rbac_principal_apikey(),
          inserted_key.rbac_id,
          app_role.id,
          public.rbac_scope_app(),
          target_app.owner_org,
          target_app.id,
          inserted_key.user_id,
          'Test app-only API key binding',
          true
        FROM inserted_key, target_app, app_role
        RETURNING id
      )
      SELECT inserted_key.id, inserted_key.rbac_id, (SELECT count(*)::int FROM inserted_binding) AS binding_count
      FROM inserted_key
    `, [USER_ID, appScopedKey, `App-only orgs visibility ${randomUUID()}`, 'com.demo.app'])

    try {
      expect(apiKey?.id).toBeDefined()
      expect(apiKey?.rbac_id).toBeDefined()

      expect(apiKey?.binding_count).toBe(1)
      const response = await fetchRest('orgs?select=id&limit=1', getApiKeyHeaders(appScopedKey))
      const body = await response.text()

      expect(response.status, body).toBe(200)
      expect(JSON.parse(body)).toEqual([])
    }
    finally {
      if (apiKey?.rbac_id) {
        await executeSQL(
          'DELETE FROM public.role_bindings WHERE principal_type = public.rbac_principal_apikey() AND principal_id = $1::uuid',
          [apiKey.rbac_id],
        )
      }
      if (apiKey?.id) {
        await executeSQL('DELETE FROM public.apikeys WHERE id = $1::bigint', [apiKey.id])
      }
    }
  })

  it.concurrent('uses a statement-level readable org helper in the orgs select policy', async () => {
    const rows = await executeSQL(`
      SELECT
        to_regprocedure('public.orgs_readable_org_ids()') IS NOT NULL AS helper_exists,
        pg_get_expr(polqual, polrelid) AS using_expr
      FROM pg_policy
      WHERE polrelid = 'public.orgs'::regclass
        AND polname = 'Allow select for auth, api keys (read+)'
    `)

    expect(rows).toHaveLength(1)
    expect(rows[0].helper_exists).toBe(true)
    expect(rows[0].using_expr).toContain('orgs_readable_org_ids')
  })

  it.concurrent('keeps org_users reads behind the membership-gated helper', async () => {
    const rows = await executeSQL(`
      SELECT
        to_regprocedure('public.org_member_readable_org_ids()') IS NOT NULL AS helper_exists,
        pg_get_expr(polqual, polrelid) AS using_expr
      FROM pg_policy
      WHERE polrelid = 'public.org_users'::regclass
        AND polname = 'Allow member and owner to select'
    `)

    expect(rows).toHaveLength(1)
    expect(rows[0].helper_exists).toBe(true)
    expect(rows[0].using_expr).toContain('org_member_readable_org_ids')
  })

  it.concurrent('keeps scoped org_users memberships valid for the membership-gated helper', async () => {
    const rows = await executeSQL(`
      SELECT pg_get_functiondef('public.org_member_readable_org_ids()'::regprocedure) AS function_def
    `)

    expect(rows).toHaveLength(1)
    expect(rows[0].function_def).not.toContain('org_users.app_id IS NULL')
    expect(rows[0].function_def).not.toContain('org_users.channel_id IS NULL')
  })
})
