import type { Context } from 'https://edge.netlify.com'
import type { BaseHeaders } from '../../../supabase/functions/_utils/types.ts'
import { methodJson, sendRes } from '../../../supabase/functions/_utils/utils.ts'

const main = (url: URL, headers: BaseHeaders, method: string, body: any) => {
  console.log('main', url, headers, method, body)
  return sendRes()
}

// upper is ignored during netlify generation phase
// import from here
export default async (request: Request, _context: Context): Promise<Response> => {
  try {
    const url: URL = new URL(request.url)
    const headers: BaseHeaders = {}
    request.headers.forEach((value, key) => {
      headers[key] = value
    })
    const method: string = request.method
    const body: any = methodJson.includes(method) ? await request.json() : Object.fromEntries(url.searchParams.entries())
    return main(url, headers, method, body)
  }
  catch (e) {
    return sendRes({ status: 'Error', error: JSON.stringify(e) }, 500)
  }
}
