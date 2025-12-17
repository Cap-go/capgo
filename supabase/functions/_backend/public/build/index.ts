import type { Database } from '../../utils/supabase.types.ts'
import type { RequestBuildBody } from './request.ts'
import type { BuildStatusParams } from './status.ts'
import { getBodyOrQuery, honoFactory } from '../../utils/hono.ts'
import { middlewareKey } from '../../utils/hono_middleware.ts'
import { cancelBuild } from './cancel.ts'
import { streamBuildLogs } from './logs.ts'
import { requestBuild } from './request.ts'
import { startBuild } from './start.ts'
import { getBuildStatus } from './status.ts'
import { tusProxy } from './upload.ts'

export const app = honoFactory.createApp()

// POST /build/request - Request a new native build
app.post('/request', middlewareKey(['all', 'write']), async (c) => {
  const body = await getBodyOrQuery<RequestBuildBody>(c)
  const apikey = c.get('apikey') as Database['public']['Tables']['apikeys']['Row']
  return requestBuild(c, body, apikey)
})

// POST /build/start/:jobId - Start a build after uploading bundle
app.post('/start/:jobId', middlewareKey(['all', 'write']), async (c) => {
  const jobId = c.req.param('jobId')
  const body = await getBodyOrQuery<{ app_id: string }>(c)
  if (!body.app_id) {
    throw new Error('app_id is required in request body')
  }
  const apikey = c.get('apikey') as Database['public']['Tables']['apikeys']['Row']
  return startBuild(c, jobId, body.app_id, apikey)
})

// GET /build/status - Get build status and record billing
app.get('/status', middlewareKey(['all', 'read']), async (c) => {
  const params = await getBodyOrQuery<BuildStatusParams>(c)
  const apikey = c.get('apikey') as Database['public']['Tables']['apikeys']['Row']
  return getBuildStatus(c, params, apikey)
})

// GET /build/logs/:jobId - Stream build logs (SSE, requires app_id query param)
app.get('/logs/:jobId', middlewareKey(['all', 'read']), async (c) => {
  const jobId = c.req.param('jobId')
  const appId = c.req.query('app_id')
  if (!appId) {
    throw new Error('app_id query parameter is required')
  }
  const apikey = c.get('apikey') as Database['public']['Tables']['apikeys']['Row']
  return streamBuildLogs(c, jobId, appId, apikey)
})

// POST /build/cancel/:jobId - Cancel a running build
app.post('/cancel/:jobId', middlewareKey(['all', 'write']), async (c) => {
  const jobId = c.req.param('jobId')
  const body = await getBodyOrQuery<{ app_id: string }>(c)
  if (!body.app_id) {
    throw new Error('app_id is required in request body')
  }
  const apikey = c.get('apikey') as Database['public']['Tables']['apikeys']['Row']
  return cancelBuild(c, jobId, body.app_id, apikey)
})

// TUS proxy endpoints - ALL methods proxied to builder with API key injection
// POST /build/upload/:jobId - Create TUS upload (proxied to builder)
app.post('/upload/:jobId', middlewareKey(['all', 'write']), async (c) => {
  const jobId = c.req.param('jobId')
  const apikey = c.get('apikey') as Database['public']['Tables']['apikeys']['Row']
  return tusProxy(c, jobId, apikey)
})

// HEAD /build/upload/:jobId/* - Check TUS upload progress (proxied to builder)
app.on('HEAD', '/upload/:jobId/*', middlewareKey(['all', 'write']), async (c) => {
  const jobId = c.req.param('jobId')
  const apikey = c.get('apikey') as Database['public']['Tables']['apikeys']['Row']
  return tusProxy(c, jobId, apikey)
})

// PATCH /build/upload/:jobId/* - Upload TUS chunk (proxied to builder)
app.patch('/upload/:jobId/*', middlewareKey(['all', 'write']), async (c) => {
  const jobId = c.req.param('jobId')
  const apikey = c.get('apikey') as Database['public']['Tables']['apikeys']['Row']
  return tusProxy(c, jobId, apikey)
})

// OPTIONS /build/upload/:jobId/* - TUS capabilities (proxied to builder, no auth needed)
app.options('/upload/:jobId/*', async (c) => {
  const jobId = c.req.param('jobId')
  // For OPTIONS we still need to proxy but without auth check
  const apikey = { user_id: '', key: '' } as Database['public']['Tables']['apikeys']['Row']
  return tusProxy(c, jobId, apikey)
})
