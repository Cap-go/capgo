import type { Context } from 'hono'

import { CacheHelper } from './cache.ts'
import { cloudlog } from './logging.ts'

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
const GOOGLE_KEYWORDS = ['google cloud', 'google llc', 'google infrastructure', 'google data center']
const GOOGLE_ASNS = new Set(['AS15169', 'AS16591'])
const APPLE_KEYWORDS = ['apple inc', 'apple computer', 'apple cloud', 'apple data', 'apple internet']
const APPLE_ASNS = new Set(['AS714'])

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

async function cachedInvalidIpInfo(context: Context | undefined, ip: string) {
  if (!context)
    return null

  try {
    const helper = new CacheHelper(context)
    const cacheRequest = helper.buildRequest(PROVIDER_IP_CACHE_PATH, { ip })
    return await helper.matchJson<InvalidIpInfo>(cacheRequest)
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

async function storeInvalidIpInfo(context: Context | undefined, ip: string, info: InvalidIpInfo) {
  if (!context)
    return

  try {
    const helper = new CacheHelper(context)
    const cacheRequest = helper.buildRequest(PROVIDER_IP_CACHE_PATH, { ip })
    await helper.putJson(cacheRequest, info, PROVIDER_IP_CACHE_TTL_SECONDS)
  }
  catch (error) {
    cloudlog({
      requestId: context.get('requestId'),
      message: 'Provider IP cache write failed in invalids_ip',
      error,
    })
  }
}

export async function invalidIpInfo(ip: string, context?: Context): Promise<InvalidIpInfo> {
  if (!ip)
    return { blocked: false, provider: null }

  if (context) {
    const cached = await cachedInvalidIpInfo(context, ip)
    if (cached?.provider !== undefined)
      return cached
  }

  const result: InvalidIpInfo = { blocked: false, provider: null }

  try {
    const res = await ipapi(ip)
    if (res.status === 'success') {
      result.provider = classifyProvider(res)
      result.blocked = result.provider !== null
    }
  }
  catch (error) {
    cloudlog({
      requestId: context?.get('requestId'),
      message: 'IP provider classification failed in invalids_ip, failing open',
      ip,
      error,
    })
  }

  await storeInvalidIpInfo(context, ip, result)
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
