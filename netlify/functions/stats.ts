import type { Handler } from '@netlify/functions'
import { useSupabase } from '../services/supabase'
import { sendRes } from './../services/utils'
import type { definitions } from '~/types/supabase'

interface AppStats {
  platform: string
  action: string
  device_id: string
  version_name?: string
  version: number
  version_build: string
  app_id: string
}

export const handler: Handler = async(event) => {
  if (event.httpMethod === 'OPTIONS')
    return sendRes()
  const supabase = useSupabase()
  console.log('event.body', event.body)
  const body = JSON.parse(event.body || '{}') as AppStats
  const device: definitions['devices'] = {
    platform: body.platform as definitions['stats']['platform'],
    device_id: body.device_id,
    app_id: body.app_id,
    version: -1,
    updated_at: new Date().toISOString(),
  }

  const stat: Partial<definitions['stats']> = {
    platform: body.platform as definitions['stats']['platform'],
    device_id: body.device_id,
    action: body.action,
    app_id: body.app_id,
    version_build: body.version_build,
    version: -1,
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await supabase
    .from<definitions['app_versions']>('app_versions')
    .select()
    .eq('app_id', body.app_id)
    .eq('name', body.version_name)
  if (data && data.length && !error) {
    stat.version = data[0].id
    device.version = data[0].id
  }
  else {
    return sendRes({ status: 'ko', error: error || 'version not found' }, 400)
  }
  const { data: dataDevice, error: errorDevice } = await supabase
    .from<definitions['devices']>('devices')
    .select()
    .eq('app_id', body.app_id)
    .eq('device_id', body.device_id)
  if (!dataDevice || !dataDevice.length || errorDevice) {
    await supabase
      .from<definitions['devices']>('devices')
      .insert(device)
  }
  else {
    await supabase
      .from<definitions['devices']>('devices')
      .update(device)
      .eq('app_id', body.app_id)
      .eq('device_id', body.device_id)
  }
  await supabase
    .from<definitions['stats']>('stats')
    .insert(stat)
  return sendRes()
}
