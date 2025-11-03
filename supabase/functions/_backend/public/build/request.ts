import type { Context } from 'hono'
import type { Database } from '../../utils/supabase.types.ts'
import { simpleError } from '../../utils/hono.ts'
import { hasAppRightApikey, supabaseAdmin } from '../../utils/supabase.ts'
import { getEnv } from '../../utils/utils.ts'

export interface RequestBuildBody {
  app_id: string
  platform: 'ios' | 'android'
  credentials?: Record<string, string>
}

export interface RequestBuildResponse {
  job_id: string
  upload_url: string
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
    credentials = {},
  } = body

  // Validate required fields
  if (!app_id) {
    throw simpleError('missing_parameter', 'app_id is required')
  }

  if (!platform) {
    throw simpleError('missing_parameter', 'platform is required')
  }

  if (!['ios', 'android'].includes(platform)) {
    throw simpleError('invalid_parameter', 'platform must be ios or android')
  }

  // Check if the user has write access to this app
  if (!(await hasAppRightApikey(c, app_id, apikey.user_id, 'write', apikey.key))) {
    throw simpleError('unauthorized', 'You do not have permission to request builds for this app')
  }

  // Get org_id for the app to use as anonymized user ID
  const supabase = supabaseAdmin(c)
  const { data: app, error: appError } = await supabase
    .from('apps')
    .select('owner_org')
    .eq('app_id', app_id)
    .single()

  if (appError || !app) {
    throw simpleError('not_found', 'App not found')
  }

  const org_id = app.owner_org

  // Create job in builder.capgo.app
  const builderResponse = await fetch(`${getEnv(c, 'BUILDER_URL')}/jobs`, {
    method: 'POST',
    headers: {
      'x-api-key': getEnv(c, 'BUILDER_API_KEY'),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      userId: org_id, // Use org_id as anonymized identifier
      fastlane: {
        lane: platform,
      },
      credentials: credentials || {},
    }),
  })

  if (!builderResponse.ok) {
    const errorText = await builderResponse.text()
    throw simpleError('builder_error', `Builder API error: ${errorText}`)
  }

  const builderJob = await builderResponse.json() as BuilderJobResponse

  return c.json({
    job_id: builderJob.jobId,
    upload_url: builderJob.uploadUrl,
    upload_expires_at: new Date(Date.now() + 20 * 60 * 1000).toISOString(),
    status: builderJob.status || 'queued',
  }, 200)
}
