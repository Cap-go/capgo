import { serve } from 'https://deno.land/std@0.167.0/http/server.ts'
import type { AppStatsIncrement, InsertPayload } from '../_utils/supabase.ts'
import { supabaseAdmin, updateOrAppStats } from '../_utils/supabase.ts'
import type { Database } from '../_utils/supabase.types.ts'
import { sendRes } from '../_utils/utils.ts'

serve(async (event: Request) => {
  const API_SECRET = Deno.env.get('API_SECRET')
  const authorizationSecret = event.headers.get('apisecret')
  if (!authorizationSecret || !API_SECRET || authorizationSecret !== API_SECRET) {
    console.log('Fail Authorization')
    return sendRes({ message: 'Fail Authorization' }, 400)
  }
  try {
    const table: keyof Database['public']['Tables'] = 'channels'
    const body = (await event.json()) as InsertPayload<typeof table>
    if (body.table !== table) {
      console.log(`Not ${table}`)
      return sendRes({ message: `Not ${table}` }, 200)
    }
    if (body.type !== 'INSERT') {
      console.log('Not INSERT')
      return sendRes({ message: 'Not INSERT' }, 200)
    }
    const record = body.record
    console.log('record', record)

    const today_id = new Date().toISOString().slice(0, 10)
    const increment: AppStatsIncrement = {
      app_id: record.app_id,
      date_id: today_id,
      bandwidth: 0,
      mlu: 0,
      mlu_real: 0,
      devices: 0,
      // devices_real: 0,
      version_size: 0,
      channels: 1,
      shared: 0,
      versions: 0,
    }
    const { data: dataApp } = await supabaseAdmin()
      .from('apps')
      .select()
      .eq('app_id', record.app_id)
      .single()
    if (!dataApp) {
      console.log('Cannot find app', record.app_id)
      return sendRes()
    }
    await updateOrAppStats(increment, today_id, dataApp.user_id)
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
