import { serve } from 'https://deno.land/std@0.167.0/http/server.ts'
import type { UpdatePayload } from '../_utils/supabase.ts'
import { supabaseAdmin, updateOrAppStats } from '../_utils/supabase.ts'
import type { Database } from '../_utils/supabase.types.ts'
import { sendRes } from '../_utils/utils.ts'

// Generate a v4 UUID. For this we use the browser standard `crypto.randomUUID`
// function.
serve(async (event: Request) => {
  const API_SECRET = Deno.env.get('API_SECRET')
  const authorizationSecret = event.headers.get('apisecret')
  if (!authorizationSecret || !API_SECRET || authorizationSecret !== API_SECRET)
    return sendRes({ message: 'Fail Authorization' }, 400)

  try {
    const table: keyof Database['public']['Tables'] = 'app_versions'
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

    if (!record.app_id || !record.user_id) {
      console.log('no app_id or user_id')
      return sendRes()
    }
    if (!record.bucket_id) {
      console.log('no bucket_id')
      return sendRes()
    }
    if (record.deleted === body.old_record.deleted) {
      console.log('Update but not deleted')
      return sendRes()
    }

    const { data, error: dbError } = await supabaseAdmin()
      .from('app_versions_meta')
      .select()
      .eq('id', record.id)
      .single()
    if (dbError || !data) {
      console.log('Cannot find version meta', record.id)
      return sendRes()
    }

    const today_id = new Date().toISOString().slice(0, 10)
    const increment: Database['public']['Functions']['increment_stats']['Args'] = {
      app_id: record.app_id,
      date_id: today_id,
      bandwidth: 0,
      mlu: 0,
      mlu_real: 0,
      devices: 0,
      // devices_real: 0,
      version_size: -data.size,
      channels: 0,
      shared: 0,
      versions: -1,
    }
    await updateOrAppStats(increment, today_id, record.user_id)
    // set app_versions_meta versionSize = 0
    await supabaseAdmin()
      .from('app_versions_meta')
      .update({ size: 0 })
      .eq('id', record.id)
    return sendRes()
  }
  catch (e) {
    return sendRes({
      status: 'Error unknow',
      error: JSON.stringify(e),
    }, 500)
  }
})
