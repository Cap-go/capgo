import { map } from './generated_functions_map.ts'
import OnPgChange from './on_postgres_change.ts'
import { fallback } from './fallback_loadbalancer.ts'
import { WorkerEnv } from './worker_env.d.ts'

export default {
  async fetch(request: Request, env: WorkerEnv) {
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
      else if (functionName === 'on_postgres_change') {
        const response = await OnPgChange.fetch(request, env)
        return response
      }
      else {
        console.log('falling back to old router')
        const response = await fallback(request)
        return response
      }
    }
    catch (e) {
      console.error(e)
      return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500 })
    }
  },
}
