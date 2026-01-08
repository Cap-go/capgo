import type { Context } from 'hono'
import type { Database } from '../../utils/supabase.types.ts'
import { simpleError } from '../../utils/hono.ts'
import { cloudlog, cloudlogErr } from '../../utils/logging.ts'
import { checkPermission } from '../../utils/rbac.ts'
import { supabaseAdmin } from '../../utils/supabase.ts'
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

  // Security: Check if user has permission to manage builds (auth context set by middlewareKey)
  if (!(await checkPermission(c, 'app.build_native', { appId }))) {
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
  const supabase = supabaseAdmin(c)
  const { error: updateError } = await supabase
    .from('build_requests')
    .update({
      status: 'cancelled',
      updated_at: new Date().toISOString(),
    })
    .eq('builder_job_id', jobId)

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
