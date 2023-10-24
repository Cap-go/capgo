import { serve } from 'https://deno.land/std@0.200.0/http/server.ts'
import { getSDashboard } from '../_utils/supabase.ts'
import { methodJson, sendOptionsRes, sendRes } from '../_utils/utils.ts'
import type { BaseHeaders } from '../_utils/types.ts'

interface dataDevice {
  userId: string
  appId?: string
  rangeStart: number
  rangeEnd: number
}

async function main(url: URL, headers: BaseHeaders, method: string, body: dataDevice) {
  try {
    console.log('body', body)
    return sendRes(await getSDashboard(headers.authorization || 'MISSING', body.userId, body.rangeStart, body.rangeEnd, body.appId))
  }
  catch (e) {
    return sendRes({
      status: 'Error unknow',
      error: JSON.stringify(e),
    }, 500)
  }
}

serve(async (event: Request) => {
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
