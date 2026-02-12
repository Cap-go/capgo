import type { Context } from 'hono'
import type { Database } from '../../utils/supabase.types.ts'
import { simpleError } from '../../utils/hono.ts'
import { cloudlog, cloudlogErr } from '../../utils/logging.ts'
import { checkPermission } from '../../utils/rbac.ts'
import { recordBuildTime, supabaseApikey } from '../../utils/supabase.ts'
import { getEnv } from '../../utils/utils.ts'

export interface BuildStatusParams {
  job_id: string
  app_id: string
  platform: 'ios' | 'android'
}

interface BuilderStatusResponse {
  job: {
    status: string
    started_at: number | null
    completed_at: number | null
    error: string | null
  }
  machine: Record<string, unknown> | null
  uploadUrl?: string
}

export async function getBuildStatus(
  c: Context,
  params: BuildStatusParams,
  apikey: Database['public']['Tables']['apikeys']['Row'],
): Promise<Response> {
  const { job_id, app_id, platform } = params

  // Use authenticated client for data queries - RLS will enforce access
  const supabase = supabaseApikey(c, apikey.key)

  // Bind job_id to app_id under RLS before calling the builder.
  // This prevents cross-app access by mixing an allowed app_id with another app's job_id.
  const { data: buildRequest, error: buildRequestError } = await supabase
    .from('build_requests')
    .select('app_id, owner_org, platform')
    .eq('builder_job_id', job_id)
    .maybeSingle()

  if (buildRequestError) {
    cloudlogErr({
      requestId: c.get('requestId'),
      message: 'Failed to fetch build_request for status',
      job_id,
      error: buildRequestError.message,
    })
    throw simpleError('internal_error', 'Failed to fetch build request')
  }

  if (!buildRequest || buildRequest.app_id !== app_id) {
    // Treat missing row and mismatched app_id as unauthorized to avoid leaking job existence.
    throw simpleError('unauthorized', 'You do not have permission to view builds for this app')
  }

  // Security: Check if user has read access to the job's app (auth context set by middlewareKey)
  if (!(await checkPermission(c, 'app.read', { appId: buildRequest.app_id }))) {
    throw simpleError('unauthorized', 'You do not have permission to view builds for this app')
  }

  const org_id = buildRequest.owner_org
  const resolvedPlatform = (buildRequest.platform === 'ios' || buildRequest.platform === 'android')
    ? buildRequest.platform
    : platform

  // Fetch status from builder
  const builderResponse = await fetch(`${getEnv(c, 'BUILDER_URL')}/jobs/${job_id}`, {
    method: 'GET',
    headers: {
      'x-api-key': getEnv(c, 'BUILDER_API_KEY'),
    },
  })

  if (!builderResponse.ok) {
    const errorText = await builderResponse.text()
    cloudlogErr({
      requestId: c.get('requestId'),
      message: 'Builder status fetch failed',
      job_id,
      status: builderResponse.status,
      error: errorText,
    })
    throw simpleError('builder_error', `Failed to get build status: ${errorText}`)
  }

  const builderJob = await builderResponse.json() as BuilderStatusResponse

  cloudlog({
    requestId: c.get('requestId'),
    message: 'Build status fetched',
    job_id,
    status: builderJob.job.status,
    started_at: builderJob.job.started_at,
    completed_at: builderJob.job.completed_at,
  })

  // Update build_requests table with current status
  const { error: updateError } = await supabase
    .from('build_requests')
    .update({
      status: builderJob.job.status,
      last_error: builderJob.job.error || null,
      updated_at: new Date().toISOString(),
    })
    .eq('builder_job_id', job_id)
    .eq('app_id', buildRequest.app_id)

  if (updateError) {
    cloudlogErr({
      requestId: c.get('requestId'),
      message: 'Failed to update build_requests status',
      job_id,
      error: updateError.message,
    })
  }

  // Track build time if job completed
  if (builderJob.job.started_at && builderJob.job.completed_at) {
    const buildTimeSeconds = Math.floor((builderJob.job.completed_at - builderJob.job.started_at) / 1000)

    // Record build time in tracking system (only once per build)
    if (builderJob.job.status === 'succeeded' || builderJob.job.status === 'failed') {
      cloudlog({
        requestId: c.get('requestId'),
        message: 'Recording build time',
        job_id,
        org_id,
        build_time_seconds: buildTimeSeconds,
        platform,
      })

      await recordBuildTime(
        c,
        org_id,
        apikey.user_id,
        job_id,
        resolvedPlatform,
        buildTimeSeconds,
      )
    }
  }

  return c.json({
    job_id,
    status: builderJob.job.status,
    machine: builderJob.machine || null,
    started_at: builderJob.job.started_at,
    completed_at: builderJob.job.completed_at,
    build_time_seconds: builderJob.job.started_at && builderJob.job.completed_at
      ? Math.floor((builderJob.job.completed_at - builderJob.job.started_at) / 1000)
      : null,
    error: builderJob.job.error || null,
    upload_url: builderJob.uploadUrl || null,
  }, 200)
}
