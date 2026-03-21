import type { Context } from 'hono'
import { createHono, middlewareAuth, parseBody, quickError, useCors } from '../utils/hono.ts'
import { version } from '../utils/version.ts'
import { getWebhookUrlValidationError } from '../utils/webhook.ts'

const MAX_ICON_BYTES = 512 * 1024
const MAX_HTML_BYTES = 1024 * 1024
const MAX_REDIRECTS = 5
const DNS_LOOKUP_URL = 'https://cloudflare-dns.com/dns-query'

export const app = createHono('', version)

app.use('/', useCors)

function normalizeWebsiteUrl(input: string) {
  const trimmed = input.trim()
  if (!trimmed)
    return ''

  try {
    const normalized = new URL(/^https?:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`)
    if (normalized.username || normalized.password)
      return ''
    return normalized.toString()
  }
  catch {
    return ''
  }
}

function decodeHtmlEntities(value: string) {
  const namedEntities: Record<string, string> = {
    amp: '&',
    apos: '\'',
    gt: '>',
    lt: '<',
    nbsp: ' ',
    quot: '"',
  }

  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity: string) => {
    if (entity.startsWith('#x') || entity.startsWith('#X')) {
      const codePoint = Number.parseInt(entity.slice(2), 16)
      return Number.isNaN(codePoint) ? match : String.fromCodePoint(codePoint)
    }

    if (entity.startsWith('#')) {
      const codePoint = Number.parseInt(entity.slice(1), 10)
      return Number.isNaN(codePoint) ? match : String.fromCodePoint(codePoint)
    }

    return namedEntities[entity.toLowerCase()] ?? match
  }).trim()
}

function deriveNameFromHostname(hostname: string) {
  const segment = hostname.replace(/^www\./, '').split('.').filter(Boolean)[0] ?? ''
  return segment
    .split(/[-_]+/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function normalizeCandidateName(value: string, hostname: string, options?: { preferLeadingSegment?: boolean }) {
  const trimmed = decodeHtmlEntities(value).trim()
  if (!trimmed)
    return ''

  const withoutProtocol = trimmed.replace(/^https?:\/\//i, '').replace(/^www\./i, '')
  if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(withoutProtocol) && !withoutProtocol.includes(' ')) {
    return deriveNameFromHostname(withoutProtocol)
  }

  const parts = options?.preferLeadingSegment
    ? trimmed.split(/\s[|·•:–—-]\s|[|·•:–—]/).map(part => part.trim()).filter(Boolean)
    : [trimmed]

  const candidate = parts[0] ?? trimmed
  if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(candidate) && !candidate.includes(' ')) {
    return deriveNameFromHostname(candidate)
  }

  return candidate
}

const META_PATTERNS = {
  'application-name': [
    /<meta[^>]+name=["']application-name["'][^>]+content=["']([^"']+)["'][^>]*>/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']application-name["'][^>]*>/i,
  ],
  'og:site_name': [
    /<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["'][^>]*>/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:site_name["'][^>]*>/i,
  ],
} as const

function findMetaContent(html: string, key: keyof typeof META_PATTERNS) {
  const patterns = META_PATTERNS[key]

  for (const pattern of patterns) {
    const match = pattern.exec(html)
    if (match?.[1])
      return decodeHtmlEntities(match[1])
  }

  return ''
}

function findTitle(html: string) {
  const match = /<title[^>]*>([^<]+)<\/title>/i.exec(html)
  return match?.[1] ? decodeHtmlEntities(match[1]) : ''
}

function findIconHref(html: string) {
  const linkRegex = /<link\b[^>]*>/gi
  const candidates: Array<{ priority: number, href: string }> = []

  for (const tag of html.match(linkRegex) ?? []) {
    const rel = /rel=["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase() ?? ''
    const href = /href=["']([^"']+)["']/i.exec(tag)?.[1] ?? ''
    if (!href || !rel.includes('icon'))
      continue

    const priority = rel.includes('apple-touch-icon')
      ? 3
      : rel.includes('shortcut')
        ? 2
        : 1

    candidates.push({ priority, href })
  }

  return candidates.sort((a, b) => b.priority - a.priority)[0]?.href ?? ''
}

function isPrivateIpv4(ip: string) {
  const octets = ip.split('.').map(part => Number.parseInt(part, 10))
  if (octets.length !== 4 || octets.some(part => Number.isNaN(part) || part < 0 || part > 255))
    return true

  const [a, b] = octets
  return a === 0
    || a === 10
    || a === 127
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 198 && (b === 18 || b === 19))
  // Reserved TEST-NET ranges are also non-public for this fetch path.
    || (a === 192 && b === 0)
    || (a === 192 && b === 0 && octets[2] === 2)
    || (a === 198 && b === 51 && octets[2] === 100)
    || (a === 203 && b === 0 && octets[2] === 113)
}

function isPrivateIpv6(ip: string) {
  const normalized = ip.toLowerCase()
  if (normalized === '::1' || normalized === '::')
    return true
  if (normalized.startsWith('fe80:') || normalized.startsWith('fc') || normalized.startsWith('fd'))
    return true
  if (normalized.startsWith('::ffff:')) {
    const mappedIpv4 = normalized.slice(7)
    return isPrivateIpv4(mappedIpv4)
  }
  return false
}

function isPrivateIp(ip: string) {
  return ip.includes(':') ? isPrivateIpv6(ip) : isPrivateIpv4(ip)
}

function isIpLiteral(value: string) {
  return /^[0-9.]+$/.test(value) || value.includes(':')
}

async function resolveHostnameIps(hostname: string, type: 'A' | 'AAAA') {
  const dnsUrl = new URL(DNS_LOOKUP_URL)
  dnsUrl.searchParams.set('name', hostname)
  dnsUrl.searchParams.set('type', type)

  const response = await fetch(dnsUrl.toString(), {
    headers: { Accept: 'application/dns-json' },
  })
  if (!response.ok)
    return []

  const data = await response.json() as { Answer?: Array<{ data?: string }> }
  return (data.Answer ?? [])
    .map(answer => answer.data?.trim() ?? '')
    .filter(answer => !!answer && isIpLiteral(answer))
}

async function getPublicHostnameValidationError(c: Context, urlString: string) {
  const validationError = getWebhookUrlValidationError(c, urlString)
  if (validationError)
    return validationError

  let url: URL
  try {
    url = new URL(urlString)
  }
  catch {
    return 'Website must be a valid URL'
  }

  const ips = [
    ...await resolveHostnameIps(url.hostname, 'A'),
    ...await resolveHostnameIps(url.hostname, 'AAAA'),
  ]

  if (ips.length === 0)
    return 'Could not resolve website host'
  if (ips.some(isPrivateIp))
    return 'Website must point to a public host'

  return null
}

async function readResponseTextWithLimit(response: Response, limit: number) {
  const contentLength = Number.parseInt(response.headers.get('content-length') ?? '', 10)
  if (Number.isFinite(contentLength) && contentLength > limit)
    return null

  if (!response.body)
    return await response.text()

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done)
      break

    if (!value)
      continue

    total += value.byteLength
    if (total > limit) {
      await reader.cancel()
      return null
    }
    chunks.push(value)
  }

  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }

  return new TextDecoder().decode(bytes)
}

async function fetchValidatedUrl(
  c: Context,
  urlString: string,
  init?: RequestInit,
) {
  let currentUrl = urlString

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount++) {
    const validationError = await getPublicHostnameValidationError(c, currentUrl)
    if (validationError)
      return { error: validationError, response: null as Response | null }

    let response: Response
    try {
      response = await fetch(currentUrl, {
        ...init,
        redirect: 'manual',
      })
    }
    catch {
      return { error: 'Could not fetch website', response: null as Response | null }
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location')
      if (!location)
        return { error: 'Could not fetch website', response: null as Response | null }

      currentUrl = new URL(location, currentUrl).toString()
      continue
    }

    return { error: null, response }
  }

  return { error: 'Too many redirects', response: null as Response | null }
}

async function fetchIconDataUrl(c: Context, iconUrl: string) {
  const { error, response } = await fetchValidatedUrl(c, iconUrl)
  if (error || !response)
    return null

  if (!response.ok)
    return null

  const contentType = response.headers.get('content-type')?.split(';')[0]?.trim() ?? ''
  if (!contentType.startsWith('image/'))
    return null

  const contentLength = Number.parseInt(response.headers.get('content-length') ?? '', 10)
  if (Number.isFinite(contentLength) && contentLength > MAX_ICON_BYTES)
    return null

  const arrayBuffer = await response.arrayBuffer()
  if (arrayBuffer.byteLength === 0 || arrayBuffer.byteLength > MAX_ICON_BYTES)
    return null

  const bytes = new Uint8Array(arrayBuffer)
  let binary = ''
  const chunkSize = 0x8000
  for (let index = 0; index < bytes.length; index += chunkSize)
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize))

  return `data:${contentType};base64,${btoa(binary)}`
}

app.post('/', middlewareAuth, async (c) => {
  const body = await parseBody<{ website?: string }>(c)
  const rawWebsite = body.website
  if (typeof rawWebsite !== 'string' || rawWebsite.trim() === '')
    return quickError(400, 'invalid_website', 'Website must be a valid URL')

  const website = normalizeWebsiteUrl(rawWebsite.trim())
  if (!website)
    return quickError(400, 'invalid_website', 'Website must be a valid URL')

  const websiteValidationError = await getPublicHostnameValidationError(c, website)
  if (websiteValidationError)
    return quickError(400, 'invalid_website', websiteValidationError)

  const { error: fetchError, response } = await fetchValidatedUrl(c, website, {
    headers: {
      'User-Agent': 'CapgoWebsitePreview/1.0',
      'Accept': 'text/html,application/xhtml+xml',
    },
  })
  if (fetchError || !response)
    return quickError(400, 'invalid_website', fetchError ?? 'Could not fetch website')

  if (!response.ok)
    return quickError(400, 'website_fetch_failed', 'Could not fetch website')

  const contentType = response.headers.get('content-type')?.split(';')[0]?.trim() ?? ''
  if (!contentType.includes('html'))
    return quickError(400, 'website_not_html', 'Website did not return HTML')

  const html = await readResponseTextWithLimit(response, MAX_HTML_BYTES)
  if (!html)
    return quickError(400, 'website_too_large', 'Website response is too large')
  const finalUrl = new URL(response.url)
  const hostname = finalUrl.hostname.replace(/^www\./, '')

  const name = normalizeCandidateName(findMetaContent(html, 'og:site_name'), hostname)
    || normalizeCandidateName(findMetaContent(html, 'application-name'), hostname)
    || normalizeCandidateName(findTitle(html), hostname, { preferLeadingSegment: true })
    || deriveNameFromHostname(hostname)

  const iconHref = findIconHref(html)
  const iconUrl = iconHref ? new URL(iconHref, finalUrl).toString() : ''
  const icon = iconUrl ? await fetchIconDataUrl(c, iconUrl) : null

  return c.json({
    website: finalUrl.toString(),
    hostname,
    name,
    icon,
  })
})
