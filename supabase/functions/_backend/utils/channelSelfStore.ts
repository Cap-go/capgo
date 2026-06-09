import type { Context } from 'hono'
import type { MiddlewareKeyVariables } from './hono.ts'
import { CacheHelper } from './cache.ts'
import { cloudlogErr, serializeError } from './logging.ts'

const CHANNEL_SELF_CACHE_PATH = '/.channel-self-override-v1'
const CHANNEL_SELF_CACHE_TTL_SECONDS = 60
const CHANNEL_SELF_KV_CACHE_TTL_SECONDS = 60

// TODO: Delete this legacy channel_self KV/cache bridge once old plugin versions are no longer used. // NOSONAR
// The cache layer only exists for those old versions so channel_self writes do not hit the primary database.
export interface ChannelSelfOverride {
  app_id: string
  device_id: string
  channel_id: {
    id: number
  }
}

export interface ChannelSelfOverrideWrite {
  app_id: string
  device_id: string
  channel_id: number
}

interface ChannelSelfOverridePayload {
  app_id: string
  device_id: string
  channel_id: number
  updated_at: string
}

type ChannelSelfContext = Context<MiddlewareKeyVariables>

function getChannelSelfStore(c: ChannelSelfContext) {
  return c.env?.CHANNEL_SELF_STORE ?? null
}

function buildChannelSelfStoreKey(appId: string, deviceId: string) {
  return `channel_self:v1:${encodeURIComponent(appId)}:${encodeURIComponent(deviceId)}`
}

function buildChannelSelfCacheRequest(cache: CacheHelper, appId: string, deviceId: string) {
  return cache.buildRequest(CHANNEL_SELF_CACHE_PATH, {
    app_id: appId,
    device_id: deviceId,
  })
}

function toPayload(appId: string, deviceId: string, override: ChannelSelfOverride): ChannelSelfOverridePayload {
  return {
    app_id: appId,
    device_id: deviceId,
    channel_id: override.channel_id.id,
    updated_at: new Date().toISOString(),
  }
}

function fromPayload(appId: string, deviceId: string, payload: ChannelSelfOverridePayload | null): ChannelSelfOverride | null {
  if (
    payload?.app_id !== appId
    || payload.device_id !== deviceId
    || typeof payload.channel_id !== 'number'
  ) {
    return null
  }

  return {
    app_id: payload.app_id,
    device_id: payload.device_id,
    channel_id: {
      id: payload.channel_id,
    },
  }
}

export function isChannelSelfStoreEnabled(c: ChannelSelfContext) {
  return Boolean(getChannelSelfStore(c))
}

export async function syncChannelSelfOverride(c: ChannelSelfContext, override: ChannelSelfOverrideWrite) {
  if (!isChannelSelfStoreEnabled(c)) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Missing channel_self override store binding', app_id: override.app_id, device_id: override.device_id })
    return false
  }

  const normalizedDeviceId = override.device_id.toLowerCase()
  return setChannelSelfOverride(c, override.app_id, normalizedDeviceId, {
    app_id: override.app_id,
    device_id: normalizedDeviceId,
    channel_id: {
      id: override.channel_id,
    },
  })
}

export async function syncChannelSelfOverrideDelete(c: ChannelSelfContext, appId: string, deviceId: string) {
  if (!isChannelSelfStoreEnabled(c)) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Missing channel_self override store binding', app_id: appId, device_id: deviceId })
    return false
  }

  return deleteChannelSelfOverride(c, appId, deviceId.toLowerCase())
}

export async function getChannelSelfOverride(c: ChannelSelfContext, appId: string, deviceId: string): Promise<ChannelSelfOverride | null> {
  const store = getChannelSelfStore(c)
  if (!store)
    return null

  const cache = new CacheHelper(c)
  const cacheRequest = buildChannelSelfCacheRequest(cache, appId, deviceId)
  const cachedPayload = await cache.matchJson<ChannelSelfOverridePayload>(cacheRequest)
  const cachedOverride = fromPayload(appId, deviceId, cachedPayload)
  if (cachedOverride)
    return cachedOverride

  const key = buildChannelSelfStoreKey(appId, deviceId)
  try {
    const payload = await store.get<ChannelSelfOverridePayload>(key, {
      type: 'json',
      cacheTtl: CHANNEL_SELF_KV_CACHE_TTL_SECONDS,
    })
    const override = fromPayload(appId, deviceId, payload)
    if (override)
      await cache.putJson(cacheRequest, payload, CHANNEL_SELF_CACHE_TTL_SECONDS)
    return override
  }
  catch (error) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Error reading channel_self override store', app_id: appId, device_id: deviceId, error: serializeError(error) })
    return null
  }
}

export async function setChannelSelfOverride(c: ChannelSelfContext, appId: string, deviceId: string, override: ChannelSelfOverride) {
  const store = getChannelSelfStore(c)
  if (!store)
    return false

  const key = buildChannelSelfStoreKey(appId, deviceId)
  const payload = toPayload(appId, deviceId, override)
  try {
    await store.put(key, JSON.stringify(payload))
    const cache = new CacheHelper(c)
    await cache.putJson(buildChannelSelfCacheRequest(cache, appId, deviceId), payload, CHANNEL_SELF_CACHE_TTL_SECONDS)
    return true
  }
  catch (error) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Error writing channel_self override store', app_id: appId, device_id: deviceId, error: serializeError(error) })
    return false
  }
}

export async function deleteChannelSelfOverride(c: ChannelSelfContext, appId: string, deviceId: string) {
  const store = getChannelSelfStore(c)
  if (!store)
    return false

  const key = buildChannelSelfStoreKey(appId, deviceId)
  try {
    await store.delete(key)
    const cache = new CacheHelper(c)
    await cache.delete(buildChannelSelfCacheRequest(cache, appId, deviceId))
    return true
  }
  catch (error) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Error deleting channel_self override store', app_id: appId, device_id: deviceId, error: serializeError(error) })
    return false
  }
}
