import { serve } from 'https://deno.land/std@0.200.0/http/server.ts'
import { getEnv, methodJson, sendRes } from '../_utils/utils.ts'
import type { BaseHeaders } from '../_utils/types.ts'

async function main(url: URL, headers: BaseHeaders, method: string, body: any) {
  return sendRes({
    supaHost: getEnv('SUPABASE_URL'),
    supbaseId: getEnv('SUPABASE_URL')?.split('//')[1].split('.')[0],
    supaKey: getEnv('SUPABASE_ANON_KEY'),
    signKey: getEnv('DEFAULT_SIGN_KEY'),
  })
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
