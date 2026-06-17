import type { Context } from 'hono'

import { CacheHelper } from './cache.ts'
import { cloudlog } from './logging.ts'
import { backgroundTask } from './utils.ts'

interface IpApiResponse {
  status: 'success' | 'fail'
  isp?: string
  org?: string
  as?: string
  asname?: string
  proxy?: boolean
  hosting?: boolean
}

type Provider = 'google' | 'apple'

interface InvalidIpInfo {
  blocked: boolean
  provider: Provider | null
}

const PROVIDER_IP_CACHE_PATH = '/provider-ip-classifier'
const PROVIDER_IP_CACHE_TTL_SECONDS = 60 * 60 * 24 // 24h
const PROVIDER_IP_FALLBACK_TTL_SECONDS = 60 * 60 // 1h after unresolved/failure
const GOOGLE_KEYWORDS = ['google cloud', 'google llc', 'google infrastructure', 'google data center']
const GOOGLE_ASNS = new Set(['AS15169', 'AS16591'])
const APPLE_KEYWORDS = ['apple inc', 'apple computer', 'apple cloud', 'apple data', 'apple internet']
const APPLE_ASNS = new Set(['AS714'])

type CacheableInvalidIpInfo = InvalidIpInfo & {
  cachedUntil: number
}

const inMemoryInvalidIpCache = new Map<string, CacheableInvalidIpInfo>()
const inflightLookups = new Map<string, Promise<InvalidIpInfo>>()

function normalize(value: string | undefined) {
  return (value ?? '').toLowerCase()
}

function parseAsn(asValue: string | undefined) {
  const match = normalize(asValue).match(/\bas(\d+)\b/)
  return match ? `AS${match[1]}` : null
}

function hasKeywordMatch(value: string, terms: string[]) {
  return terms.some(term => value.includes(term))
}

function isCloudDatacenterIp(ipInfo: IpApiResponse) {
  if (ipInfo.proxy === true || ipInfo.hosting === true)
    return true

  const asn = parseAsn(ipInfo.as)
  if (!asn)
    return false

  return GOOGLE_ASNS.has(asn) || APPLE_ASNS.has(asn)
}

function classifyProvider(ipInfo: IpApiResponse): Provider | null {
  const text = normalize([ipInfo.isp, ipInfo.org, ipInfo.asname].join(' '))
  const isDatacenter = isCloudDatacenterIp(ipInfo)

  if (isDatacenter && hasKeywordMatch(text, GOOGLE_KEYWORDS))
    return 'google'
  if (isDatacenter && hasKeywordMatch(text, APPLE_KEYWORDS))
    return 'apple'

  return null
}

function parseProviderResult(res: IpApiResponse): InvalidIpInfo {
  if (res.status !== 'success')
    return { blocked: false, provider: null }

  const provider = classifyProvider(res)
  return { blocked: provider !== null, provider }
}

async function ipapi(ip: string, lang = 'en') {
  ip = ip ?? ''
  lang = lang ?? 'en'

  const langs = ['en', 'de', 'es', 'pt-BR', 'fr', 'ja', 'zh-CN', 'ru']

  if (!langs.includes(lang))
    throw new Error(`unknown language, supported ones are: ${langs.join(', ')}`)

  try {
    const response = await fetch(`http://ip-api.com/json/${ip}?lang=${lang}&fields=66842623`)

    if (!response.ok) {
      await response.text()
      throw new Error(`ipapi error: HTTP ${response.status}`)
    }

    return await response.json() as IpApiResponse
  }
  catch (e) {
    throw new Error(`ipapi error: ${e instanceof Error ? e.message : String(e)}`)
  }
}

function now() {
  return Date.now()
}

function getCachedFromMemory(ip: string) {
  const cached = inMemoryInvalidIpCache.get(ip)
  if (!cached)
    return null

  if (cached.cachedUntil <= now()) {
    inMemoryInvalidIpCache.delete(ip)
    return null
  }

  return cached
}

function setCachedInMemory(ip: string, info: InvalidIpInfo, ttlSeconds = PROVIDER_IP_CACHE_TTL_SECONDS) {
  inMemoryInvalidIpCache.set(ip, {
    ...info,
    cachedUntil: now() + ttlSeconds * 1000,
  })
}

async function cachedInvalidIpInfo(context: Context | undefined, ip: string) {
  const memoryCached = getCachedFromMemory(ip)
  if (memoryCached)
    return {
      blocked: memoryCached.blocked,
      provider: memoryCached.provider,
    }

  if (!context)
    return null

  try {
    const helper = new CacheHelper(context)
    const cacheRequest = helper.buildRequest(PROVIDER_IP_CACHE_PATH, { ip })
    const cached = await helper.matchJson<InvalidIpInfo>(cacheRequest)
    if (cached?.provider !== undefined)
      setCachedInMemory(ip, cached)
    return cached
  }
  catch (error) {
    cloudlog({
      requestId: context.get('requestId'),
      message: 'Provider IP cache read failed in invalids_ip',
      error,
    })
    return null
  }
}

async function storeInvalidIpInfo(context: Context | undefined, ip: string, info: InvalidIpInfo, ttlSeconds = PROVIDER_IP_CACHE_TTL_SECONDS) {
  setCachedInMemory(ip, info, ttlSeconds)
  if (!context)
    return

  try {
    const helper = new CacheHelper(context)
    const cacheRequest = helper.buildRequest(PROVIDER_IP_CACHE_PATH, { ip })
    await helper.putJson(cacheRequest, info, ttlSeconds)
  }
  catch (error) {
    cloudlog({
      requestId: context.get('requestId'),
      message: 'Provider IP cache write failed in invalids_ip',
      error,
    })
  }
}

async function fetchProviderIpInfo(ip: string, context?: Context) {
  try {
    const response = await ipapi(ip)
    return parseProviderResult(response)
  }
  catch (error) {
    cloudlog({
      requestId: context?.get('requestId'),
      message: 'IP provider classification failed in invalids_ip, failing open',
      ip,
      error,
    })
    return { blocked: false, provider: null }
  }
}

function triggerProviderIpLookup(context: Context | undefined, ip: string) {
  if (inflightLookups.has(ip))
    return

  const lookup = (async () => {
    const result = await fetchProviderIpInfo(ip, context)
    const ttlSeconds = result.provider ? PROVIDER_IP_CACHE_TTL_SECONDS : PROVIDER_IP_FALLBACK_TTL_SECONDS
    await storeInvalidIpInfo(context, ip, result, ttlSeconds)
    return result
  })()

  inflightLookups.set(ip, lookup)
  void lookup.finally(() => {
    inflightLookups.delete(ip)
  })

  if (context)
    void backgroundTask(context, lookup)
}

export async function invalidIpInfo(ip: string, context?: Context): Promise<InvalidIpInfo> {
  if (!ip)
    return { blocked: false, provider: null }

  if (context) {
    const cached = await cachedInvalidIpInfo(context, ip)
    if (cached?.provider !== undefined)
      return cached

    triggerProviderIpLookup(context, ip)
    return { blocked: false, provider: null }
  }

  const inFlight = inflightLookups.get(ip)
  if (inFlight)
    return inFlight.catch(() => ({ blocked: false, provider: null }))

  const result = await fetchProviderIpInfo(ip)
  const ttlSeconds = result.provider ? PROVIDER_IP_CACHE_TTL_SECONDS : PROVIDER_IP_FALLBACK_TTL_SECONDS
  await storeInvalidIpInfo(context, ip, result, ttlSeconds)
  return result
}

export async function invalidIp(ip: string, context?: Context) {
  const result = await invalidIpInfo(ip, context)
  return result.blocked
}

export async function invalidIps(ips: string[], context?: Context) {
  for (const ip of ips) {
    const result = await invalidIpInfo(ip, context)
    if (result.blocked)
      return true
  }
  return false
}
