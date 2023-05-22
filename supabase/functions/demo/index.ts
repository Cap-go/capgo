import { serve } from 'https://deno.land/std@0.188.0/http/server.ts'
import { supabaseAdmin } from '../_utils/supabase.ts'
import type { Database } from '../_utils/supabase.types.ts'
import { checkKey, methodJson, sendRes } from '../_utils/utils.ts'
import type { BaseHeaders } from '../_utils/types.ts'

interface dataDemo {
  app_id: string
  name: string
  icon: string
  iconType: string
}

async function main(url: URL, headers: BaseHeaders, method: string, body: dataDemo) {
  const apikey_string = headers.authorization
  if (!apikey_string)
    return sendRes({ status: 'Missing apikey' }, 400)

  const apikey: Database['public']['Tables']['apikeys']['Row'] | null = await checkKey(apikey_string, supabaseAdmin(), ['all', 'write'])
  if (!apikey)
    return sendRes({ status: 'Missing apikey' }, 400)

  try {
    console.log('body', body)
    return sendRes()
  }
  catch (e) {
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
