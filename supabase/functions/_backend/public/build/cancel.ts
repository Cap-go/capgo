import type { Context } from 'hono'
import type { Database } from '../../utils/supabase.types.ts'
import { simpleError } from '../../utils/hono.ts'
import { cloudlog, cloudlogErr } from '../../utils/logging.ts'
import { checkPermission } from '../../utils/rbac.ts'
import { supabaseApikey } from '../../utils/supabase.ts'
import { getEnv } from '../../utils/utils.ts'

export async function cancelBuild(
  c: Context,
  jobId: string,
  appId: string,
  apikey: Database['public']['Tables']['apikeys']['Row'],
): Promise<Response> {
  cloudlog({
    requestId: c.get('requestId'),
    message: 'Cancel build request',
    job_id: jobId,
    app_id: appId,
    user_id: apikey.user_id,
  })

  // Bind jobId to appId under RLS before calling the builder.
  // This prevents cross-app access by mixing an allowed app_id with another app's jobId.
  const supabase = supabaseApikey(c, apikey.key)
  const { data: buildRequest, error: buildRequestError } = await supabase
    .from('build_requests')
    .select('app_id')
    .eq('builder_job_id', jobId)
    .maybeSingle()

  if (buildRequestError) {
    cloudlogErr({
      requestId: c.get('requestId'),
      message: 'Failed to fetch build_request for cancel build',
      job_id: jobId,
      error: buildRequestError.message,
    })
    throw simpleError('internal_error', 'Failed to fetch build request')
  }

  if (!buildRequest || buildRequest.app_id !== appId) {
    throw simpleError('unauthorized', 'You do not have permission to cancel builds for this app')
  }

  // Security: Check if user has permission to manage builds (auth context set by middlewareKey)
  if (!(await checkPermission(c, 'app.build_native', { appId: buildRequest.app_id }))) {
    cloudlogErr({
      requestId: c.get('requestId'),
      message: 'Unauthorized cancel build',
      job_id: jobId,
      app_id: appId,
      user_id: apikey.user_id,
    })
    throw simpleError('unauthorized', 'You do not have permission to cancel builds for this app')
  }

  // Call builder to cancel the job
  const builderResponse = await fetch(`${getEnv(c, 'BUILDER_URL')}/jobs/${jobId}/cancel`, {
    method: 'POST',
    headers: {
      'x-api-key': getEnv(c, 'BUILDER_API_KEY'),
    },
  })

  if (!builderResponse.ok) {
    const errorText = await builderResponse.text()
    cloudlogErr({
      requestId: c.get('requestId'),
      message: 'Builder cancel failed',
      job_id: jobId,
      status: builderResponse.status,
      error: errorText,
    })
    throw simpleError('builder_error', `Failed to cancel build: ${errorText}`)
  }

  const builderResult = await builderResponse.json() as { jobId: string, status: string, message?: string }

  cloudlog({
    requestId: c.get('requestId'),
    message: 'Build cancelled',
    job_id: jobId,
    status: builderResult.status,
  })

  // Update build_requests status to cancelled
  // Use authenticated client for data queries - RLS will enforce access
  const { error: updateError } = await supabase
    .from('build_requests')
    .update({
      status: 'cancelled',
      updated_at: new Date().toISOString(),
    })
    .eq('builder_job_id', jobId)
    .eq('app_id', buildRequest.app_id)

  if (updateError) {
    cloudlogErr({
      requestId: c.get('requestId'),
      message: 'Failed to update build_requests status to cancelled',
      job_id: jobId,
      error: updateError.message,
    })
  }

  return c.json({
    job_id: jobId,
    status: builderResult.status,
    message: builderResult.message || 'Build cancelled',
  }, 200)
}
