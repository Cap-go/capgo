import { describe, expect, it } from 'vitest'
import { MCP_TOOLS } from '../supabase/functions/_backend/mcp/tools.ts'
import { searchCapgoDocs } from '../supabase/functions/_backend/utils/docs_search.ts'

function fakeFetch(hits: unknown[], status = 200) {
  const requests: { url: string, body: Record<string, unknown> }[] = []
  const impl = (async (url: string, init?: RequestInit) => {
    requests.push({ url, body: JSON.parse(String(init?.body)) })
    return new Response(JSON.stringify({ hits }), { status })
  }) as unknown as typeof fetch
  return { impl, requests }
}

describe('capgo docs search', () => {
  it.concurrent('queries the English DocSearch index and dedupes section hits', async () => {
    const { impl, requests } = fakeFetch([
      { url: 'https://capgo.app/docs/live-updates/channels/#progressive-rollouts', content: null, hierarchy: { lvl0: 'Documentation', lvl1: 'Channels', lvl2: 'Progressive rollouts', lvl3: null } },
      { url: 'https://capgo.app/docs/live-updates/channels/#progressive-rollouts', content: 'duplicate', hierarchy: { lvl0: 'Documentation', lvl1: 'Channels' } },
      { url: 'https://capgo.app/docs/live-updates/encryption/', content: '  Encrypt   bundles &gt; 200MB end to end. ', hierarchy: { lvl0: 'Documentation', lvl1: 'Encryption' } },
    ])
    const results = await searchCapgoDocs('rollout', 5, impl)
    expect(requests[0].url).toBe('https://R0TIQUJRSN-dsn.algolia.net/1/indexes/capgo/query')
    expect(requests[0].body).toMatchObject({ query: 'rollout', hitsPerPage: 10, facetFilters: ['lang:en'] })
    expect(results).toEqual([
      { title: 'Channels > Progressive rollouts', url: 'https://capgo.app/docs/live-updates/channels/#progressive-rollouts' },
      { title: 'Encryption', url: 'https://capgo.app/docs/live-updates/encryption/', snippet: 'Encrypt bundles > 200MB end to end.' },
    ])
  })

  it.concurrent('clamps the limit and reports HTTP failures', async () => {
    const { impl, requests } = fakeFetch([], 500)
    await expect(searchCapgoDocs('x', 500, impl)).rejects.toThrow('HTTP 500')
    expect(requests[0].body.hitsPerPage).toBe(40)
  })

  it.concurrent('is registered as a read-only hosted MCP tool', () => {
    const tool = MCP_TOOLS.find(entry => entry.name === 'capgo_search_docs')
    expect(tool?.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false, openWorldHint: true })
    expect(tool?.inputSchema.safeParse({ query: '' }).success).toBe(false)
    expect(tool?.inputSchema.safeParse({ query: 'channels', limit: 3 }).success).toBe(true)
  })
})
