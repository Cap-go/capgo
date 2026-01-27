import type { Context } from 'hono'
import type { Database } from '../../utils/supabase.types.ts'
import { simpleError } from '../../utils/hono.ts'
import { cloudlog, cloudlogErr } from '../../utils/logging.ts'
import { checkPermission } from '../../utils/rbac.ts'
import { supabaseApikey } from '../../utils/supabase.ts'
import { getEnv } from '../../utils/utils.ts'

interface BuilderStartResponse {
  status: string
}

/**
 * Generate a JWT token for direct log stream access
 * Uses HMAC-SHA256 for signing
 */
async function generateLogStreamToken(
  jobId: string,
  userId: string,
  appId: string,
  jwtSecret: string,
): Promise<string> {
  const encoder = new TextEncoder()

  // Header
  const header = {
    alg: 'HS256',
    typ: 'JWT',
  }

  // Payload with 4 hour expiration (longer than max build time)
  const now = Math.floor(Date.now() / 1000)
  const payload = {
    job_id: jobId,
    user_id: userId,
    app_id: appId,
    iat: now,
    exp: now + (4 * 60 * 60), // 4 hours
  }

  // Base64url encode header and payload
  const headerB64 = btoa(JSON.stringify(header))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
  const payloadB64 = btoa(JSON.stringify(payload))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

  // Create signature using Web Crypto API
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(jwtSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )

  const dataToSign = `${headerB64}.${payloadB64}`
  const signatureBuffer = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(dataToSign),
  )

  // Convert signature to base64url
  const signatureArray = new Uint8Array(signatureBuffer)
  let signatureB64 = ''
  for (const byte of signatureArray) {
    signatureB64 += String.fromCharCode(byte)
  }
  signatureB64 = btoa(signatureB64)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

  return `${headerB64}.${payloadB64}.${signatureB64}`
}

async function markBuildAsFailed(
  c: Context,
  jobId: string,
  errorMessage: string,
  apikeyKey: string,
): Promise<void> {
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
  const apikeyKey = apikey.key ?? c.get('capgkey') ?? apikey.key_hash ?? null

  try {
    cloudlog({
      requestId: c.get('requestId'),
      message: 'Start build request',
      job_id: jobId,
      app_id: appId,
      user_id: apikey.user_id,
    })

    if (!apikeyKey) {
      const errorMsg = 'No API key available to start build'
      cloudlogErr({
        requestId: c.get('requestId'),
        message: 'Missing API key for start build',
        job_id: jobId,
        app_id: appId,
        user_id: apikey.user_id,
      })
      throw simpleError('not_authorized', errorMsg)
    }

    // Security: Check if user has permission to manage builds (auth context set by middlewareKey)
    if (!(await checkPermission(c, 'app.build_native', { appId }))) {
      const errorMsg = 'You do not have permission to start builds for this app'
      cloudlogErr({
        requestId: c.get('requestId'),
        message: 'Unauthorized start build',
        job_id: jobId,
        app_id: appId,
        user_id: apikey.user_id,
      })
      await markBuildAsFailed(c, jobId, errorMsg, apikeyKey)
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
      await markBuildAsFailed(c, jobId, errorMsg, apikeyKey)
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
    const supabase = supabaseApikey(c, apikeyKey)
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

    // Generate JWT token for direct log stream access
    const jwtSecret = getEnv(c, 'JWT_SECRET')
    const publicUrl = getEnv(c, 'PUBLIC_URL') || 'https://api.capgo.app'

    let logsUrl: string | undefined
    let logsToken: string | undefined

    if (jwtSecret) {
      try {
        logsToken = await generateLogStreamToken(jobId, apikey.user_id, appId, jwtSecret)
        logsUrl = `${publicUrl}/build_logs_direct/${jobId}`

        cloudlog({
          requestId: c.get('requestId'),
          message: 'Generated log stream token for direct access',
          job_id: jobId,
          logs_url: logsUrl,
        })
      }
      catch (tokenError) {
        // Log error but don't fail the request - CLI can fall back to proxy
        cloudlogErr({
          requestId: c.get('requestId'),
          message: 'Failed to generate log stream token',
          job_id: jobId,
          error: tokenError instanceof Error ? tokenError.message : String(tokenError),
        })
      }
    }
    else {
      cloudlog({
        requestId: c.get('requestId'),
        message: 'JWT_SECRET not configured, skipping direct log stream token',
        job_id: jobId,
      })
    }

    return c.json({
      job_id: jobId,
      status: builderJob.status || 'running',
      ...(logsUrl && logsToken ? { logs_url: logsUrl, logs_token: logsToken } : {}),
    }, 200)
  }
  catch (error) {
    // Mark build as failed for any unexpected error (but only if not already marked)
    if (!alreadyMarkedAsFailed && apikeyKey) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      await markBuildAsFailed(c, jobId, errorMsg, apikeyKey)
    }
    throw error
  }
}
