import { describe, expect, it } from 'vitest'
import { MCP_TOOLS } from '../supabase/functions/_backend/mcp/tools.ts'
import { searchCapgoDocs } from '../supabase/functions/_backend/utils/docs_search.ts'

function fakeFetch(hits: unknown[] | unknown[][], status = 200) {
  const pages = Array.isArray(hits[0]) ? hits as unknown[][] : [hits]
  const requests: { url: string, body: Record<string, unknown> }[] = []
  const impl = (async (url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body))
    requests.push({ url, body })
    return new Response(JSON.stringify({ hits: pages[body.page] ?? [], nbPages: pages.length }), { status })
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

  it.concurrent('keeps paging until enough unique URLs are found', async () => {
    const same = { url: 'https://capgo.app/docs/a/', hierarchy: { lvl1: 'A' } }
    const { impl, requests } = fakeFetch([
      [same, same],
      [{ url: 'https://capgo.app/docs/b/', hierarchy: { lvl1: 'B' } }, same],
    ])
    const results = await searchCapgoDocs('a', 1, impl)
    expect(results.map(result => result.url)).toEqual(['https://capgo.app/docs/a/'])
    expect(requests).toHaveLength(1)
    const two = await searchCapgoDocs('a', 2, fakeFetch([[same, same, same, same], [{ url: 'https://capgo.app/docs/b/', hierarchy: { lvl1: 'B' } }]]).impl)
    expect(two.map(result => result.url)).toEqual(['https://capgo.app/docs/a/', 'https://capgo.app/docs/b/'])
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
