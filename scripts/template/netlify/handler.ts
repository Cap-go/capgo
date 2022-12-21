import type { BaseHeaders } from 'supabase/functions/_utils/types'
import { methodJson } from 'supabase/functions/_utils/utils'
import type { Handler } from '@netlify/functions'
import { sendRes } from './res'

const main = async (url: URL, headers: BaseHeaders, method: string, body: any) => {
  console.log('main', url, headers, method, body)
  return sendRes()
}
// upper is ignored during netlify generation phase
// import from here
export const handler: Handler = async (event) => {
  try {
    const url: URL = new URL(event.rawUrl)
    const headers: BaseHeaders = { ...event.headers }
    const method: string = event.httpMethod
    const body: any = methodJson.includes(method) ? JSON.parse(event.body || '{}') : Object.fromEntries(url.searchParams.entries())
    return main(url, headers, method, body)
  }
  catch (e) {
    return sendRes({ status: 'Error', error: JSON.stringify(e) }, 500)
  }
}
