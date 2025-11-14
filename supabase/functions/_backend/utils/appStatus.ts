import type { Context } from 'hono'
import { CacheHelper } from './cache.ts'
import { backgroundTask } from './utils.ts'

const APP_STATUS_CACHE_PATH = '/.app-status'
const APP_STATUS_CACHE_TTL_SECONDS = 900

export type AppStatus = 'cloud' | 'onprem'

function buildAppStatusRequest(c: Context, appId: string) {
  const helper = new CacheHelper(c)
  if (!helper.available)
    return null
  return {
    helper,
    request: helper.buildRequest(APP_STATUS_CACHE_PATH, { app_id: appId }),
  }
}

export async function getAppStatus(c: Context, appId: string): Promise<AppStatus | null> {
  const cacheEntry = buildAppStatusRequest(c, appId)
  if (!cacheEntry)
    return null
  const payload = await cacheEntry.helper.matchJson<{ status: AppStatus }>(cacheEntry.request)
  if (!payload)
    return null
  return payload.status
}

export function setAppStatus(c: Context, appId: string, status: AppStatus) {
  return backgroundTask(c, async () => {
    const cacheEntry = buildAppStatusRequest(c, appId)
    if (!cacheEntry)
      return
    await cacheEntry.helper.putJson(cacheEntry.request, { status }, APP_STATUS_CACHE_TTL_SECONDS)
  })
}
