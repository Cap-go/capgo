import { serve } from 'https://deno.land/std@0.179.0/http/server.ts'
import { supabaseAdmin } from '../_utils/supabase.ts'
import type { Database } from '../_utils/supabase.types.ts'
import { checkKey, sendRes } from '../_utils/utils.ts'
import { getBundleUrl } from '../_utils/downloadUrl.ts'

interface dataDemo {
  app_id: string
  storage_provider: string
  bucket_id: string
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
    const url = await getBundleUrl(body.storage_provider, `apps/${apikey.user_id}/${body.app_id}/versions`, body.bucket_id)
    if (!url)
      return sendRes({ status: 'Error unknow' }, 500)
    return sendRes({ url })
  }
  catch (e) {
    return sendRes({
      status: 'Error unknow',
      error: JSON.stringify(e),
    }, 500)
  }
})
