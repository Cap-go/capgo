import type { Context } from 'hono'
import type { Database } from '../../utils/supabase.types.ts'
import { simpleError } from '../../utils/hono.ts'
import { cloudlog, cloudlogErr } from '../../utils/logging.ts'
import { hasAppRightApikey, supabaseAdmin, supabaseApikey } from '../../utils/supabase.ts'
import { getEnv } from '../../utils/utils.ts'

export interface RequestBuildBody {
  app_id: string
  platform: 'ios' | 'android'
  build_mode?: 'release' | 'debug'
  build_config?: Record<string, any>
  credentials?: Record<string, string>
}

export interface RequestBuildResponse {
  build_request_id: string
  job_id: string
  upload_session_key: string
  upload_path: string
  upload_url: string // This will be the Capgo proxy URL, not the builder URL directly
  upload_expires_at: string
  status: string
}

interface BuilderJobResponse {
  jobId: string
  uploadUrl: string
  status: string
}

export async function requestBuild(
  c: Context,
  body: RequestBuildBody,
  apikey: Database['public']['Tables']['apikeys']['Row'],
): Promise<Response> {
  const {
    app_id,
    platform,
    build_mode = 'release',
    build_config = {},
    credentials = {},
  } = body

  cloudlog({
    requestId: c.get('requestId'),
    message: 'Build request received',
    app_id,
    platform,
    user_id: apikey.user_id,
  })

  // Validate required fields
  if (!app_id) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Missing app_id' })
    throw simpleError('missing_parameter', 'app_id is required')
  }

  if (!platform) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Missing platform' })
    throw simpleError('missing_parameter', 'platform is required')
  }

  if (!['ios', 'android'].includes(platform)) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Invalid platform', platform })
    throw simpleError('invalid_parameter', 'platform must be ios or android')
  }

  if (build_mode && !['release', 'debug'].includes(build_mode)) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Invalid build_mode', build_mode })
    throw simpleError('invalid_parameter', 'build_mode must be release or debug')
  }

  if (build_config && typeof build_config !== 'object') {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Invalid build_config type' })
    throw simpleError('invalid_parameter', 'build_config must be an object')
  }

  // Check if the user has write access to this app
  if (!(await hasAppRightApikey(c, app_id, apikey.user_id, 'write', apikey.key))) {
    cloudlogErr({
      requestId: c.get('requestId'),
      message: 'Unauthorized build request',
      app_id,
      user_id: apikey.user_id,
    })
    throw simpleError('unauthorized', 'You do not have permission to request builds for this app')
  }

  // Use authenticated client for data queries - RLS will enforce access
  const supabase = supabaseApikey(c, apikey.key)

  // Get org_id for the app to use as anonymized user ID
  const { data: app, error: appError } = await supabase
    .from('apps')
    .select('owner_org')
    .eq('app_id', app_id)
    .single()

  if (appError || !app) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'App not found', app_id, error: appError })
    throw simpleError('not_found', 'App not found')
  }

  const org_id = app.owner_org

  cloudlog({
    requestId: c.get('requestId'),
    message: 'Creating job in builder',
    org_id,
    app_id,
    platform,
  })

  // Create upload_path BEFORE calling builder so we can pass it
  const upload_session_key = crypto.randomUUID()
  const upload_path = `orgs/${org_id}/apps/${app_id}/native-builds/${upload_session_key}.zip`

  // Create job in builder.capgo.app
  const builderUrl = getEnv(c, 'BUILDER_URL')
  const builderApiKey = getEnv(c, 'BUILDER_API_KEY')
  let builderJob: BuilderJobResponse | null = null

  if (!builderUrl || !builderApiKey) {
    cloudlogErr({
      requestId: c.get('requestId'),
      message: 'Builder API not configured',
      builder_url_configured: !!builderUrl,
      builder_api_key_configured: !!builderApiKey,
    })
    throw simpleError('service_unavailable', 'Build service unavailable (builder not configured)')
  }

  try {
    cloudlog({
      requestId: c.get('requestId'),
      message: 'Calling builder API',
      builder_url: builderUrl,
      org_id,
      app_id,
      platform,
      artifact_key: upload_path,
    })

    const builderResponse = await fetch(`${builderUrl}/jobs`, {
      method: 'POST',
      headers: {
        'x-api-key': builderApiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId: org_id, // Use org_id as anonymized identifier
        artifactKey: upload_path, // Pass the artifact key to builder
        fastlane: {
          lane: platform,
        },
        credentials: credentials || {},
      }),
    })

    if (builderResponse.ok) {
      builderJob = await builderResponse.json() as BuilderJobResponse
      cloudlog({
        requestId: c.get('requestId'),
        message: 'Builder job created successfully',
        job_id: builderJob.jobId,
        upload_url: builderJob.uploadUrl,
      })
    }
    else {
      const errorText = await builderResponse.text()
      const responseHeaders: Record<string, string> = {}
      builderResponse.headers.forEach((value, key) => {
        responseHeaders[key] = value
      })
      cloudlogErr({
        requestId: c.get('requestId'),
        message: 'Builder API returned error',
        builder_url: builderUrl,
        status: builderResponse.status,
        status_text: builderResponse.statusText,
        error_body: errorText,
        response_headers: responseHeaders,
        org_id,
        app_id,
        platform,
      })
      throw simpleError('service_unavailable', 'Build service unavailable (builder error)')
    }
  }
  catch (error) {
    cloudlogErr({
      requestId: c.get('requestId'),
      message: 'Builder API fetch failed',
      builder_url: builderUrl,
      error: (error as Error)?.message,
      error_stack: (error as Error)?.stack,
      error_name: (error as Error)?.name,
      org_id,
      app_id,
      platform,
    })
    throw simpleError('service_unavailable', 'Build service unavailable (builder call failed)')
  }

  const upload_expires_at = new Date(Date.now() + 60 * 60 * 1000)

  // Builder upload URL is mandatory; no fallback allowed
  if (!builderJob?.uploadUrl) {
    cloudlogErr({
      requestId: c.get('requestId'),
      message: 'Builder did not return uploadUrl; rejecting request',
      builder_url: builderUrl,
      builder_api_key_present: !!builderApiKey,
    })
    throw simpleError('service_unavailable', 'Build service unavailable (upload URL missing)')
  }

  const upload_url = `${getEnv(c, 'PUBLIC_URL') || 'https://api.capgo.app'}/build/upload/${builderJob.jobId}`
  cloudlog({
    requestId: c.get('requestId'),
    message: 'Using Capgo TUS proxy URL for builder',
    proxy_url: upload_url,
    builder_url: builderJob.uploadUrl,
  })

  const supabaseAdminClient = supabaseAdmin(c)
  const { data: buildRequestRow, error: insertError } = await supabaseAdminClient
    .from('build_requests')
    .insert({
      app_id,
      owner_org: org_id,
      requested_by: apikey.user_id,
      platform,
      build_mode,
      build_config,
      status: 'pending',
      builder_job_id: builderJob.jobId,
      upload_session_key,
      upload_path,
      upload_url,
      upload_expires_at: upload_expires_at.toISOString(),
    })
    .select('*')
    .single()

  if (insertError || !buildRequestRow) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Failed to persist build request', error: insertError })
    throw simpleError('internal_error', 'Unable to persist build request')
  }

  cloudlog({
    requestId: c.get('requestId'),
    message: 'Build job created',
    job_id: builderJob.jobId,
    org_id,
    app_id,
    platform,
  })

  return c.json({
    build_request_id: buildRequestRow.id,
    job_id: builderJob.jobId,
    upload_session_key,
    upload_path,
    upload_url, // Capgo proxy URL
    upload_expires_at: upload_expires_at.toISOString(),
    status: buildRequestRow.status,
  } satisfies RequestBuildResponse, 200)
}
