import { Redis } from 'ioredis'
import { getEnv } from './getEnv'

let REDIS: Redis

// upper is ignored during netlify generation phase
// import from here
export async function getRedis() {
  const redisEnv = getEnv('REDIS_URL')
  if (!redisEnv) {
    console.error('[redis] REDIS_URL is not set')
    return undefined
  }

  if (!REDIS) {
    try {
      REDIS = new Redis(redisEnv)
    }
    catch (e) {
      console.error('[redis] Could not connect to redis', e)
      return undefined
    }
  }

  return REDIS
}
