import { serve } from 'https://deno.land/std@0.167.0/http/server.ts'
import type { BaseHeaders } from '../../../supabase/functions/_utils/types.ts'
import { methodJson, sendRes } from '../../../supabase/functions/_utils/utils.ts'

const main = (url: URL, headers: BaseHeaders, method: string, body: any) => {
  console.log('main', url, headers, method, body)
  return sendRes()
}

// upper is ignored during netlify generation phase
// import from here
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
