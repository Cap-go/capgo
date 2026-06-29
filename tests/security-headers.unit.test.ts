import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import apiWorker from '../cloudflare_workers/api/index.ts'
import pluginWorker from '../cloudflare_workers/plugin/index.ts'
import { API_CONTENT_SECURITY_POLICY, createAllCatch, createHono } from '../supabase/functions/_backend/utils/hono.ts'

const consoleHeaders = readFileSync(new URL('../public/_headers', import.meta.url), 'utf8')

describe('security response headers', () => {
  it.concurrent('declares a CSP for the console app static responses', () => {
    expect(consoleHeaders).toContain('Content-Security-Policy: default-src \'self\'')
    expect(consoleHeaders).toContain('script-src \'self\' \'unsafe-inline\'')
    expect(consoleHeaders).toContain('style-src \'self\' \'unsafe-inline\' https://fonts.bunny.net')
    expect(consoleHeaders).toContain('frame-ancestors \'none\'')
  })

  it.concurrent.each([
    ['api', apiWorker, 'https://api.preprod.capgo.app/ok', 200],
    ['plugin', pluginWorker, 'https://plugin.preprod.capgo.app/ok', 200],
  ] as const)('sets the API CSP on %s worker responses', async (_name, worker, url, status) => {
    const response = await worker.fetch(new Request(url))

    expect(response.status).toBe(status)
    expect(response.headers.get('content-security-policy')).toBe(API_CONTENT_SECURITY_POLICY)
  })

  it.concurrent('sets the API CSP on files worker fallback responses', async () => {
    const app = createHono('files', 'test')
    createAllCatch(app, 'files')
    const response = await app.fetch(new Request('https://files.preprod.capgo.app/'))

    expect(response.status).toBe(404)
    expect(response.headers.get('content-security-policy')).toBe(API_CONTENT_SECURITY_POLICY)
  })

  it.concurrent('does not apply the API CSP to preview subdomains', async () => {
    const app = createHono('files', 'test')
    app.get('/', c => c.html('<!DOCTYPE html><html><body>preview</body></html>'))

    const response = await app.fetch(new Request('https://123-com-example-app.preview.preprod.capgo.app/'))

    expect(response.status).toBe(200)
    expect(response.headers.get('content-security-policy')).toBeNull()
  })
})
