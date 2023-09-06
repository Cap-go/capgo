import { connect, parseURL } from 'https://deno.land/x/redis@v0.24.0/mod.ts'
import { getEnv } from '../../../supabase/functions/_utils/utils.ts'

// upper is ignored during netlify generation phase
// import from here
export async function getRedis() {
  const redisEnv = getEnv('REDIS_URL')
  if (!redisEnv) {
    console.error('[redis] REDIS_URL is not set')
    return undefined
  }

  try {
    const redis = await connect(parseURL(redisEnv))
    return redis
  }
  catch (e) {
    console.error('[redis] Could not connect to redis', e)
    return undefined
  }
}
