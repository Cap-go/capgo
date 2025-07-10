import type { Context } from 'hono'
import type { Database } from '../../utils/supabase.types.ts'
import { simpleError } from '../../utils/hono.ts'
import { hasAppRightApikey, supabaseAdmin } from '../../utils/supabase.ts'
import { fetchLimit } from '../../utils/utils.ts'

interface GetDevice {
  app_id: string
  channel?: string
  page?: number
}

async function getAll(c: Context, body: GetDevice) {
  const fetchOffset = body.page ?? 0
  const from = fetchOffset * fetchLimit
  const to = (fetchOffset + 1) * fetchLimit - 1
  const { data: dataChannels, error: dbError } = await supabaseAdmin(c)
    .from('channels')
    .select(`
      id,
      created_at,
      name,
      app_id,
      created_by,
      updated_at,
      public,
      disable_auto_update_under_native,
      disable_auto_update,
      allow_device_self_set,
      allow_emulator,
      allow_dev,
      version (
        name,
        id
      )
  `)
    .eq('app_id', body.app_id)
    .range(from, to)
    .order('created_at', { ascending: true })
  if (dbError || !dataChannels) {
    throw simpleError('cannot_find_channels', 'Cannot find channels', { supabaseError: dbError })
  }
  return c.json(dataChannels.map((o) => {
    const { disable_auto_update_under_native, disable_auto_update, ...rest } = o
    return {
      ...rest,
      disableAutoUpdateUnderNative: disable_auto_update_under_native,
      disableAutoUpdate: disable_auto_update,
    }
  }))
}

async function getOne(c: Context, body: GetDevice) {
  const { data: dataChannel, error: dbError } = await supabaseAdmin(c)
    .from('channels')
    .select(`
    id,
    created_at,
    name,
    app_id,
    created_by,
    updated_at,
    public,
    disable_auto_update_under_native,
    disable_auto_update,
    allow_device_self_set,
    allow_emulator,
    public,
    version (
      name,
      id
    )
  `)
    .eq('app_id', body.app_id)
    .eq('name', body.channel!)
    .single()
  if (dbError || !dataChannel) {
    throw simpleError('cannot_find_version', 'Cannot find version', { supabaseError: dbError })
  }

  const { disable_auto_update_under_native, disable_auto_update, ...rest } = dataChannel
  const newObject = {
    ...rest,
    disableAutoUpdateUnderNative: disable_auto_update_under_native,
    disableAutoUpdate: disable_auto_update,
  }

  return c.json(newObject)
}

export async function get(c: Context, body: GetDevice, apikey: Database['public']['Tables']['apikeys']['Row']): Promise<Response> {
  if (!body.app_id || !(await hasAppRightApikey(c, body.app_id, apikey.user_id, 'read', apikey.key))) {
    throw simpleError('cannot_access_app', 'You can\'t access this app', { app_id: body.app_id })
  }

  // get one channel or all channels
  if (body.channel) {
    return getOne(c, body)
  }
  return getAll(c, body)
}
