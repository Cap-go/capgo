/// <reference lib="deno.ns" />

import { Hono } from 'https://deno.land/x/hono@v3.5.4/mod.ts'
import { z } from 'https://deno.land/x/zod@v3.22.2/mod.ts'
import { connect } from 'https://deno.land/x/redis@v0.24.0/mod.ts'
import type { RedisConnectOptions } from 'https://deno.land/x/redis@v0.24.0/mod.ts'
import { serve } from 'https://deno.land/std@0.199.0/http/server.ts'

const UPDATE_FUNCTION = 'http://0.0.0.0:8081/updates'

const jsonRequestSchema = z.object({
  device_id: z.string(),
  version_name: z.string(),
})

function parseRedisUrl(url: string): RedisConnectOptions {
  url = url.replace('redis://', '')
  const splitted = url.split(':')
  if (splitted.length !== 3)
    throw new Error('Cannot parse redis url')

  const splittedPassword = splitted[1].split('@')
  if (splittedPassword.length !== 2)
    throw new Error('Cannot parse redis url (password)')

  const a = {
    hostname: splittedPassword[1],
    password: splittedPassword[0],
    port: splitted[2],
    name: splitted[0],
  }

  console.log(JSON.stringify(a))

  return a
}

const app = new Hono()
const redis = await connect(parseRedisUrl(Deno.env.get('REDIS_URL') ?? ''))

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

    const { device_id: deviceId, version_name: versionName } = parseResult.data
    const cacheKey = `${deviceId}-${versionName}`

    const cached = await redis.get(cacheKey)
    if (cached) {
      console.log('cached')
      return new Response(cached, { status: 200 })
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

    console.log(`${deviceId}-${versionName}`)

    const responseText = await res.clone().text()
    console.log(`resp text: ${responseText}`)

    await redis.set(cacheKey, responseText)

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
