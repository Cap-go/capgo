import { serve } from 'https://deno.land/std@0.179.0/http/server.ts'
import { supabaseAdmin } from '../_utils/supabase.ts'
import type { Database } from '../_utils/supabase.types.ts'
import { checkKey, sendRes } from '../_utils/utils.ts'

interface dataDemo {
  app_id: string
  name: string
  icon: string
  iconType: string
}

serve(async (event: Request) => {
  const apikey_string = event.headers.get('authorization')
  if (!apikey_string)
    return sendRes({ status: 'Missing apikey' }, 400)

  const apikey: Database['public']['Tables']['apikeys']['Row'] | null = await checkKey(apikey_string, supabaseAdmin(), ['all', 'write'])
  if (!apikey)
    return sendRes({ status: 'Missing apikey' }, 400)

  try {
    const body = (await event.json()) as dataDemo
    console.log('body', body)
    return sendRes()
  }
  catch (e) {
    return sendRes({
      status: 'Error unknow',
      error: JSON.stringify(e),
    }, 500)
  }
})
