// import from here
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
  try {
    const redis = await getRedis()
    if (!redis)
      return
    console.log(`[redis] redisDeviceInvalidate: ${appId} ${deviceId}`)
    await redis.hdel(`app_${appId}`, `device_${deviceId}`)
  }
  catch (e) {
    console.error('[redis] redisDeviceInvalidate', e)
  }
}