import { serve } from 'https://deno.land/std@0.171.0/http/server.ts'
import type { InsertPayload } from '../_utils/supabase.ts'
import { createAppStat, supabaseAdmin } from '../_utils/supabase.ts'
import { getEnv, sendRes } from '../_utils/utils.ts'
import type { Database } from './../_utils/supabase.types.ts'

serve(async (event: Request) => {
  const API_SECRET = getEnv('API_SECRET')
  const authorizationSecret = event.headers.get('apisecret')
  if (!authorizationSecret)
    return sendRes({ status: 'Cannot find authorization secret' }, 400)

  if (!authorizationSecret || !API_SECRET || authorizationSecret !== API_SECRET)
    return sendRes({ message: 'Fail Authorization', authorizationSecret, API_SECRET }, 400)

  try {
    const table: keyof Database['public']['Tables'] = 'app_stats'
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
    // explore all apps
    const month_id = new Date().toISOString().slice(0, 7)
    if (record.date_id === month_id) {
      console.log('Already updated')
      return sendRes({ message: 'Already updated' }, 200)
    }
    // check if month_id exists
    const { data: monthData } = await supabaseAdmin()
      .from('app_stats')
      .select('id')
      .eq('app_id', record.app_id)
      .eq('date_id', month_id)
      .single()
    if (monthData) {
      console.log('Already created')
      return sendRes({ message: 'Already created' }, 200)
    }
    const newData = await createAppStat(record.user_id, record.app_id, month_id)
    const { error } = await supabaseAdmin()
      .from('app_stats')
      .upsert(newData)
    if (error)
      console.error('error.message', error.message)
    return sendRes()
  }
  catch (e) {
    return sendRes({
      status: 'Error unknow',
      error: JSON.stringify(e),
    }, 500)
  }
})
