export type DnsRecordType = 'A' | 'AAAA'

export const DEFAULT_DNS_LOOKUP_URL = 'https://cloudflare-dns.com/dns-query'
const DEFAULT_DNS_LOOKUP_TIMEOUT_MS = 2_000
const IPV4_REGEX = /^\d{1,3}(?:\.\d{1,3}){3}$/

interface ResolveHostnameIpsOptions {
  dnsLookupUrl?: string
  onError?: (_error: unknown) => void
  timeoutMs?: number
}

function parseIpv4Octets(ip: string) {
  const octets = ip.split('.').map(part => Number.parseInt(part, 10))
  if (octets.length !== 4 || octets.some(part => Number.isNaN(part) || part < 0 || part > 255))
    return null
  return octets
}

function isPrivateIpv4(ip: string) {
  const octets = parseIpv4Octets(ip)
  if (!octets)
    return true

  const [a, b, c] = octets
  return a === 0
    || a === 10
    || a === 127
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 198 && (b === 18 || b === 19))
    || (a === 192 && b === 0 && c === 0)
    || (a === 192 && b === 0 && c === 2)
    || (a === 198 && b === 51 && c === 100)
    || (a === 203 && b === 0 && c === 113)
    || a >= 224
}

function parseIpv4MappedIpv6Tail(tail: string) {
  if (tail.includes('.'))
    return tail

  const parts = tail.split(':')
  if (parts.length !== 2)
    return null

  const words = parts.map(part => Number.parseInt(part, 16))
  if (words.some(word => Number.isNaN(word) || word < 0 || word > 0xFFFF))
    return null

  return [
    words[0] >> 8,
    words[0] & 0xFF,
    words[1] >> 8,
    words[1] & 0xFF,
  ].join('.')
}

function parseFirstHextet(ip: string) {
  const first = ip.split(':')[0] || '0'
  const hextet = Number.parseInt(first, 16)
  return Number.isNaN(hextet) ? null : hextet
}

function isPrivateIpv6(ip: string) {
  const normalized = ip.toLowerCase()
  if (normalized === '::1' || normalized === '::')
    return true

  if (normalized.startsWith('::ffff:')) {
    const mappedIpv4 = parseIpv4MappedIpv6Tail(normalized.slice(7))
    return mappedIpv4 ? isPrivateIpv4(mappedIpv4) : true
  }

  const firstHextet = parseFirstHextet(normalized)
  if (firstHextet === null)
    return true

  return (firstHextet & 0xFFC0) === 0xFE80
    || (firstHextet & 0xFFC0) === 0xFEC0
    || (firstHextet & 0xFE00) === 0xFC00
    || (firstHextet & 0xFF00) === 0xFF00
    || normalized === '100::'
    || normalized.startsWith('100::')
    || normalized === '64:ff9b::'
    || normalized.startsWith('64:ff9b:')
    || normalized.startsWith('2001:db8:')
}

export function isIpLiteral(value: string) {
  return IPV4_REGEX.test(value) || value.includes(':')
}

export function isPrivateIp(ip: string) {
  return ip.includes(':') ? isPrivateIpv6(ip) : isPrivateIpv4(ip)
}

export async function resolveHostnameIps(hostname: string, type: DnsRecordType, options: ResolveHostnameIpsOptions = {}) {
  const dnsUrl = new URL(options.dnsLookupUrl || DEFAULT_DNS_LOOKUP_URL)
  dnsUrl.searchParams.set('name', hostname)
  dnsUrl.searchParams.set('type', type)

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_DNS_LOOKUP_TIMEOUT_MS)

  try {
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
  catch (error) {
    options.onError?.(error)
    return []
  }
  finally {
    clearTimeout(timeoutId)
  }
}
