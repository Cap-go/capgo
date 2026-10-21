import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createConsoleClient } from '../src/services/consoleClient'

const fetchMock = vi.fn()

function client(token: string | null = 'session-jwt') {
  return createConsoleClient({
    auth: { getSession: async () => ({ data: { session: token ? { access_token: token } : null }, error: null }) } as any,
  })
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

beforeEach(() => {
  vi.stubEnv('VITE_API_HOST', 'https://api.example.com')
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset()
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('console client transport', () => {
  it('replays a recorded table query through the Capgo API with the session bearer', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: [{ id: 'app-1' }], error: null, count: 1, status: 200 }))
    const result = await client().from('apps').select('id', { count: 'exact' }).eq('owner_org', 'org-1').order('name').limit(10)

    expect(result).toEqual({ data: [{ id: 'app-1' }], error: null, count: 1, status: 200 })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.example.com/private/console/query')
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer session-jwt')
    expect(JSON.parse(init.body)).toEqual({
      kind: 'table',
      name: 'apps',
      args: [],
      operations: [
        { method: 'select', args: ['id', { count: 'exact' }] },
        { method: 'eq', args: ['owner_org', 'org-1'] },
        { method: 'order', args: ['name'] },
        { method: 'limit', args: [10] },
      ],
    })
  })

  it('sends rpc arguments and forwards the abort signal', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: true, error: null, count: null, status: 200 }))
    const controller = new AbortController()
    const result = await client().rpc('is_paying_org', { orgid: 'org-1' }).abortSignal(controller.signal)

    expect(result.data).toBe(true)
    const [, init] = fetchMock.mock.calls[0]
    expect(init.signal).toBe(controller.signal)
    expect(JSON.parse(init.body)).toMatchObject({ kind: 'rpc', name: 'is_paying_org', args: [{ orgid: 'org-1' }] })
  })

  it('keeps PostgREST error details so callers can match codes', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: null, error: { message: 'duplicate key', code: '23505', details: null, hint: null }, count: null, status: 409 }))
    const result = await client().from('apps').insert({ app_id: 'dup' } as any)
    expect(result.data).toBeNull()
    expect(result.error).toBeInstanceOf(Error)
    expect(result.error).toMatchObject({ message: 'duplicate key', code: '23505' })
  })

  it('throws on throwOnError like the SDK', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: null, error: { message: 'denied', code: '42501' }, count: null, status: 403 }))
    await expect(client().from('apps').select('id').throwOnError()).rejects.toMatchObject({ code: '42501' })
  })

  it('surfaces API failures as FunctionsHttpError and network failures as FunctionsFetchError', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'unsupported_query' }, 403))
    const denied = await client().from('secret_table' as any).select('*')
    expect(denied.error).toBeInstanceOf(FunctionsHttpError)
    expect(denied.status).toBe(403)

    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const offline = await client().functions.invoke('private/anything', { body: { a: 1 } })
    expect(offline.error).toBeInstanceOf(FunctionsFetchError)
  })

  it('omits the bearer when there is no session', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: true, error: null, count: null, status: 200 }))
    await client(null).rpc('is_not_deleted', { email_check: 'a@b.c' })
    const [, init] = fetchMock.mock.calls[0]
    expect(new Headers(init.headers).has('Authorization')).toBe(false)
  })

  it('routes storage calls to the image endpoints with raw bytes for uploads', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: { signedUrl: 'https://api.example.com/private/console/images/read?path=a&token=t' }, error: null }))
    const signed = await client().storage.from('images').createSignedUrl('org/logo.png', 60)
    expect(signed.data?.signedUrl).toContain('/private/console/images/read')
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.example.com/private/console/images/sign')

    fetchMock.mockResolvedValueOnce(jsonResponse({ data: { path: 'org/logo.png' }, error: null }))
    const blob = new Blob(['png-bytes'], { type: 'image/png' })
    await client().storage.from('images').upload('org/logo.png', blob, { contentType: 'image/png', upsert: true })
    const [url, init] = fetchMock.mock.calls[1]
    expect(url).toBe('https://api.example.com/private/console/images/upload')
    expect(init.body).toBe(blob)
    const headers = new Headers(init.headers)
    expect(headers.get('x-image-path')).toBe('org/logo.png')
    expect(headers.get('x-image-upsert')).toBe('true')
    expect(headers.get('Content-Type')).toBe('image/png')

    expect(() => client().storage.from('other')).toThrow('Unsupported console storage bucket')
  })
})
