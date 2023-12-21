import type { BaseHeaders } from '../../../supabase/functions/_utils/types'
import { methodJson, sendRes, setEnv } from '../../../supabase/functions/_utils/utils'

function main(url: URL, headers: BaseHeaders, method: string, body: any) {
  console.log('main', url, headers, method, body)
  return sendRes()
}

// import from here

// importSetEnvHere
export default {
  async fetch(request: Request, env: any) {
    setEnv(env)

    const url: URL = new URL(request.url)
    const headers: BaseHeaders = {}
    request.headers.forEach((value, key) => {
      headers[key] = value
    })
    const method: string = request.method
    const body: any = methodJson.includes(method) ? await request.json() : Object.fromEntries(url.searchParams.entries())
    return main(url, headers, method, body)
  },
}
