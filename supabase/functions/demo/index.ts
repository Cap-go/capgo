import { serve } from 'https://deno.land/std@0.147.0/http/server.ts'
import { supabaseAdmin } from '../_utils/supabase.ts'
import type { definitions } from '../_utils/types_supabase.ts'
import { checkKey, sendRes } from '../_utils/utils.ts'

interface dataDemo {
  appid: string
  name: string
  icon: string
  iconType: string
}

serve(async (event: Request) => {
  const supabase = supabaseAdmin
  const apikey_string = event.headers.get('apikey')
  if (!apikey_string)
    return sendRes({ status: 'Cannot find authorization' }, 400)
  const apikey: definitions['apikeys'] | null = await checkKey(apikey_string, supabase, ['upload', 'all', 'write'])
  if (!apikey || !event.body)
    return sendRes({ status: 'Cannot Verify User' }, 400)
  try {
    const body = (await event.json()) as dataDemo
    console.log('body', body)
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
