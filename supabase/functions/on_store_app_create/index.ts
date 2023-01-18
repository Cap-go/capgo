import { serve } from 'https://deno.land/std@0.171.0/http/server.ts'
import axios from 'https://deno.land/x/axiod@0.26.2/mod.ts'
import type { InsertPayload } from '../_utils/supabase.ts'
import { supabaseAdmin } from '../_utils/supabase.ts'
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
    const table: keyof Database['public']['Tables'] = 'store_apps'
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
    // axios get on https://netlify.capgo.app/get_capacitor with record.appId
    const res = await axios.get(`https://netlify.capgo.app/get_capacitor/${record.appId}`)

    const { error } = await supabaseAdmin()
      .from('store_apps')
      .upsert({
        appId: record.appId,
        capacitor: res.data,
      })
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
