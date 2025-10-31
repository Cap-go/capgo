import * as BunnySDK from '@bunny.net/edgescript-sdk'
import worker from './src/worker.ts'

// Environment variables interface matching worker expectations
interface Env {
  LIBSQL_URL: string
  LIBSQL_AUTH_TOKEN: string
  PGMQ_URL: string
  WEBHOOK_SIGNATURE: string
}

// Mock ExecutionContext for Bunny environment
const mockContext: ExecutionContext = {
  waitUntil: (promise: Promise<any>) => {
    // Bunny doesn't support background tasks in the same way
    // We'll just let the promise resolve
    promise.catch(err => console.error('Background task error:', err))
  },
  passThroughOnException: () => {},
}

const listener = BunnySDK.net.tcp.unstable_new()
console.log('LibSQL Sync listening on: ', BunnySDK.net.tcp.toString(listener))

BunnySDK.net.http.serve(
  async (req: Request): Promise<Response> => {
    console.log(`[INFO]: ${req.method} - ${req.url}`)

    // Get environment variables and pass to worker
    const env: Env = {
      LIBSQL_URL: process.env.LIBSQL_URL || '',
      LIBSQL_AUTH_TOKEN: process.env.LIBSQL_AUTH_TOKEN || '',
      PGMQ_URL: process.env.PGMQ_URL || '',
      WEBHOOK_SIGNATURE: process.env.WEBHOOK_SIGNATURE || '',
    }

    // Validate required environment variables
    if (!env.LIBSQL_URL || !env.LIBSQL_AUTH_TOKEN || !env.PGMQ_URL || !env.WEBHOOK_SIGNATURE) {
      console.error('Missing required environment variables')
      return new Response('Internal Server Error: Missing configuration', { status: 500 })
    }

    try {
      return await worker.fetch(req, env, mockContext)
    } catch (error) {
      console.error('Error in worker:', error)
      return new Response('Internal Server Error', { status: 500 })
    }
  },
)
