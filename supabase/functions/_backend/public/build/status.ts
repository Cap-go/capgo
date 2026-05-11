import type { Context } from 'hono'
import type { Database } from '../../utils/supabase.types.ts'
import {
  BUILD_TIMEOUT_STATUS,
  calculateBuildRuntimeSeconds,
  calculateRunnerWaitSeconds,
  calculateTimeoutCompletedAt,
  capBuildRuntimeSeconds,
  formatBuildTimeoutError,
  normalizeBuildTimeoutSeconds,
  shouldApplyBuildTimeout,
} from '../../utils/build_timeout.ts'
import { simpleError } from '../../utils/hono.ts'
import { cloudlog, cloudlogErr } from '../../utils/logging.ts'
import { checkPermission } from '../../utils/rbac.ts'
import { recordBuildTime, supabaseAdmin, supabaseApikey } from '../../utils/supabase.ts'
import { getEnv } from '../../utils/utils.ts'
import { formatBuilderErrorBody, readBuilderErrorBody } from './builder_response.ts'

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
    runner_wait_ms?: number | null
    error: string | null
  }
  machine: Record<string, unknown> | null
  uploadUrl?: string
}

async function cancelTimedOutBuilderJob(c: Context, jobId: string, appId: string): Promise<boolean> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 5000)
  try {
    const builderResponse = await fetch(`${getEnv(c, 'BUILDER_URL')}/jobs/${jobId}/cancel`, {
      method: 'POST',
      headers: {
        'x-api-key': getEnv(c, 'BUILDER_API_KEY'),
      },
      signal: controller.signal,
    })

    if (!builderResponse.ok) {
      const errorText = formatBuilderErrorBody(await readBuilderErrorBody(builderResponse))
      cloudlogErr({
        requestId: c.get('requestId'),
        message: 'Builder timeout cancel failed',
        job_id: jobId,
        app_id: appId,
        status: builderResponse.status,
        error: errorText,
      })
      return false
    }

    cloudlog({
      requestId: c.get('requestId'),
      message: 'Timed out build cancelled in builder',
      job_id: jobId,
      app_id: appId,
    })
    return true
  }
  catch (error) {
    cloudlogErr({
      requestId: c.get('requestId'),
      message: 'Builder timeout cancel errored',
      job_id: jobId,
      app_id: appId,
      error: error instanceof Error ? error.message : String(error),
    })
    return false
  }
  finally {
    clearTimeout(timeoutId)
  }
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

  const { data: appSettings, error: appSettingsError } = await supabase
    .from('apps')
    .select('build_timeout_seconds, build_timeout_updated_at')
    .eq('app_id', buildRequest.app_id)
    .single()

  if (appSettingsError || !appSettings) {
    cloudlogErr({
      requestId: c.get('requestId'),
      message: 'Failed to fetch app build timeout for status',
      app_id: buildRequest.app_id,
      error: appSettingsError?.message,
    })
    throw simpleError('internal_error', 'Failed to fetch app build timeout')
  }

  const org_id = buildRequest.owner_org
  const timeoutSeconds = normalizeBuildTimeoutSeconds(appSettings.build_timeout_seconds)
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
    const errorText = formatBuilderErrorBody(await readBuilderErrorBody(builderResponse))
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
  const runtimeSeconds = calculateBuildRuntimeSeconds(builderJob.job.started_at, builderJob.job.completed_at)
  const runnerWaitSeconds = calculateRunnerWaitSeconds(builderJob.job.runner_wait_ms)
  const timedOut = shouldApplyBuildTimeout(
    builderJob.job.started_at,
    builderJob.job.completed_at,
    builderJob.job.status,
    timeoutSeconds,
    appSettings.build_timeout_updated_at,
  )
  const timeoutCompletedAt = timedOut && typeof builderJob.job.started_at === 'number'
    ? calculateTimeoutCompletedAt(builderJob.job.started_at, timeoutSeconds)
    : null
  let timeoutApplied = false

  if (timedOut && builderJob.job.completed_at)
    timeoutApplied = true
  else if (timedOut)
    timeoutApplied = await cancelTimedOutBuilderJob(c, job_id, buildRequest.app_id)

  const effectiveStatus = timeoutApplied ? BUILD_TIMEOUT_STATUS : builderJob.job.status
  const effectiveError = timeoutApplied ? formatBuildTimeoutError(timeoutSeconds) : builderJob.job.error || null
  const effectiveCompletedAt = timeoutApplied ? timeoutCompletedAt : builderJob.job.completed_at
  const effectiveBuildTimeSeconds = runtimeSeconds === null
    ? null
    : timeoutApplied
      ? capBuildRuntimeSeconds(runtimeSeconds, timeoutSeconds)
      : runtimeSeconds

  cloudlog({
    requestId: c.get('requestId'),
    message: 'Build status fetched',
    job_id,
    status: effectiveStatus,
    builder_status: builderJob.job.status,
    started_at: builderJob.job.started_at,
    completed_at: effectiveCompletedAt,
    runner_wait_seconds: runnerWaitSeconds,
    timeout_seconds: timeoutSeconds,
    timed_out: timedOut,
  })

  // Update build_requests table with current status
  // Use admin client: access was already verified above (RLS SELECT + checkPermission).
  // The data written comes from the trusted builder API, not from user input.
  // An RLS UPDATE policy would let API-key holders forge status/build-time, so we bypass RLS here.
  const { error: updateError } = await supabaseAdmin(c)
    .from('build_requests')
    .update({
      status: effectiveStatus,
      last_error: effectiveError,
      runner_wait_seconds: runnerWaitSeconds,
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

  const shouldRecordBuildTime = !!builderJob.job.started_at
    && (timeoutApplied || ((effectiveStatus === 'succeeded' || effectiveStatus === 'failed') && !!builderJob.job.completed_at))

  if (shouldRecordBuildTime && effectiveBuildTimeSeconds !== null && effectiveCompletedAt) {
    cloudlog({
      requestId: c.get('requestId'),
      message: 'Recording build time',
      job_id,
      org_id,
      build_time_seconds: effectiveBuildTimeSeconds,
      raw_build_time_seconds: runtimeSeconds,
      timeout_seconds: timeoutSeconds,
      platform: resolvedPlatform,
    })

    await recordBuildTime(
      c,
      org_id,
      apikey.user_id,
      job_id,
      resolvedPlatform,
      effectiveBuildTimeSeconds,
      effectiveCompletedAt,
      buildRequest.app_id,
    )
  }

  return c.json({
    job_id,
    status: effectiveStatus,
    machine: builderJob.machine || null,
    started_at: builderJob.job.started_at,
    completed_at: effectiveCompletedAt,
    runner_wait_seconds: runnerWaitSeconds,
    build_time_seconds: timeoutApplied
      ? effectiveBuildTimeSeconds
      : builderJob.job.started_at && builderJob.job.completed_at
        ? runtimeSeconds
        : null,
    error: effectiveError,
    upload_url: builderJob.uploadUrl || null,
  }, 200)
}
