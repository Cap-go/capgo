import { serve } from 'https://deno.land/std@0.167.0/http/server.ts'
import type { UpdatePayload } from '../_utils/supabase.ts'
import { supabaseAdmin } from '../_utils/supabase.ts'
import type { Database } from '../_utils/supabase.types.ts'
import { getEnv, sendRes } from '../_utils/utils.ts'

// Generate a v4 UUID. For this we use the browser standard `crypto.randomUUID`
// function.
serve(async (event: Request) => {
  const API_SECRET = getEnv('API_SECRET')
  const authorizationSecret = event.headers.get('apisecret')
  if (!authorizationSecret || !API_SECRET || authorizationSecret !== API_SECRET)
    return sendRes({ message: 'Fail Authorization' }, 400)

  try {
    const table: keyof Database['public']['Tables'] = 'channels'
    const body = (await event.json()) as UpdatePayload<typeof table>
    if (body.table !== table) {
      console.log(`Not ${table}`)
      return sendRes({ message: `Not ${table}` }, 200)
    }
    if (body.type !== 'UPDATE') {
      console.log('Not UPDATE')
      return sendRes({ message: 'Not UPDATE' }, 200)
    }
    const record = body.record
    console.log('record', record)

    if (record.public) {
      // find all other channels with same app_i with public true and update them to false
      await supabaseAdmin()
        .from('channels')
        .update({ public: false })
        .eq('app_id', record.app_id)
        .eq('public', true)
        .neq('id', record.id)
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
