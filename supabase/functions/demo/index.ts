import { serve } from 'https://deno.land/std@0.160.0/http/server.ts'
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
  const apikey_string = event.headers.get('authorization')
  if (!apikey_string) {
    console.error('Missing apikey')
    return sendRes({ status: 'Missing apikey' }, 400)
  }
  const apikey: definitions['apikeys'] | null = await checkKey(apikey_string, supabaseAdmin, ['all', 'write'])
  if (!apikey) {
    console.error('Missing apikey')
    return sendRes({ status: 'Missing apikey' }, 400)
  }
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
