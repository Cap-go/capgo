/**
 * Search the public Capgo documentation (capgo.app/docs) through the Algolia DocSearch index
 * that powers the docs site search box. The key is the public search-only key already shipped
 * to every browser by the docs site, so it grants nothing beyond what visitors can already do.
 */
const DOCSEARCH_APP_ID = 'R0TIQUJRSN'
const DOCSEARCH_SEARCH_KEY = '039b8d50eaa068b9ff8726d912c6f388'
const DOCSEARCH_INDEX = 'capgo'
const DOCSEARCH_TIMEOUT_MS = 8_000
const SNIPPET_MAX_CHARS = 300

export const DOCS_SEARCH_MAX_RESULTS = 20

export interface DocsSearchResult {
  title: string
  url: string
  snippet?: string
}

interface DocSearchHit {
  url?: string
  content?: string | null
  hierarchy?: Record<string, string | null>
}

const HTML_ENTITIES: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': '\'' }

/** DocSearch stores page text HTML-escaped; agents need plain text. */
function decodeEntities(value: string): string {
  return value.replaceAll(/&(?:amp|lt|gt|quot|#39);/g, entity => HTML_ENTITIES[entity] ?? entity)
}

function hitTitle(hit: DocSearchHit): string {
  const levels = Object.entries(hit.hierarchy ?? {})
    .filter(([level, value]) => level !== 'lvl0' && !!value)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, value]) => decodeEntities(value as string))
  return levels.join(' > ') || hit.hierarchy?.lvl0 || hit.url || ''
}

function hitSnippet(hit: DocSearchHit): string | undefined {
  const content = hit.content ? decodeEntities(hit.content).replaceAll(/\s+/g, ' ').trim() : undefined
  if (!content)
    return undefined
  return content.length > SNIPPET_MAX_CHARS ? `${content.slice(0, SNIPPET_MAX_CHARS)}…` : content
}

export async function searchCapgoDocs(query: string, limit = 8, fetchImpl: typeof fetch = fetch): Promise<DocsSearchResult[]> {
  const size = Math.min(Math.max(Math.trunc(limit), 1), DOCS_SEARCH_MAX_RESULTS)
  const response = await fetchImpl(`https://${DOCSEARCH_APP_ID}-dsn.algolia.net/1/indexes/${DOCSEARCH_INDEX}/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Algolia-Application-Id': DOCSEARCH_APP_ID,
      'X-Algolia-API-Key': DOCSEARCH_SEARCH_KEY,
    },
    body: JSON.stringify({
      query,
      // Over-fetch: several hits can point at the same section anchor.
      hitsPerPage: size * 2,
      facetFilters: ['lang:en'],
      attributesToRetrieve: ['url', 'hierarchy', 'content'],
      attributesToHighlight: [],
    }),
    signal: AbortSignal.timeout(DOCSEARCH_TIMEOUT_MS),
  })
  if (!response.ok)
    throw new Error(`Docs search failed with HTTP ${response.status}`)
  const data = await response.json() as { hits?: DocSearchHit[] }
  const seen = new Set<string>()
  const results: DocsSearchResult[] = []
  for (const hit of data.hits ?? []) {
    if (!hit.url || seen.has(hit.url))
      continue
    seen.add(hit.url)
    const snippet = hitSnippet(hit)
    results.push({ title: hitTitle(hit), url: hit.url, ...(snippet ? { snippet } : {}) })
    if (results.length >= size)
      break
  }
  return results
}
