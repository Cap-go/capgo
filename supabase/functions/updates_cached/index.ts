import { Hono } from 'https://deno.land/x/hono@v3.5.4/mod.ts'
import { z } from 'https://deno.land/x/zod@v3.22.2/mod.ts'
import { serve } from 'https://deno.land/std@0.199.0/http/server.ts'
import { getRedis } from '../_utils/redis.ts'

const UPDATE_FUNCTION = 'http://0.0.0.0:8081/updates'
const APP_DOES_NOT_EXIST = '{"message":"App not found","error":"app_not_found"}'
const APP_VERSION_NO_NEW = '{"message":"No new version available"}'
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
  '/updates_cached',
  async (c) => {
    // We do this like this becouse we need both text and json, and json object -> text would be wasteful
    const body = c.req.raw.body
    if (!body)
      return new Response(JSON.stringify({ error: 'No body' }), { status: 400 })

    const { json, text } = await toJSON(c.req.raw.body!.getReader())

    const parseResult = jsonRequestSchema.passthrough().safeParse(json)
    if (!parseResult.success)
      return new Response(JSON.stringify({ error: `Cannot parse json: ${parseResult.error}` }), { status: 400 })

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

    console.log(cachedApp)

    // Here we know that the requested app does not exist, cache
    if (!appExists && inCache) {
      console.log('Cached - does not exist')
      return new Response(APP_DOES_NOT_EXIST, { status: 200 })
    }

    if (inCache && deviceExists && device === 'standard' && cachedVersionExists) {
      console.log('Cached - cache sucessful')
      if (cachedVersion === CACHE_NO_NEW_VAL)
        return new Response(APP_VERSION_NO_NEW, { status: 200 })
      else
        return new Response(cachedVersion, { status: 200 })
    }

    const headers = c.req.headers

    let res
    try {
      res = await fetchWithTimeout(UPDATE_FUNCTION, {
        method: 'POST',
        headers,
        body: text,
      })
    }
    catch (err) {
      console.log(`Fetch error: ${err}`)
      return new Response(JSON.stringify({ error: err }), { status: 500 })
    }

    // We do this as heades do not have any way to dynamicly get them
    const headersObj: { [key: string]: string } = {}
    res.headers.forEach((value, key) => {
      headersObj[key] = value
    })

    // Here we have the response, let's check headers
    const parseHeadersResult = headersSchema.passthrough().safeParse(headersObj)
    if (!parseHeadersResult.success) {
      // Do not return what failed, as it might leak some information
      console.log(parseHeadersResult.error)
      return new Response(JSON.stringify({ error: 'Cannot parse response headers' }), { status: 500 })
    }

    const { 'x-update-status': updateStatus, 'x-update-overwritten': updateOverwritten } = parseHeadersResult.data
    console.log(parseHeadersResult.data)

    // We do not cache fails
    if (updateStatus === 'fail')
      return res

    const tx = redis.tx()

    // Device does not exist in cache
    if (!deviceExists)
      tx.hset(appCacheKey, deviceCacheKey, updateOverwritten ? 'overwritten' : 'standard')

    if (!inCache)
      tx.hset(appCacheKey, 'exist', (updateStatus !== 'app_not_found').toString())

    if (!cachedVersionExists && !updateOverwritten)
      tx.hset(appCacheKey, versionCacheKey, (updateStatus !== 'no_new') ? await res.clone().text() : CACHE_NO_NEW_VAL)

    await tx.flush()

    const responseText = await res.clone().text()
    console.log(`resp text: ${responseText}`)

    return res
  },
)

async function fetchWithTimeout(resource: string, options: any) {
  const { timeout = 5000 } = options

  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), timeout)
  const response = await fetch(resource, {
    ...options,
    signal: controller.signal,
  })
  clearTimeout(id)
  return response
}

async function toJSON(body: ReadableStreamDefaultReader<any>) {
  const reader = body
  const decoder = new TextDecoder()
  const chunks = [] as string[]

  async function read(): Promise<{ text: string; json: any }> {
    const { done, value } = await reader.read()

    if (done) {
      const text = chunks.join('')
      return { text, json: JSON.parse(text) }
    }

    const chunk = decoder.decode(value, { stream: true })
    chunks.push(chunk)
    return read()
  }

  return read()
}

serve(app.fetch)
