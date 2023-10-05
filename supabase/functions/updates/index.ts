import { z } from 'https://deno.land/x/zod@v3.22.2/mod.ts'
import { serve } from 'https://deno.land/std@0.200.0/http/server.ts'

import { getRedis } from '../_utils/redis.ts'
import { update } from '../_utils/update.ts'
import { INVALID_STRING_APP_ID, INVALID_STRING_DEVICE_ID, MISSING_STRING_APP_ID, MISSING_STRING_DEVICE_ID, MISSING_STRING_VERSION_BUILD, MISSING_STRING_VERSION_NAME, 
  NON_STRING_APP_ID, NON_STRING_DEVICE_ID, NON_STRING_VERSION_BUILD, NON_STRING_VERSION_NAME, deviceIdRegex, methodJson, reverseDomainRegex, sendRes, sendResText } from '../_utils/utils.ts'
import type { AppInfos, BaseHeaders } from '../_utils/types.ts'

const APP_DOES_NOT_EXIST = { message: 'App not found', error: 'app_not_found' }
const APP_VERSION_NO_NEW = { message: 'No new version available' }
const CACHE_NO_NEW_VAL = 'NO_NEW'

export const jsonRequestSchema = z.object({
  app_id: z.string({
    required_error: MISSING_STRING_APP_ID,
    invalid_type_error: NON_STRING_APP_ID,
  }),
  device_id: z.string({
    required_error: MISSING_STRING_DEVICE_ID,
    invalid_type_error: NON_STRING_DEVICE_ID,
  }).max(36),
  version_name: z.string({
    required_error: MISSING_STRING_VERSION_NAME,
    invalid_type_error: NON_STRING_VERSION_NAME,
  }),
  version_build: z.string({
    required_error: MISSING_STRING_VERSION_BUILD,
    invalid_type_error: NON_STRING_VERSION_BUILD,
  }),
  is_emulator: z.boolean().default(false),
  is_prod: z.boolean().default(true),
}).refine(data => reverseDomainRegex.test(data.app_id), {
  message: INVALID_STRING_APP_ID,
}).refine(data => deviceIdRegex.test(data.device_id), {
  message: INVALID_STRING_DEVICE_ID,
}).transform((val) => {
  if (val.version_name === 'builtin')
    val.version_name = val.version_build

  return val
})

const headersSchema = z.object({
  'x-update-status': z.enum(['app_not_found', 'no_new', 'new_version', 'fail']),
  'x-update-overwritten': z.preprocess(val => val === 'true', z.boolean()),
})

const bypassRedis = false

async function main(_url: URL, _headers: BaseHeaders, _method: string, body: AppInfos) {
  const parseResult = jsonRequestSchema.safeParse(body)
  if (!parseResult.success)
    return sendRes({ error: `Cannot parse json: ${parseResult.error}` }, 400)
  // const redis = null
  const redis = await getRedis()

  if (!redis || bypassRedis) {
    console.log('[redis] cannot get redis')
    return update(body)
  }

  const {
    device_id: deviceId,
    version_name: versionName,
    app_id: appId,
    is_emulator: isEmulator,
    is_prod: isProd,
  } = parseResult.data

  // if (appId !== 'com.kick.mobile') {
  //   console.log('[Cache] ignored cache')
  //   return update(body)
  // }
  const appCacheKey = `app_${appId}`
  const deviceCacheKey = `device_${deviceId}`
  const versionCacheKey = `ver_${versionName}`

  const cachedApp = await redis.hmget(appCacheKey, 'exist', deviceCacheKey, versionCacheKey)
  const inCache = cachedApp[0] !== undefined
  const appExists = cachedApp[0] === 'true'
  const device = cachedApp[1]
  const deviceExists = device !== undefined
  const cachedVersion = cachedApp[2]
  const cachedVersionExists = cachedApp[2] !== undefined

  // Here we know that the requested app does not exist, cache
  if (!appExists && inCache) {
    console.log('[redis] Cached - does not exist')
    return sendRes(APP_DOES_NOT_EXIST)
  }

  if (inCache && deviceExists && device === 'standard' && cachedVersionExists && cachedVersion && !isEmulator && isProd) {
    console.log('[redis] Cached - cache sucessful')
    if (cachedVersion === CACHE_NO_NEW_VAL)
      return sendRes(APP_VERSION_NO_NEW)
    else
      return sendResText(cachedVersion)
  }

  let res
  try {
    res = await updateWithTimeout(body)
  }
  catch (err) {
    console.log(`[redis] update error: ${err}`)
    return sendRes({ error: err }, 500)
  }

  // We do this as heades do not have any way to dynamicly get them
  const headersObj = Object.fromEntries(res.headers.entries())

  // Here we have the response, let's check headers
  const parseHeadersResult = headersSchema.passthrough().safeParse(headersObj)
  if (!parseHeadersResult.success) {
    // Do not return what failed, as it might leak some information
    console.log(parseHeadersResult.error)
    return sendRes({ error: 'Cannot parse response headers' }, 500)
  }

  const { 'x-update-status': updateStatus, 'x-update-overwritten': updateOverwritten } = parseHeadersResult.data
  console.log(parseHeadersResult.data)

  // We do not cache fails
  if (updateStatus === 'fail') {
    console.log('[redis] Update failed, not caching')
    return res
  }

  const tx = redis.tx()

  // Device does not exist in cache
  if (!deviceExists)
    tx.hset(appCacheKey, deviceCacheKey, updateOverwritten ? 'overwritten' : 'standard')

  if (!inCache)
    tx.hset(appCacheKey, 'exist', (updateStatus !== 'app_not_found').toString())

  if (!cachedVersionExists && !updateOverwritten && !isEmulator && isProd)
    tx.hset(appCacheKey, versionCacheKey, (updateStatus !== 'no_new') ? await res.clone().text() : CACHE_NO_NEW_VAL)

  await tx.flush()

  console.log('[redis] Update successful, cached')
  return res
}

async function updateWithTimeout(request: AppInfos): Promise<Response> {
  function wait(ms: number) {
    return new Promise((resolve, _reject) => {
      setTimeout(resolve, ms, 'TIMED_OUT')
    })
  }

  const result = await Promise.race([update(request), wait(5000)])
  if (typeof result === 'string')
    throw new Error('Update timed out')

  return result as Response
}

serve(async (event: Request) => {
  try {
    const url: URL = new URL(event.url)
    const headers: BaseHeaders = Object.fromEntries(event.headers.entries())
    const method: string = event.method
    const body: any = methodJson.includes(method) ? await event.json() : Object.fromEntries(url.searchParams.entries())
    return main(url, headers, method, body)
  }
  catch (e) {
    return sendRes({ status: 'Error', error: JSON.stringify(e) }, 500)
  }
})
