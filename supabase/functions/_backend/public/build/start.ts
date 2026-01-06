import type { Context } from 'hono'
import type { Database } from '../../utils/supabase.types.ts'
import { simpleError } from '../../utils/hono.ts'
import { cloudlog, cloudlogErr } from '../../utils/logging.ts'
import { hasAppRightApikey, supabaseApikey } from '../../utils/supabase.ts'
import { getEnv } from '../../utils/utils.ts'

interface BuilderStartResponse {
  status: string
}

async function markBuildAsFailed(c: Context, jobId: string, errorMessage: string, apikeyKey: string): Promise<void> {
  // Use authenticated client - RLS will enforce access
  const supabase = supabaseApikey(c, apikeyKey)
  const { error: updateError } = await supabase
    .from('build_requests')
    .update({
      status: 'failed',
      last_error: errorMessage,
      updated_at: new Date().toISOString(),
    })
    .eq('builder_job_id', jobId)

  if (updateError) {
    cloudlogErr({
      requestId: c.get('requestId'),
      message: 'Failed to update build_requests status to failed',
      job_id: jobId,
      error: updateError,
    })
  }
  else {
    cloudlog({
      requestId: c.get('requestId'),
      message: 'Marked build_request as failed',
      job_id: jobId,
      error_message: errorMessage,
    })
  }
}

export async function startBuild(
  c: Context,
  jobId: string,
  appId: string,
  apikey: Database['public']['Tables']['apikeys']['Row'],
): Promise<Response> {
  let alreadyMarkedAsFailed = false

  try {
    cloudlog({
      requestId: c.get('requestId'),
      message: 'Start build request',
      job_id: jobId,
      app_id: appId,
      user_id: apikey.user_id,
    })

    // Security: Check if user has write access to this app
    if (!(await hasAppRightApikey(c, appId, apikey.user_id, 'write', apikey.key))) {
      const errorMsg = 'You do not have permission to start builds for this app'
      cloudlogErr({
        requestId: c.get('requestId'),
        message: 'Unauthorized start build',
        job_id: jobId,
        app_id: appId,
        user_id: apikey.user_id,
      })
      await markBuildAsFailed(c, jobId, errorMsg, apikey.key)
      alreadyMarkedAsFailed = true
      throw simpleError('unauthorized', errorMsg)
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
      const errorMsg = `Failed to start build: ${errorText}`
      cloudlogErr({
        requestId: c.get('requestId'),
        message: 'Builder start failed',
        job_id: jobId,
        status: builderResponse.status,
        error: errorText,
      })

      // Update build_requests to mark as failed
      await markBuildAsFailed(c, jobId, errorMsg, apikey.key)
      alreadyMarkedAsFailed = true
      throw simpleError('builder_error', errorMsg)
    }

    const builderJob = await builderResponse.json() as BuilderStartResponse

    cloudlog({
      requestId: c.get('requestId'),
      message: 'Build started',
      job_id: jobId,
      status: builderJob.status,
    })

    // Update build_requests status to running
    // Use authenticated client - RLS will enforce access
    const supabase = supabaseApikey(c, apikey.key)
    const { error: updateError } = await supabase
      .from('build_requests')
      .update({
        status: builderJob.status || 'running',
        updated_at: new Date().toISOString(),
      })
      .eq('builder_job_id', jobId)

    if (updateError) {
      cloudlogErr({
        requestId: c.get('requestId'),
        message: 'Failed to update build_requests status to running',
        job_id: jobId,
        error: updateError.message,
      })
    }

    return c.json({
      job_id: jobId,
      status: builderJob.status || 'running',
    }, 200)
  }
  catch (error) {
    // Mark build as failed for any unexpected error (but only if not already marked)
    if (!alreadyMarkedAsFailed) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      await markBuildAsFailed(c, jobId, errorMsg, apikey.key)
    }
    throw error
  }
}
