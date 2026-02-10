import type { Context } from 'hono'
import { CacheHelper } from './cache.ts'
import { backgroundTask, isStripeConfigured } from './utils.ts'

const APP_STATUS_CACHE_PATH = '/.app-status-v2'
const APP_STATUS_CACHE_TTL_SECONDS = 60

export type AppStatus = 'cloud' | 'onprem' | 'cancelled'

export interface AppStatusPayload {
  status: AppStatus
  // Optional metadata attached to the cached app status.
  // Kept optional for backward compatibility with older cache entries.
  allow_device_custom_id?: boolean
}

function buildAppStatusRequest(c: Context, appId: string) {
  const helper = new CacheHelper(c)
  return {
    helper,
    request: helper.buildRequest(APP_STATUS_CACHE_PATH, { app_id: appId }),
  }
}

export async function getAppStatusPayload(c: Context, appId: string): Promise<AppStatusPayload | null> {
  const cacheEntry = buildAppStatusRequest(c, appId)
  if (!cacheEntry)
    return null
  const payload = await cacheEntry.helper.matchJson<AppStatusPayload>(cacheEntry.request)
  if (!payload)
    return null
  if (payload.status === 'cancelled' && !isStripeConfigured(c))
    return { ...payload, status: 'cloud' }
  return payload
}

export async function getAppStatus(c: Context, appId: string): Promise<AppStatus | null> {
  const payload = await getAppStatusPayload(c, appId)
  return payload?.status ?? null
}

export async function setAppStatus(c: Context, appId: string, status: AppStatus, payload?: Omit<AppStatusPayload, 'status'>) {
  const cacheEntry = buildAppStatusRequest(c, appId)
  if (!cacheEntry)
    return

  const write = cacheEntry.helper.putJson(
    cacheEntry.request,
    { status, ...payload },
    APP_STATUS_CACHE_TTL_SECONDS,
  )

  // Cancelled/on-prem statuses are used as DB short-circuit fast-paths.
  // Write them eagerly so the next request sees the cached state immediately.
  if (status === 'cancelled' || status === 'onprem') {
    await write
    return
  }

  // Cloud status is best-effort: avoid adding latency on the hot path.
  await backgroundTask(c, write)
}
