import { serve } from 'https://deno.land/std@0.158.0/http/server.ts'
import type { AppStatsIncrement } from '../_utils/supabase.ts'
import { supabaseAdmin, updateOrAppStats } from '../_utils/supabase.ts'
import type { definitions } from '../_utils/types_supabase.ts'
import { sendRes } from '../_utils/utils.ts'

serve(async (event: Request) => {
  const API_SECRET = Deno.env.get('API_SECRET')
  const authorizationSecret = event.headers.get('apisecret')
  if (!authorizationSecret)
    return sendRes({ status: 'Cannot find authorization secret' }, 400)
  if (!authorizationSecret || !API_SECRET || authorizationSecret !== API_SECRET) {
    console.log('Fail Authorization')
    return sendRes({ message: 'Fail Authorization' }, 400)
  }
  try {
    console.log('body')
    const body = (await event.json()) as { record: definitions['channel_users'] }
    const record = body.record

    const today_id = new Date().toISOString().slice(0, 10)
    const increment: AppStatsIncrement = {
      app_id: record.app_id,
      date_id: today_id,
      bandwidth: 0,
      mlu: 0,
      mlu_real: 0,
      devices: 0,
      version_size: 0,
      channels: 0,
      shared: 1,
      versions: 0,
    }
    const { data: dataApp } = await supabaseAdmin
      .from<definitions['apps']>('apps')
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
