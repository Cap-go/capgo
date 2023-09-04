import { serve } from 'https://deno.land/std@0.199.0/http/server.ts'
import { getEnv, sendRes } from '../_utils/utils.ts'
import { redisDeviceInvalidate } from '../_utils/redis.ts'

serve(async (event: Request) => {
  const API_SECRET = getEnv('API_SECRET')
  const authorizationSecret = event.headers.get('apisecret')
  if (!authorizationSecret || !API_SECRET || authorizationSecret !== API_SECRET)
    return sendRes({ message: 'Fail Authorization' }, 400)

  try {
    const body = await event.json()
    const record = body.type !== 'DELETE' ? body.record : body.old_record

    const appId: string | undefined = record.app_id
    const deviceId: string | undefined = record.device_id

    if (body.table !== 'channel_devices' && body.table !== 'devices_override' && body.table !== 'devices') {
      console.log(`Not a valid update table (${body.table})`)
      return sendRes({ message: 'Not valid table' }, 200)
    }

    if (body.type === 'UPDATE') {
      // If only updated_at changed do not remove from cache, can lead to wierd behaviour
      let continueExecution = false
      const oldRecord = body.old_record

      for (const [key, newVal] of Object.entries(record)) {
        const oldVal = oldRecord[key]

        if (oldVal !== newVal && key !== 'updated_at')
          continueExecution = true
      }

      // Only updated_at changed, do not remove from cache
      if (!continueExecution)
        return sendRes()
    }

    if (!appId || !deviceId) {
      return sendRes({
        status: 'Error',
        error: 'Invalid request, no device id or app id',
      }, 500)
    }

    await redisDeviceInvalidate(appId, deviceId)
    return sendRes()
  }
  catch (e) {
    console.log('Error', e)
    return sendRes({
      status: 'Error unknow',
      error: JSON.stringify(e),
    }, 500)
  }
})
