import { serve } from 'https://deno.land/std@0.156.0/http/server.ts'
import type { AppStatsIncrement } from '../_utils/supabase.ts'
import { supabaseAdmin, updateOrAppStats } from '../_utils/supabase.ts'
import type { definitions } from '../_utils/types_supabase.ts'
import { sendRes } from '../_utils/utils.ts'

// Generate a v4 UUID. For this we use the browser standard `crypto.randomUUID`
// function.
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
    const body = (await event.json()) as { record: definitions['app_versions'] }
    const record = body.record

    if (record.bucket_id)
      return sendRes()

    const { data, error: dbError } = await supabaseAdmin
      .from<definitions['app_versions_meta']>('app_versions_meta')
      .select()
      .eq('id', record.id)
      .single()
    if (dbError || !data) {
      console.log('Cannot find version meta', record.id)
      return sendRes()
    }

    const today_id = new Date().toISOString().slice(0, 10)
    const increment: AppStatsIncrement = {
      app_id: record.app_id,
      date_id: today_id,
      bandwidth: 0,
      mlu: 0,
      mlu_real: 0,
      devices: 0,
      version_size: -data.size,
      channels: 0,
      shared: 0,
      versions: -1,
    }
    await updateOrAppStats(increment, today_id, record.user_id)
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
