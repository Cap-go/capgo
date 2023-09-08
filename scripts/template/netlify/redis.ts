import { Redis } from 'ioredis'
import { getEnv } from './getEnv'

// upper is ignored during netlify generation phase
// import from here
export async function getRedis() {
  const redisEnv = getEnv('REDIS_URL')
  if (!redisEnv) {
    console.error('[redis] REDIS_URL is not set')
    return undefined
  }

  try {
    const redis = new Redis(redisEnv)
    return redis
  }
  catch (e) {
    console.error('[redis] Could not connect to redis', e)
    return undefined
  }
}
