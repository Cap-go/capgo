import type { Context } from 'hono'
import type { Database } from '../../utils/supabase.types.ts'
import { simpleError } from '../../utils/hono.ts'
import { s3 } from '../../utils/s3.ts'
import { hasAppRightApikey, supabaseApikey } from '../../utils/supabase.ts'

export interface RequestBuildBody {
  app_id: string
  platform: 'ios' | 'android' | 'both'
  build_mode?: 'debug' | 'release'
  build_config?: Record<string, unknown>
}

interface BuildRequestRpcResponse {
  build_request_id: string
  upload_session_key: string
  upload_path: string
  upload_expires_at: string
  status: string
}

export interface RequestBuildResponse {
  build_request_id: string
  upload_session_key: string
  upload_path: string
  upload_url: string
  upload_expires_at: string
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
  } = body

  // Validate required fields
  if (!app_id) {
    throw simpleError('missing_parameter', 'app_id is required')
  }

  if (!platform) {
    throw simpleError('missing_parameter', 'platform is required')
  }

  if (!['ios', 'android', 'both'].includes(platform)) {
    throw simpleError('invalid_parameter', 'platform must be ios, android, or both')
  }

  if (build_mode && !['debug', 'release'].includes(build_mode)) {
    throw simpleError('invalid_parameter', 'build_mode must be debug or release')
  }

  // Check if the user has write access to this app
  if (!(await hasAppRightApikey(c, app_id, apikey.user_id, 'write', apikey.key))) {
    throw simpleError('unauthorized', 'You do not have permission to request builds for this app')
  }

  // Call the create_build_request RPC function
  const supabase = supabaseApikey(c, apikey.key)
  const { data: buildRequest, error } = await supabase
    .rpc('create_build_request', {
      p_app_id: app_id,
      p_platform: platform,
      p_build_mode: build_mode,
      p_build_config: build_config as Record<string, any>,
    }) as { data: BuildRequestRpcResponse | null, error: any }

  if (error) {
    console.error('Error creating build request:', error)
    throw simpleError('database_error', `Failed to create build request: ${error.message}`)
  }

  if (!buildRequest) {
    throw simpleError('database_error', 'Failed to create build request: no data returned')
  }

  // Generate presigned upload URL using S3/R2
  const uploadUrl = await s3.getUploadUrl(c, buildRequest.upload_path, 3600) // 1 hour expiry
  if (!uploadUrl) {
    throw simpleError('storage_error', 'Failed to create upload URL')
  }

  const response: RequestBuildResponse = {
    build_request_id: buildRequest.build_request_id,
    upload_session_key: buildRequest.upload_session_key,
    upload_path: buildRequest.upload_path,
    upload_url: uploadUrl,
    upload_expires_at: buildRequest.upload_expires_at,
    status: buildRequest.status,
  }

  return c.json(response, 200)
}
