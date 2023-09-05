import { Hono } from 'https://deno.land/x/hono@v3.5.4/mod.ts'
import { z } from 'https://deno.land/x/zod@v3.22.2/mod.ts'
import { serve } from 'https://deno.land/std@0.200.0/http/server.ts'
import { getRedis } from '../_utils/redis.ts'
import { type UpdateRequest, oldUpdate, update } from '../_utils/update.ts'
import { sendRes } from '../_utils/utils.ts'

const APP_DOES_NOT_EXIST = { message: 'App not found', error: 'app_not_found' }
const APP_VERSION_NO_NEW = { message: 'No new version available' }
const CACHE_NO_NEW_VAL = 'NO_NEW'

const jsonRequestSchema = z.object({
  device_id: z.string(),
  version_name: z.string(),
  app_id: z.string(),
})

const headersSchema = z.object({
  'x-update-status': z.enum(['app_not_found', 'no_new', 'new_version', 'fail']),
  'x-update-overwritten': z.preprocess(val => val === 'true', z.boolean()),
})

const app = new Hono()
const redis = await getRedis()

app.post(
  '/updates_redis',
  async (c) => {
    // We do this like this becouse we need both text and json, and json object -> text would be wasteful

    if (!redis) {
      console.log('[redis] cannot get redis')
      return oldUpdate(c.req.raw)
    }

    const body = c.req.raw.body
    if (!body)
      return sendRes({ error: 'No body' }, 400)

    const json = await c.req.json()

    const parseResult = jsonRequestSchema.passthrough().safeParse(json)
    if (!parseResult.success)
      return sendRes({ error: `Cannot parse json: ${parseResult.error}` }, 400)

    const { device_id: deviceId, version_name: versionName, app_id: appId } = parseResult.data
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

    if (inCache && deviceExists && device === 'standard' && cachedVersionExists) {
      console.log('[redis] Cached - cache sucessful')
      if (cachedVersion === CACHE_NO_NEW_VAL)
        return sendRes(APP_VERSION_NO_NEW)
      else
        return sendRes(cachedVersion)
    }

    let res
    try {
      res = await updateWithTimeout({
        headers: c.req.headers,
        body: json,
      })
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

    if (!cachedVersionExists && !updateOverwritten)
      tx.hset(appCacheKey, versionCacheKey, (updateStatus !== 'no_new') ? await res.clone().text() : CACHE_NO_NEW_VAL)

    await tx.flush()

    console.log('[redis] Update successful, cached')
    return res
  },
)

async function updateWithTimeout(request: UpdateRequest): Promise<Response> {
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

serve(app.fetch)
