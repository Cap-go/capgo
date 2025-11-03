import type { Context } from 'hono'
import type { Database } from '../../utils/supabase.types.ts'
import { simpleError } from '../../utils/hono.ts'
import { hasAppRightApikey } from '../../utils/supabase.ts'
import { getEnv } from '../../utils/utils.ts'

export async function streamBuildLogs(
  c: Context,
  jobId: string,
  appId: string,
  apikey: Database['public']['Tables']['apikeys']['Row'],
): Promise<Response> {
  // Security: Check if user has read access to this app
  if (!(await hasAppRightApikey(c, appId, apikey.user_id, 'read', apikey.key))) {
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
    throw simpleError('builder_error', `Failed to get build logs: ${errorText}`)
  }

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
