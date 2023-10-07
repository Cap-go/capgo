import { serve } from 'https://deno.land/std@0.199.0/http/server.ts'
import { getEnv, sendRes } from '../_utils/utils.ts'
import { redisDeviceInvalidate } from '../_utils/redis.ts'
import type { Database } from '../_utils/supabase.types.ts'
import type { DeletePayload, InsertPayload, UpdatePayload } from '../_utils/supabase.ts'

// This endpoint is called when a device is updated, created or deleted, and channel_devices or devices_override is updated
// It invalidates the device cache

serve(async (event: Request) => {
  const API_SECRET = getEnv('API_SECRET')
  const authorizationSecret = event.headers.get('apisecret')
  if (!authorizationSecret || !API_SECRET || authorizationSecret !== API_SECRET)
    return sendRes({ message: 'Fail Authorization' }, 400)

  try {
    const tableDev: keyof Database['public']['Tables'] = 'devices'
    const tableChanDev: keyof Database['public']['Tables'] = 'channel_devices'
    const tableDevOv: keyof Database['public']['Tables'] = 'devices_override'
    type TableTypes = typeof tableDev | typeof tableChanDev | typeof tableDevOv

    const body = (await event.json()) as InsertPayload<TableTypes> | UpdatePayload<TableTypes> | DeletePayload<TableTypes>

    const record = body.type !== 'DELETE' ? body.record : body.old_record

    if (!record) {
      console.log('No record')
      return sendRes({ message: 'No record' }, 200)
    }

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
        const oldVal = (oldRecord as any)[key]

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
