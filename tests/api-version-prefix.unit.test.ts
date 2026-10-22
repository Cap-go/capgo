import { describe, expect, it } from 'vitest'
import apiWorker from '../cloudflare_workers/api/index.ts'
import { stripPublicApiVersion } from '../cloudflare_workers/api/version.ts'

describe('public API /v1 prefix', () => {
  it.each([
    ['/v1/app/', '/app/'],
    ['/v1/app/com.demo.app', '/app/com.demo.app'],
    ['/v1/bundle', '/bundle'],
    ['/v1/statistics/app/com.demo.app/', '/statistics/app/com.demo.app/'],
  ])('maps %s to %s', (path, expected) => {
    const request = stripPublicApiVersion(new Request(`https://api.capgo.app${path}?page=1`, { headers: { 'x-api-key': 'k' } }))
    const url = new URL(request.url)
    expect(url.pathname).toBe(expected)
    expect(url.search).toBe('?page=1')
    expect(request.headers.get('x-api-key')).toBe('k')
  })

  it.each(['/v1/private/plans', '/v1/triggers/ok', '/v1/mcp', '/v1', '/v2/app/', '/app/'])('leaves %s untouched', (path) => {
    const request = new Request(`https://api.capgo.app${path}`)
    expect(stripPublicApiVersion(request)).toBe(request)
  })

  it('keeps the request body and method', async () => {
    const request = stripPublicApiVersion(new Request('https://api.capgo.app/v1/channel', { method: 'POST', body: '{"a":1}', headers: { 'content-type': 'application/json' } }))
    expect(request.method).toBe('POST')
    await expect(request.text()).resolves.toBe('{"a":1}')
  })

  it('serves versioned routes through the worker with the same auth as unversioned ones', async () => {
    for (const path of ['/app/', '/v1/app/']) {
      const response = await apiWorker.fetch(new Request(`https://api.capgo.app${path}`))
      expect(response.status).toBe(401)
      await expect(response.json()).resolves.toMatchObject({ error: 'no_key_provided' })
      expect(response.headers.get('RateLimit-Policy')).toBe('"failed-auth";q=20;w=900')
    }
  })

  it('does not expose private routes under /v1', async () => {
    const response = await apiWorker.fetch(new Request('https://api.capgo.app/v1/private/plans'))
    expect(response.status).toBe(404)
  })
})
