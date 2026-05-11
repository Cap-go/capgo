import type { Context } from 'hono'
import type { Database } from '../../utils/supabase.types.ts'
import type { DeviceLink } from './delete.ts'
import { cloudlog } from '../../utils/logging.ts'

type DeviceOperation = 'set' | 'get' | 'delete'

export function getDeviceRequestLogMetadata(body: Partial<DeviceLink>) {
  return {
    hasAppId: typeof body.app_id === 'string' && body.app_id.length > 0,
    hasDeviceId: typeof body.device_id === 'string' && body.device_id.length > 0,
    hasChannel: typeof body.channel === 'string' && body.channel.length > 0,
    fieldCount: Object.keys(body).length,
  }
}

export function logDeviceRequestContext(
  c: Context,
  operation: DeviceOperation,
  body: Partial<DeviceLink>,
  apikey: Database['public']['Tables']['apikeys']['Row'],
) {
  cloudlog({
    requestId: c.get('requestId'),
    message: `device ${operation} request`,
    ...getDeviceRequestLogMetadata(body),
  })
  cloudlog({
    requestId: c.get('requestId'),
    message: `device ${operation} apikey context`,
    apikeyId: apikey.id,
    userId: apikey.user_id,
    mode: apikey.mode,
  })
}
