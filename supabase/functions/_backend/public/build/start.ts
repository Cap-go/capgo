import type { Context } from 'hono'
import type { Database } from '../../utils/supabase.types.ts'
import { simpleError } from '../../utils/hono.ts'
import { cloudlog, cloudlogErr } from '../../utils/logging.ts'
import { hasAppRightApikey } from '../../utils/supabase.ts'
import { getEnv } from '../../utils/utils.ts'

interface BuilderStartResponse {
  status: string
}

export async function startBuild(
  c: Context,
  jobId: string,
  appId: string,
  apikey: Database['public']['Tables']['apikeys']['Row'],
): Promise<Response> {
  cloudlog({
    requestId: c.get('requestId'),
    message: 'Start build request',
    job_id: jobId,
    app_id: appId,
    user_id: apikey.user_id,
  })

  // Security: Check if user has write access to this app
  if (!(await hasAppRightApikey(c, appId, apikey.user_id, 'write', apikey.key))) {
    cloudlogErr({
      requestId: c.get('requestId'),
      message: 'Unauthorized start build',
      job_id: jobId,
      app_id: appId,
      user_id: apikey.user_id,
    })
    throw simpleError('unauthorized', 'You do not have permission to start builds for this app')
  }

  // Call builder to start the job
  const builderResponse = await fetch(`${getEnv(c, 'BUILDER_URL')}/jobs/${jobId}/start`, {
    method: 'POST',
    headers: {
      'x-api-key': getEnv(c, 'BUILDER_API_KEY'),
    },
  })

  if (!builderResponse.ok) {
    const errorText = await builderResponse.text()
    cloudlogErr({
      requestId: c.get('requestId'),
      message: 'Builder start failed',
      job_id: jobId,
      status: builderResponse.status,
      error: errorText,
    })
    throw simpleError('builder_error', `Failed to start build: ${errorText}`)
  }

  const builderJob = await builderResponse.json() as BuilderStartResponse

  cloudlog({
    requestId: c.get('requestId'),
    message: 'Build started',
    job_id: jobId,
    status: builderJob.status,
  })

  return c.json({
    job_id: jobId,
    status: builderJob.status || 'running',
  }, 200)
}
