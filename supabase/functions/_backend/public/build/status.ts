import type { Context } from 'hono'
import type { Database } from '../../utils/supabase.types.ts'
import { simpleError } from '../../utils/hono.ts'
import { cloudlog, cloudlogErr } from '../../utils/logging.ts'
import { recordBuildTime, supabaseApikey } from '../../utils/supabase.ts'
import { checkPermission } from '../../utils/rbac.ts'
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

  // Security: Check if user has read access to this app (auth context set by middlewareKey)
  if (!(await checkPermission(c, 'app.read', { appId: app_id }))) {
    throw simpleError('unauthorized', 'You do not have permission to view builds for this app')
  }

  // Use authenticated client for data queries - RLS will enforce access
  const supabase = supabaseApikey(c, apikey.key)

  // Get app's org_id
  const { data: app, error: appError } = await supabase
    .from('apps')
    .select('owner_org')
    .eq('app_id', app_id)
    .single()

  if (appError || !app) {
    throw simpleError('not_found', 'App not found')
  }

  const org_id = app.owner_org

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
        platform,
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
