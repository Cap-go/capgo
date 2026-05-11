import { isPrivateIp } from './ip.ts'

const DNS_LOOKUP_URL = 'https://cloudflare-dns.com/dns-query'
const DNS_LOOKUP_TIMEOUT_MS = 1500
const DEFAULT_MAX_REDIRECTS = 5
const IPV4_REGEX = /^\d{1,3}(?:\.\d{1,3}){3}$/
const LOCALHOST_SUFFIX = '.localhost'

export interface PublicUrlValidationMessages {
  invalidUrl: string
  publicHost: string
  ipLiteral: string
  https: string
  dnsResolution: string
  fetchFailed?: string
  tooManyRedirects?: string
}

export interface PublicUrlValidationOptions {
  allowLocalUrls?: boolean
  requireDnsResolution?: boolean
  requireHttps?: boolean
  messages: PublicUrlValidationMessages
}

export interface FetchPublicUrlOptions extends PublicUrlValidationOptions {
  maxRedirects?: number
}

export function normalizePublicHostname(hostname: string): string {
  return hostname.replace(/\.$/, '').toLowerCase()
}

function isLocalhostHostname(hostname: string): boolean {
  return hostname === 'localhost' || hostname.endsWith(LOCALHOST_SUFFIX)
}

function isIpLiteral(hostname: string): boolean {
  return IPV4_REGEX.test(hostname) || hostname.includes(':')
}

async function resolveHostnameIps(hostname: string, type: 'A' | 'AAAA') {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), DNS_LOOKUP_TIMEOUT_MS)

  try {
    const dnsUrl = new URL(DNS_LOOKUP_URL)
    dnsUrl.searchParams.set('name', hostname)
    dnsUrl.searchParams.set('type', type)

    const response = await fetch(dnsUrl.toString(), {
      headers: { Accept: 'application/dns-json' },
      signal: controller.signal,
    })
    if (!response.ok)
      return []

    const data = await response.json() as { Answer?: Array<{ data?: string }> }
    return (data.Answer ?? [])
      .map(answer => answer.data?.trim() ?? '')
      .filter(answer => !!answer && isIpLiteral(answer))
  }
  catch {
    return []
  }
  finally {
    clearTimeout(timeoutId)
  }
}

export function getPublicUrlSyntaxValidationError(urlString: string, options: PublicUrlValidationOptions): string | null {
  let url: URL
  try {
    url = new URL(urlString)
  }
  catch {
    return options.messages.invalidUrl
  }

  if (options.allowLocalUrls)
    return null

  const hostname = normalizePublicHostname(url.hostname)
  if (isLocalhostHostname(hostname))
    return options.messages.publicHost

  if (isIpLiteral(hostname))
    return options.messages.ipLiteral

  if ((options.requireHttps ?? true) && url.protocol !== 'https:')
    return options.messages.https

  if (!(options.requireHttps ?? true) && url.protocol !== 'https:' && url.protocol !== 'http:')
    return options.messages.https

  return null
}

export async function getPublicHostnameValidationError(urlString: string, options: PublicUrlValidationOptions): Promise<string | null> {
  const syntaxError = getPublicUrlSyntaxValidationError(urlString, options)
  if (syntaxError || options.allowLocalUrls)
    return syntaxError

  let url: URL
  try {
    url = new URL(urlString)
  }
  catch {
    return options.messages.invalidUrl
  }

  const [ipv4Answers, ipv6Answers] = await Promise.all([
    resolveHostnameIps(url.hostname, 'A'),
    resolveHostnameIps(url.hostname, 'AAAA'),
  ])
  const ips = [...ipv4Answers, ...ipv6Answers]

  if (ips.some(isPrivateIp))
    return options.messages.publicHost

  if (options.requireDnsResolution && ips.length === 0)
    return options.messages.dnsResolution

  return null
}

export async function fetchPublicUrl(
  urlString: string,
  init: RequestInit | undefined,
  options: FetchPublicUrlOptions,
): Promise<{ error: string | null, response: Response | null, finalUrl: string | null }> {
  let currentUrl = urlString
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount++) {
    const validationError = await getPublicHostnameValidationError(currentUrl, options)
    if (validationError)
      return { error: validationError, response: null, finalUrl: null }

    let response: Response
    try {
      response = await fetch(currentUrl, {
        ...init,
        redirect: 'manual',
      })
    }
    catch {
      return { error: options.messages.fetchFailed ?? options.messages.invalidUrl, response: null, finalUrl: null }
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location')
      if (!location)
        return { error: options.messages.fetchFailed ?? options.messages.invalidUrl, response: null, finalUrl: null }

      try {
        currentUrl = new URL(location, currentUrl).toString()
      }
      catch {
        return { error: options.messages.fetchFailed ?? options.messages.invalidUrl, response: null, finalUrl: null }
      }
      continue
    }

    return { error: null, response, finalUrl: currentUrl }
  }

  return { error: options.messages.tooManyRedirects ?? options.messages.invalidUrl, response: null, finalUrl: null }
}
