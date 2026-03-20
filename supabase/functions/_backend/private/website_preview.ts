import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import { Hono } from 'hono/tiny'
import { middlewareAuth, parseBody, quickError, useCors } from '../utils/hono.ts'
import { getWebhookUrlValidationError } from '../utils/webhook.ts'

const MAX_ICON_BYTES = 512 * 1024

export const app = new Hono<MiddlewareKeyVariables>()

app.use('/', useCors)

function normalizeWebsiteUrl(input: string) {
  const trimmed = input.trim()
  if (!trimmed)
    return ''

  try {
    return new URL(/^https?:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`).toString()
  }
  catch {
    return ''
  }
}

function decodeHtmlEntities(value: string) {
  return value
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', '\'')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .trim()
}

function deriveNameFromHostname(hostname: string) {
  const segment = hostname.replace(/^www\./, '').split('.').filter(Boolean)[0] ?? ''
  return segment
    .split(/[-_]+/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function findMetaContent(html: string, key: string) {
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${key}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${key}["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]+name=["']${key}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${key}["'][^>]*>`, 'i'),
  ]

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

async function fetchIconDataUrl(iconUrl: string) {
  const response = await fetch(iconUrl)
  if (!response.ok)
    return null

  const contentType = response.headers.get('content-type')?.split(';')[0]?.trim() ?? ''
  if (!contentType.startsWith('image/'))
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

  const websiteValidationError = getWebhookUrlValidationError(c, website)
  if (websiteValidationError)
    return quickError(400, 'invalid_website', websiteValidationError)

  const response = await fetch(website, {
    headers: {
      'User-Agent': 'CapgoWebsitePreview/1.0',
      'Accept': 'text/html,application/xhtml+xml',
    },
  })

  if (!response.ok)
    return quickError(400, 'website_fetch_failed', 'Could not fetch website')

  const contentType = response.headers.get('content-type')?.split(';')[0]?.trim() ?? ''
  if (!contentType.includes('html'))
    return quickError(400, 'website_not_html', 'Website did not return HTML')

  const html = await response.text()
  const finalUrl = new URL(response.url)
  const hostname = finalUrl.hostname.replace(/^www\./, '')

  const name = findMetaContent(html, 'og:site_name')
    || findMetaContent(html, 'application-name')
    || findTitle(html)
    || deriveNameFromHostname(hostname)

  const iconHref = findIconHref(html)
  const iconUrl = iconHref ? new URL(iconHref, finalUrl).toString() : ''
  if (iconUrl) {
    const iconValidationError = getWebhookUrlValidationError(c, iconUrl)
    if (iconValidationError)
      return quickError(400, 'invalid_website', iconValidationError)
  }
  const icon = iconUrl ? await fetchIconDataUrl(iconUrl) : null

  return c.json({
    website: finalUrl.toString(),
    hostname,
    name,
    icon,
  })
})
