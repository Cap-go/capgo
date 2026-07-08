import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { APIKEY_TEST_ALL, executeSQL, fetchWithRetry, SUPABASE_ANON_KEY, SUPABASE_BASE_URL } from './test-utils.ts'

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
})
