import { serve } from 'https://deno.land/std@0.151.0/http/server.ts'
import { sendRes } from '../_utils/utils.ts'
import { supabaseAdmin } from '../_utils/supabase.ts'
import type { definitions } from '../_utils/types_supabase.ts'

serve(async (event: Request) => {
  const url = new URL(event.url)
  console.log('url', url, url.searchParams.get('service'))
  if (url.searchParams.get('service') === 'database') {
    const { data, error } = await supabaseAdmin
      .from<definitions['apps']>('apps')
      .select()
      .eq('app_id', 'unknow.unknow')
      .single()
    if (data && !error)
      return sendRes({ status: 'ok', service: 'database' })
    console.log('db not answering as expected', error)
    return sendRes({ error: 'db not answering as expected' }, 500)
  }
  return sendRes()
})
