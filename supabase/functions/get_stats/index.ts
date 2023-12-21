import { checkAppOwner, getSStats, supabaseAdmin } from '../_utils/supabase.ts'
import { checkKey, methodJson, sendOptionsRes, sendRes } from '../_utils/utils.ts'
import type { BaseHeaders, Order } from '../_utils/types.ts'
import type { Database } from '../_utils/supabase.types.ts'

interface dataStats {
  appId: string
  devicesId?: string[]
  search?: string
  order?: Order[]
  rangeStart?: number
  rangeEnd?: number
  after?: string
}

async function main(url: URL, headers: BaseHeaders, method: string, body: dataStats) {
  try {
    console.log('body', body)
    const apikey_string = headers.capgkey
    const authorization = apikey_string || headers.authorization || 'MISSING'
    if (apikey_string) {
      const apikey: Database['public']['Tables']['apikeys']['Row'] | null = await checkKey(apikey_string, supabaseAdmin(), ['all', 'write'])
      if (!apikey)
        return sendRes({ status: 'Missing apikey' }, 400)
      if (!body.appId || !(await checkAppOwner(apikey.user_id, body.appId)))
        return sendRes({ status: 'You can\'t access this app', app_id: body.appId }, 400)
    }
    return sendRes(await getSStats(apikey_string === authorization ? '' : authorization, body.appId, body.devicesId, body.search, body.order, body.rangeStart, body.rangeEnd, body.after, true))
  }
  catch (e) {
    console.error('Error', e)
    return sendRes({
      status: 'Error unknow',
      error: JSON.stringify(e),
    }, 500)
  }
}

Deno.serve(async (event: Request) => {
  if (event.method === 'OPTIONS')
    return sendOptionsRes()
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
