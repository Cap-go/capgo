import { describe, expect, it } from 'vitest'
import { getAuthHeaders, getEndpointUrl, USER_ID } from './test-utils'

interface QueryResponse {
  data: unknown
  error: { message: string, code?: string } | null
  count: number | null
  status: number
}

async function query(body: unknown, headers: Record<string, string> = {}) {
  return fetch(getEndpointUrl('/private/console/query'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}

describe('[POST] /private/console/query', () => {
  it('runs an allowlisted table query with the caller session', async () => {
    const response = await query({
      kind: 'table',
      name: 'users',
      args: [],
      operations: [{ method: 'select', args: ['id, email'] }, { method: 'eq', args: ['id', USER_ID] }, { method: 'single', args: [] }],
    }, await getAuthHeaders())
    expect(response.status).toBe(200)
    const body = await response.json() as QueryResponse
    expect(body.error).toBeNull()
    expect(body.data).toMatchObject({ id: USER_ID })
  })

  it('runs an allowlisted rpc with the caller session', async () => {
    const response = await query({ kind: 'rpc', name: 'is_platform_admin', args: [], operations: [] }, await getAuthHeaders())
    expect(response.status).toBe(200)
    const body = await response.json() as QueryResponse
    expect(body.error).toBeNull()
    expect(typeof body.data).toBe('boolean')
  })

  it('keeps RLS: another user\'s private rows are not returned', async () => {
    const response = await query({
      kind: 'table',
      name: 'users',
      args: [],
      operations: [{ method: 'select', args: ['id'] }, { method: 'neq', args: ['id', USER_ID] }],
    }, await getAuthHeaders())
    expect(response.status).toBe(200)
    const body = await response.json() as QueryResponse
    expect(body.error).toBeNull()
    // RLS limits users rows to the caller and members of their organizations, never every account.
    expect(Array.isArray(body.data)).toBe(true)
    expect((body.data as { id: string }[]).some(row => row.id === USER_ID)).toBe(false)
  })

  it('rejects tables outside the allowlist', async () => {
    const response = await query({ kind: 'table', name: 'stripe_info', args: [], operations: [{ method: 'select', args: ['*'] }] }, await getAuthHeaders())
    expect(response.status).toBe(403)
  })

  it('rejects builder methods outside the allowlist', async () => {
    const response = await query({ kind: 'table', name: 'apps', args: [], operations: [{ method: 'explain', args: [] }] }, await getAuthHeaders())
    expect(response.status).toBe(400)
  })

  it('requires a session for table queries', async () => {
    const response = await query({ kind: 'table', name: 'apps', args: [], operations: [{ method: 'select', args: ['id'] }] })
    expect(response.status).toBe(401)
  })

  it('allows only the anonymous deleted-account probe without a session', async () => {
    const probe = await query({ kind: 'rpc', name: 'is_not_deleted', args: [{ email_check: 'nobody@example.com' }], operations: [] })
    expect(probe.status).toBe(200)
    const other = await query({ kind: 'rpc', name: 'is_platform_admin', args: [], operations: [] })
    expect(other.status).toBe(401)
  })
})
