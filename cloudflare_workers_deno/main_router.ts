import { map } from './generated_functions_map.ts'
import { ExecutionContext, Database } from "@cloudflare/workers-types";

// import { fallback } from './fallback_loadbalancer.ts'
// import * as d1 from './d1_facade.js'

export interface Env {
  DB: Database
}

export default {
  // deno-lint-ignore no-explicit-any
  async fetch(request: Request, env: Env) {
    try {
      const requestUrl = new URL(request.url)
      const functionName = requestUrl.pathname.split('/').pop()
      if (!functionName || functionName.length === 0)
        return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 })

      const edgeFunction = map[functionName]
      if (edgeFunction) {
        const response = edgeFunction(request, env)
        return response
      }
      // Perhaps enable this, idk
      
      // else {
      //   console.log('falling back to old router')
      //   const response = await fallback(request)
      //   return response
      // }
    }
    catch (e) {
      console.error(e)
      return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500 })
    }
  },
}
