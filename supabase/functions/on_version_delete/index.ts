import { serve } from 'https://deno.land/std@0.200.0/http/server.ts'
import type { DeletePayload } from '../_utils/supabase.ts'
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
    const table: keyof Database['public']['Tables'] = 'app_versions'
    const body = (await event.json()) as DeletePayload<typeof table>
    if (body.table !== table) {
      console.log(`Not ${table}`)
      return sendRes({ message: `Not ${table}` }, 200)
    }
    if (body.type !== 'DELETE') {
      console.log('Not UPDATE')
      return sendRes({ message: 'Not UPDATE' }, 200)
    }
    const record = body.old_record
    console.log('record', record)

    if (!record.app_id || !record.user_id) {
      console.log('no app_id or user_id')
      return sendRes()
    }
    if (!record.bucket_id) {
      console.log('no bucket_id')
      return sendRes()
    }
    return sendRes()
  }
  catch (e) {
    return sendRes({
      status: 'Error unknow',
      error: JSON.stringify(e),
    }, 500)
  }
})
