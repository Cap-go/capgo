import type { Context } from 'hono'
import type { Database } from './supabase.types.ts'
import type { DeviceWithoutCreatedAt, StatsActions, StatsMetadata, VersionUsageChannel } from './types.ts'
import { getRuntimeKey } from 'hono/adapter'
import { createIfNotExistStoreInfo, trackBandwidthUsageCF, trackDevicesCF, trackDeviceUsageCF, trackLogsCF, trackLogsCFExternal, trackVersionUsageCF, updateStoreApp } from './cloudflare.ts'
import { normalizeDeviceCountryCode } from './deviceComparison.ts'
import { simpleError200 } from './hono.ts'
import { cloudlog } from './logging.ts'
import { logSkippedSupabaseWrite, shouldSkipSupabaseStatsFallback } from './supabase_write_guard.ts'
import { backgroundTask, isInternalVersionName } from './utils.ts'

/**
 * Plugin stats writers.
 *
 * The Cloudflare plugin isolate always sets skipSupabaseStatsFallback and never
 * needs supabase-js. Supabase fallbacks are loaded through a non-literal
 * dynamic import so wrangler/esbuild cannot statically pull supabase-js (and
 * its Stripe edge) into the plugin worker bundle. Local Supabase function tests
 * still hit the fallback when Analytics Engine bindings are absent.
 */

export type VersionAction = 'get' | 'fail' | 'install' | 'uninstall'

export interface StatsLogDimensions {
  platform?: string | null
  country_code?: string | null
  plugin_version?: string | null
}

type SupabaseStatsWriters = typeof import('./supabase.ts')

function loadSupabaseStatsWriters(): Promise<SupabaseStatsWriters> {
  // Non-literal specifier: intentional. A string-literal import('./supabase.ts')
  // is still bundled by wrangler/esbuild even inside dead branches.
  const specifier = `./${'supabase'}.ts`
  return import(specifier) as Promise<SupabaseStatsWriters>
}

export function normalizeStatsMetadata(metadata?: StatsMetadata): StatsMetadata | undefined {
  if (!metadata)
    return undefined

  const normalized: StatsMetadata = {}
  for (const [key, value] of Object.entries(metadata)) {
    const normalizedKey = key.slice(0, 64)
    if (!normalizedKey || typeof value !== 'string')
      continue
    normalized[normalizedKey] = value.slice(0, 2048)
    if (Object.keys(normalized).length >= 30)
      break
  }

  return Object.keys(normalized).length > 0 ? normalized : undefined
}

function getStatsLogDimensions(c: Context, device: DeviceWithoutCreatedAt): StatsLogDimensions {
  const requestCountry = c.req.raw?.cf?.country
  const countryCode = normalizeDeviceCountryCode(typeof requestCountry === 'string' ? requestCountry : device.country_code)
  return {
    platform: device.platform,
    country_code: countryCode,
    plugin_version: device.plugin_version,
  }
}

export function createStatsMau(c: Context, device_id: string, app_id: string, org_id: string, platform: string, version_build?: string | null): Promise<void> {
  const lowerDeviceId = device_id
  if (c.env.DEVICE_USAGE)
    return Promise.resolve(trackDeviceUsageCF(c, lowerDeviceId, app_id, org_id, platform, version_build)).then(() => undefined)

  if (shouldSkipSupabaseStatsFallback(c)) {
    logSkippedSupabaseWrite(c, 'trackDeviceUsageSB')
    return Promise.resolve()
  }

  return loadSupabaseStatsWriters()
    .then(sb => Promise.resolve(sb.trackDeviceUsageSB(c, lowerDeviceId, app_id, org_id, platform, version_build)))
    .then(() => undefined)
}

export async function onPremStats(c: Context, app_id: string, action: string, device: DeviceWithoutCreatedAt, metadata?: StatsMetadata) {
  if (!app_id) {
    cloudlog({ requestId: c.get('requestId'), message: 'App ID is missing in onPremStats', country: c.req.raw?.cf?.country })
    return simpleError200(c, 'app_not_found', 'App not found')
  }
  await backgroundTask(c, async () => {
    const res = await createIfNotExistStoreInfo(c, {
      app_id,
      updates: 1,
      onprem: true,
      capacitor: true,
      capgo: true,
    })
    if (!res && action === 'get')
      await updateStoreApp(c, app_id, 1)
  })

  await createStatsLogsExternal(
    c,
    device.app_id,
    device.device_id,
    'get',
    device.version_name,
    metadata,
    getStatsLogDimensions(c, device),
  )
  cloudlog({ requestId: c.get('requestId'), message: 'App is external (onPremise), returning 429', app_id: device.app_id, country: c.req.raw.cf?.country, user_agent: c.req.raw.headers.get('user-agent') })
  return c.json({ error: 'on_premise_app', message: 'On-premise app detected' }, 429)
}

export function createStatsBandwidth(c: Context, device_id: string, app_id: string, file_size: number) {
  const lowerDeviceId = device_id
  cloudlog({ requestId: c.get('requestId'), message: 'createStatsBandwidth', device_id: lowerDeviceId, app_id, file_size })
  if (file_size === 0)
    return
  if (c.env.BANDWIDTH_USAGE)
    return trackBandwidthUsageCF(c, lowerDeviceId, app_id, file_size)

  if (shouldSkipSupabaseStatsFallback(c)) {
    logSkippedSupabaseWrite(c, 'trackBandwidthUsageSB')
    return Promise.resolve()
  }

  return backgroundTask(c, loadSupabaseStatsWriters().then(sb => sb.trackBandwidthUsageSB(c, lowerDeviceId, app_id, file_size)))
}

export function createStatsVersion(c: Context, version_name: string, app_id: string, action: VersionAction, channel?: VersionUsageChannel | string | null) {
  if (isInternalVersionName(version_name))
    return Promise.resolve()
  if (c.env.VERSION_USAGE)
    return trackVersionUsageCF(c, version_name, app_id, action, channel)

  if (shouldSkipSupabaseStatsFallback(c)) {
    logSkippedSupabaseWrite(c, 'trackVersionUsageSB')
    return Promise.resolve()
  }

  return backgroundTask(c, loadSupabaseStatsWriters().then(sb => sb.trackVersionUsageSB(c, version_name, app_id, action, channel)))
}

export function createStatsLogsExternal(c: Context, app_id: string, device_id: string, action: Database['public']['Enums']['stats_action'], versionName?: string, metadata?: StatsMetadata, dimensions?: StatsLogDimensions) {
  const lowerDeviceId = device_id
  const finalVersionName = versionName && versionName !== '' ? versionName : 'unknown'
  const finalMetadata = normalizeStatsMetadata(metadata)
  if (c.env.APP_LOG_EXTERNAL)
    return trackLogsCFExternal(c, app_id, lowerDeviceId, action, finalVersionName, finalMetadata, dimensions)

  if (shouldSkipSupabaseStatsFallback(c)) {
    logSkippedSupabaseWrite(c, 'trackLogsSB(external)')
    return Promise.resolve()
  }

  return backgroundTask(c, loadSupabaseStatsWriters().then(sb => sb.trackLogsSB(c, app_id, lowerDeviceId, action, finalVersionName, finalMetadata)))
}

export function createStatsLogs(c: Context, app_id: string, device_id: string, action: Database['public']['Enums']['stats_action'], versionName?: string, metadata?: StatsMetadata, dimensions?: StatsLogDimensions) {
  const lowerDeviceId = device_id
  const finalVersionName = versionName && versionName !== '' ? versionName : 'unknown'
  const finalMetadata = normalizeStatsMetadata(metadata)
  if (c.env.APP_LOG)
    return trackLogsCF(c, app_id, lowerDeviceId, action, finalVersionName, finalMetadata, dimensions)

  if (shouldSkipSupabaseStatsFallback(c)) {
    logSkippedSupabaseWrite(c, 'trackLogsSB')
    return Promise.resolve()
  }

  return backgroundTask(c, loadSupabaseStatsWriters().then(sb => sb.trackLogsSB(c, app_id, lowerDeviceId, action, finalVersionName, finalMetadata)))
}

export function createStatsDevices(c: Context, device: DeviceWithoutCreatedAt) {
  const requestCountry = c.req.raw?.cf?.country
  const countryCode = normalizeDeviceCountryCode(typeof requestCountry === 'string' ? requestCountry : undefined)
  const deviceWithCountry = countryCode ? { ...device, country_code: countryCode } : device

  if (getRuntimeKey() === 'workerd' && c.env.DEVICE_INFO)
    return backgroundTask(c, trackDevicesCF(c, deviceWithCountry))

  if (shouldSkipSupabaseStatsFallback(c)) {
    logSkippedSupabaseWrite(c, 'trackDevicesSB')
    return Promise.resolve()
  }

  return backgroundTask(c, loadSupabaseStatsWriters().then(sb => sb.trackDevicesSB(c, deviceWithCountry)))
}

export function sendStatsAndDevice(c: Context, device: DeviceWithoutCreatedAt, statsActions: StatsActions[], isFailedStat = false) {
  const dimensions = getStatsLogDimensions(c, device)
  const jobs = []
  statsActions.forEach(({ action, versionName, metadata }) => {
    jobs.push(createStatsLogs(c, device.app_id, device.device_id, action, versionName ?? device.version_name, metadata, dimensions))
  })

  if (!isFailedStat)
    jobs.push(createStatsDevices(c, device))

  return Promise.all(jobs)
}
