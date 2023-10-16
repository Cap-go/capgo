import { connect, parseURL } from 'https://deno.land/x/redis@v0.24.0/mod.ts'
import { Redis as RedisUpstash } from 'https://deno.land/x/upstash_redis@v1.22.0/mod.ts'
import { getEnv } from '../../../supabase/functions/_utils/utils.ts'
import { RedisRedis } from '../../../supabase/functions/_utils/redis.ts'

type RedisValue = string | number | Uint8Array

interface RedisInterface {
  hdel(key: string, ...fields: string[]): Promise<number>
  pipeline(): RedisPipelineInterface
  tx(): RedisPipelineInterface
  hscan(key: string, cursor: number, opts?: { pattern: string; count: number }): Promise<[string, string[]]>
  hset(key: string, field: string, value: RedisValue): Promise<void>
  hmget(key: string, ...fields: string[]): Promise<(string | undefined)[]>
}

interface RedisPipelineInterface {
  hdel(key: string, ...fields: string[]): Promise<number>
  hset(key: string, field: string, value: RedisValue): Promise<void>
  flush(): Promise<void>
}

// upper is ignored during netlify generation phase
// import from here
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
