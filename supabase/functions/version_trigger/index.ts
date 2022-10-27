import { serve } from 'https://deno.land/std@0.161.0/http/server.ts'
import { supabaseAdmin } from '../_utils/supabase.ts'
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
    const body = (await event.json()) as { record: definitions['app_versions'] }
    const record = body.record
    console.log('record', record)
    const { error: dbError } = await supabaseAdmin
      .from<definitions['apps']>('apps')
      .update({
        last_version: record.name,
      }, { returning: 'minimal' })
      .eq('app_id', record.app_id)
      .eq('user_id', record.user_id)
    if (dbError) {
      console.log('dbError', dbError)
      return sendRes({ status: 'Error unknow', error: dbError }, 500)
    }
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
