import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import apiWorker from '../cloudflare_workers/api/index.ts'

describe('hosted MCP OAuth issuer', () => {
  beforeEach(() => {
    vi.stubEnv('MCP_OAUTH_ISSUER', 'https://capgo.app/')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('uses MCP_OAUTH_ISSUER as the issuer while endpoints stay on the API origin', async () => {
    const response = await apiWorker.fetch(new Request('https://api.capgo.app/.well-known/oauth-authorization-server'))
    await expect(response.json()).resolves.toMatchObject({
      issuer: 'https://capgo.app',
      authorization_endpoint: 'https://api.capgo.app/mcp/oauth/authorize',
      token_endpoint: 'https://api.capgo.app/mcp/oauth/token',
      registration_endpoint: 'https://api.capgo.app/mcp/oauth/register',
      revocation_endpoint: 'https://api.capgo.app/mcp/oauth/revoke',
    })
  })

  it('points protected resource metadata at the configured issuer', async () => {
    const response = await apiWorker.fetch(new Request('https://api.capgo.app/.well-known/oauth-protected-resource/mcp'))
    await expect(response.json()).resolves.toMatchObject({
      resource: 'https://api.capgo.app/mcp',
      authorization_servers: ['https://capgo.app'],
    })
  })

  it('keeps the WWW-Authenticate challenge on the API origin', async () => {
    const response = await apiWorker.fetch(new Request('https://api.capgo.app/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'accept': 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }),
    }))
    expect(response.status).toBe(401)
    expect(response.headers.get('www-authenticate')).toContain('resource_metadata="https://api.capgo.app/.well-known/oauth-protected-resource/mcp"')
  })
})
