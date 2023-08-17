import { serve } from 'https://deno.land/std@0.198.0/http/server.ts'
import { supabaseAdmin } from '../_utils/supabase.ts'
import type { Database } from '../_utils/supabase.types.ts'
import { checkKey, methodJson, sendRes } from '../_utils/utils.ts'
import type { BaseHeaders } from '../_utils/types.ts'
import { r2 } from '../_utils/r2.ts'

interface dataUpload {
  bucket_id: string
  app_id: string
}

async function main(url: URL, headers: BaseHeaders, method: string, body: dataUpload) {
  const apikey_string = headers.capgkey
  if (!apikey_string)
    return sendRes({ status: 'Missing apikey' }, 400)

  const apikey: Database['public']['Tables']['apikeys']['Row'] | null = await checkKey(apikey_string, supabaseAdmin(), ['all', 'write', 'upload'])
  if (!apikey)
    return sendRes({ status: 'Missing apikey' }, 400)

  try {
    console.log('body', body, apikey.user_id)
    const filePath = `apps/${apikey.user_id}/${body.app_id}/versions/${body.bucket_id}`
    // check if app version exist
    const { error: errorVersion } = await supabaseAdmin()
      .from('app_versions')
      .select('id')
      .eq('bucket_id', body.bucket_id)
      .eq('app_id', body.app_id)
      .eq('storage_provider', 'r2-direct')
      .eq('user_id', apikey.user_id)
      .single()
    if (errorVersion) {
      console.log('errorVersion', errorVersion)
      return sendRes({ status: 'Error App or Version not found' }, 500)
    }
    const { error: errorApp } = await supabaseAdmin()
      .from('apps')
      .select('app_id')
      .eq('app_id', body.app_id)
      .eq('user_id', apikey.user_id)
      .single()
    if (errorApp)
      return sendRes({ status: 'Error App not found' }, 500)

    // check if object exist in r2
    const exist = await r2.checkIfExist(filePath)
    if (exist)
      return sendRes({ status: 'Error already exist' }, 500)
    const url = await r2.getUploadUrl(filePath)
    if (!url)
      return sendRes({ status: 'Error unknow' }, 500)
    console.log('url', filePath, url)
    return sendRes({ url })
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
