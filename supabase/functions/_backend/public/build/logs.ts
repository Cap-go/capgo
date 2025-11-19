import type { Context } from 'hono'
import type { Database } from '../../utils/supabase.types.ts'
import { simpleError } from '../../utils/hono.ts'
import { cloudlog, cloudlogErr } from '../../utils/logging.ts'
import { hasAppRightApikey } from '../../utils/supabase.ts'
import { getEnv } from '../../utils/utils.ts'

export async function streamBuildLogs(
  c: Context,
  jobId: string,
  appId: string,
  apikey: Database['public']['Tables']['apikeys']['Row'],
): Promise<Response> {
  cloudlog({
    requestId: c.get('requestId'),
    message: 'Build logs stream request',
    job_id: jobId,
    app_id: appId,
    user_id: apikey.user_id,
  })

  // Security: Check if user has read access to this app
  if (!(await hasAppRightApikey(c, appId, apikey.user_id, 'read', apikey.key))) {
    cloudlogErr({
      requestId: c.get('requestId'),
      message: 'Unauthorized logs request',
      job_id: jobId,
      app_id: appId,
      user_id: apikey.user_id,
    })
    throw simpleError('unauthorized', 'You do not have permission to view logs for this app')
  }

  // Proxy SSE stream from builder.capgo.app
  const builderResponse = await fetch(`${getEnv(c, 'BUILDER_URL')}/jobs/${jobId}/logs`, {
    method: 'GET',
    headers: {
      'x-api-key': getEnv(c, 'BUILDER_API_KEY'),
    },
  })

  if (!builderResponse.ok) {
    const errorText = await builderResponse.text()
    cloudlogErr({
      requestId: c.get('requestId'),
      message: 'Builder logs fetch failed',
      job_id: jobId,
      status: builderResponse.status,
      error: errorText,
    })
    throw simpleError('builder_error', `Failed to get build logs: ${errorText}`)
  }

  cloudlog({
    requestId: c.get('requestId'),
    message: 'Streaming build logs',
    job_id: jobId,
  })

  // Return the SSE stream directly
  return new Response(builderResponse.body, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}
