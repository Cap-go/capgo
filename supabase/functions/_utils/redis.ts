import { getEnv } from './utils.ts'
import { connect, parseURL } from 'https://deno.land/x/redis@v0.24.0/mod.ts'
import { Redis as RedisUpstash } from 'https://deno.land/x/upstash_redis/mod.ts'
import type { Redis, RedisPipeline } from 'https://deno.land/x/redis@v0.24.0/mod.ts'
import type { Pipeline as UpstashPipeline } from 'https://deno.land/x/upstash_redis@v1.22.0/pkg/pipeline.ts'

type RedisValue = string | number | Uint8Array

interface RedisInterface {
  hdel(key: string, ...fields: string[]): Promise<number>
  pipeline(): RedisPipelineInterface
  tx(): RedisPipelineInterface
  hscan(key: string, cursor: number, opts?: { pattern: string; count: number }): Promise<[string, string[]]>
  hset(key: string, field: string, value: RedisValue): Promise<void>
  hmget(key: string, ...fields: string[]): Promise<(string | null | undefined)[]>
  hincrby(key: string, field: string, increment: number): Promise<number>
  hget(key: string, field: string): Promise<string | null>
}

interface RedisPipelineInterface {
  hdel(key: string, ...fields: string[]): Promise<number>
  hset(key: string, field: string, value: RedisValue): Promise<void>
  flush(): Promise<void>
  hincrby(key: string, field: string, increment: number): Promise<number>
  hget(key: string, field: string): Promise<string | null>
}

class RedisRedisPipeline implements RedisPipelineInterface {
  pipeline: RedisPipeline

  constructor(pipeline: RedisPipeline) {
    this.pipeline = pipeline
  }

  async hdel(key: string, ...fields: string[]): Promise<number> {
    return await this.pipeline.hdel(key, ...fields)
  }

  async flush(): Promise<void> {
    await this.pipeline.flush()
  }

  async hset(key: string, field: string, value: RedisValue): Promise<void> {
    await this.pipeline.hset(key, field, value)
  }

  async hincrby(key: string, field: string, increment: number): Promise<number> {
    return await this.pipeline.hincrby(key, field, increment)
  }

  async hget(key: string, field: string): Promise<string | null> {
    return await this.pipeline.hget(key, field);
  }
}

class RedisUpstashPipeline implements RedisPipelineInterface {
  size: number
  pipeline: UpstashPipeline<[]>

  constructor(pipeline: UpstashPipeline<[]>) {
    this.pipeline = pipeline
    this.size = 0
  }

  async hdel(key: string, ...fields: string[]): Promise<number> {
    await this.pipeline.hdel(key, ...fields)
    this.size++
    return 0
  }

  async flush(): Promise<void> {
    if (this.size === 0)
      return
    await this.pipeline.exec()
  }

  async hset(key: string, field: string, value: RedisValue): Promise<void> {
    const object: { [field: string]: RedisValue } = {}
    object[field] = value
    await this.pipeline.hset(key, object)
    this.size++
  }

  async hincrby(key: string, field: string, increment: number): Promise<number> {
    await this.pipeline.hincrby(key, field, increment);
    return 0
  }

  async hget(key: string, field: string): Promise<string | null> {
    return await this.pipeline.hget(key, field);
  }
}

export class RedisRedis implements RedisInterface {
  redis: Redis

  constructor(redis: Redis) {
    this.redis = redis
  }

  async hdel(key: string, ...fields: string[]): Promise<number> {
    return await this.redis.hdel(key, ...fields)
  }

  pipeline(): RedisPipelineInterface {
    return new RedisRedisPipeline(this.redis.pipeline())
  }

  tx(): RedisPipelineInterface {
    return new RedisRedisPipeline(this.redis.tx())
  }

  async hscan(key: string, cursor: number, opts?: { pattern: string; count: number }): Promise<[string, string[]]> {
    return await this.redis.hscan(key, cursor, opts)
  }

  async hset(key: string, field: string, value: RedisValue) {
    await this.redis.hset(key, field, value)
  }

  async hmget(key: string, ...fields: string[]): Promise<(string | null | undefined)[]> {
    return await this.redis.hmget(key, ...fields)
  }

  async hincrby(key: string, field: string, increment: number): Promise<number> {
    return await this.redis.hincrby(key, field, increment);
  }

  async hget(key: string, field: string): Promise<string | null> {
    return await this.redis.hget(key, field);
  }
}

export class RedisUpstashImpl implements RedisInterface {
  redis: RedisUpstash

  constructor(redis: RedisUpstash) {
    this.redis = redis
  }

  async hdel(key: string, ...fields: string[]): Promise<number> {
    return await this.redis.hdel(key, ...fields)
  }

  async hscan(key: string, cursor: number, opts?: { pattern: string; count: number }): Promise<[string, string[]]> {
    const [resultCursor, result] = await this.redis.hscan(
      key,
      cursor,
      (opts) ? { match: opts.pattern, count: opts.count } : undefined,
    )

    return [resultCursor.toString(), result.map(res => res.toString())]
  }

  async hset(key: string, field: string, value: RedisValue) {
    await this.redis.hset(key, {
      [field]: value,
    })
  }

  async hmget(key: string, ...fields: string[]): Promise<(string | undefined)[]> {
    const res = await this.redis.hmget(key, ...fields)

    if (!res)
      return []

    return Object.values(res).map((data) => {
      if (!data)
        return undefined

      return data as string
    })
  }

  async hincrby(key: string, field: string, increment: number): Promise<number> {
    const result = await this.redis.hincrby(key, field, increment);
    return result;
  }

  async hget(key: string, field: string): Promise<string | null> {
    return await this.redis.hget(key, field);
  }

  pipeline(): RedisPipelineInterface {
    return new RedisUpstashPipeline(this.redis.pipeline())
  }

  tx = this.pipeline
}

export async function getRedis(): Promise<RedisInterface | undefined> {
  const connectionType = getEnv('REDIS_CONNECTION_TYPE')
  const redisEnv = getEnv('REDIS_URL')

  if (!redisEnv || !connectionType) {
    console.error('[redis] REDIS_URL or REDIS_CONNECTION_TYPE is not set')
    return undefined
  }

  if (connectionType.toLocaleLowerCase() === 'redis') {
    try {
      const redis = await connect(parseURL(redisEnv))
      return new RedisRedis(redis)
    }
    catch (e) {
      console.error('[redis] Could not connect to redis', e)
      return undefined
    }
  }
  else if (connectionType.toLocaleLowerCase() === 'upstash') {
    const token = getEnv('REDIS_TOKEN')

    if (!token) {
      console.error('[redis] REDIS_TOKEN is not set')
      return undefined
    }

    try {
      const redis = new RedisUpstash({
        url: redisEnv,
        token,
        automaticDeserialization: false,
      })

      return new RedisUpstashImpl(redis)
    }
    catch (e) {
      console.error('[redis] Could not connect to upstash', e)
      return undefined
    }
  }
  else {
    console.error('[redis] Invalid connection type', connectionType)
    return undefined
  }
}

export async function redisAppVersionInvalidate(app_id: string) {
  const redis = await getRedis()
  if (!redis)
    return

  console.log(`[redis] redisAppVersionInvalidate: ${app_id}`)
  const hashCacheKey = `app_${app_id}`
  let cursor = 0
  const pipeline = redis.pipeline()
  let hscan: [string, string[]]

  async function callHscan(redis: RedisInterface) {
    hscan = await redis.hscan(hashCacheKey, cursor, { pattern: 'ver*', count: 5000 })
    cursor = Number.parseInt(hscan[0])

    // Really?
    for (let i = 0; i < hscan[1].length; i++) {
      console.log(`[redis] redisAppVersionInvalidateDelete: ${hscan[1][i]}`)
      await pipeline.hdel(hashCacheKey, hscan[1][i])
    }
  }

  await callHscan(redis)

  while (cursor !== 0)
    await callHscan(redis)

  await pipeline.flush()
}

export async function redisDeviceInvalidate(appId: string, deviceId: string) {
  const redis = await getRedis()
  if (!redis)
    return
  console.log(`[redis] redisDeviceInvalidate: ${appId} ${deviceId}`)
  await redis.hdel(`app_${appId}`, `device_${deviceId}`)
}
