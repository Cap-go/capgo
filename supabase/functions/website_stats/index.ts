import { serve } from 'https://deno.land/std@0.199.0/http/server.ts'
import { methodJson, sendRes } from '../_utils/utils.ts'
import { supabaseAdmin } from '../_utils/supabase.ts'
import type { AppStats, BaseHeaders } from '../_utils/types.ts'

async function main(url: URL, headers: BaseHeaders, method: string, body: AppStats) {
  try {
    console.log('body', body)
    const date_id = new Date().toISOString().slice(0, 10)
    const { data, error } = await supabaseAdmin()
      .from('global_stats')
      .select()
      .eq('date_id', date_id)
      .single()
    if (data && !error)
      return sendRes(data)
    console.log('Supabase error:', error)
    return sendRes({
      apps: 190,
      updates: 130000,
      stars: 125,
    })
  }
  catch (e) {
    console.log('Error:', e)
    return sendRes({
      status: 'Error unknow',
      error: JSON.stringify(e),
    }, 500)
  }
}

serve(async (event: Request) => {
  try {
    const url: URL = new URL(event.url)
    const headers: BaseHeaders = Object.fromEntries(event.headers.entries())
    const method: string = event.method
    const body: any = methodJson.includes(method) ? await event.json() : Object.fromEntries(url.searchParams.entries())
    return main(url, headers, method, body)
  }
  catch (e) {
    return sendRes({ status: 'Error', error: JSON.stringify(e) }, 500)
  }
})
