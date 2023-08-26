import { Hono, validator } from 'https://deno.land/x/hono@v3.5.4/mod.ts'
import { z } from 'https://deno.land/x/zod@v3.22.2/mod.ts'
import { connect } from 'https://deno.land/x/redis@v0.24.0/mod.ts'
import { serve } from 'https://deno.land/std@0.199.0/http/server.ts'
import { parseRedisUrl } from '../_utils/redis.ts'

const jsonRequestSchema = z.object({
  requestType: z.discriminatedUnion('type', [
    z.object(
      {
        type: z.literal('app_versions'),
        app_id: z.string(),
      },
    ),
  ]),
})

type ParsedRequest = z.infer<typeof jsonRequestSchema>

const app = new Hono()
const redis = await connect(parseRedisUrl(Deno.env.get('REDIS_URL') ?? ''))

// This is a nice switch, allowing for multiple functionality in 1 edge fn
app.post(
  '/invalidate_cache',
  validator('json', async (value, c) => {
    const parsedBody = jsonRequestSchema.parse(value)
    if (parsedBody.requestType.type === 'app_versions')
      return await handleAppVersionInvalidate(parsedBody)

    return new Response(JSON.stringify({ error: 'Cannot parse response headers' }), { status: 500 })
  }),
)

async function handleAppVersionInvalidate(request: ParsedRequest): Promise<Response> {
  const hashCacheKey = `app_${request.requestType.app_id}`
  let cursor = 0
  const pipeline = redis.pipeline()
  let hscan: [string, string[]]

  async function callHscan() {
    console.log('hscan iter')
    hscan = await redis.hscan(hashCacheKey, cursor, { pattern: 'ver*', count: 5000 })
    cursor = parseInt(hscan[0])

    // Really?
    for (let i = 0; i < hscan[1].length; i++) {
      if (i % 2 === 1)
        continue

      console.log(`hscan del: ${hscan[1][i]}`)
      await pipeline.hdel(hashCacheKey, hscan[1][i])
    }
  }

  await callHscan()

  while (cursor !== 0)
    await callHscan()

  await pipeline.flush()

  return new Response(JSON.stringify({ error: 'TODO' }), { status: 500 })
}

serve(app.fetch)
