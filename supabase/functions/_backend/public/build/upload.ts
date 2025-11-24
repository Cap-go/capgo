import type { Context } from 'hono'
import type { Database } from '../../utils/supabase.types.ts'
import { simpleError } from '../../utils/hono.ts'
import { cloudlog, cloudlogErr } from '../../utils/logging.ts'
import { hasAppRightApikey, supabaseAdmin } from '../../utils/supabase.ts'
import { getEnv } from '../../utils/utils.ts'

/**
 * TUS proxy for builder uploads
 * This proxies TUS protocol requests (POST, HEAD, PATCH, OPTIONS) to the builder,
 * adding the builder API key in the header so it never leaks to the client.
 */
export async function tusProxy(
  c: Context,
  jobId: string,
  apikey: Database['public']['Tables']['apikeys']['Row'],
): Promise<Response> {
  cloudlog({
    requestId: c.get('requestId'),
    message: 'TUS proxy request',
    job_id: jobId,
    method: c.req.method,
  })

  // Get builder config
  const builderUrl = getEnv(c, 'BUILDER_URL')
  const builderApiKey = getEnv(c, 'BUILDER_API_KEY')

  if (!builderUrl || !builderApiKey) {
    cloudlogErr({
      requestId: c.get('requestId'),
      message: 'Builder not configured for TUS proxy',
      job_id: jobId,
    })
    throw simpleError('service_unavailable', 'Builder service not configured')
  }

  // Get build request to verify ownership
  const supabase = supabaseAdmin(c)
  const { data: buildRequest, error: buildRequestError } = await supabase
    .from('build_requests')
    .select('app_id, owner_org, builder_job_id, upload_path')
    .eq('builder_job_id', jobId)
    .single()

  if (buildRequestError || !buildRequest) {
    cloudlogErr({
      requestId: c.get('requestId'),
      message: 'Build request not found',
      job_id: jobId,
      error: buildRequestError,
    })
    throw simpleError('not_found', 'Build request not found')
  }

  // Check if user has access to this app
  if (!(await hasAppRightApikey(c, buildRequest.app_id, apikey.user_id, 'write', apikey.key))) {
    cloudlogErr({
      requestId: c.get('requestId'),
      message: 'Unauthorized TUS upload',
      job_id: jobId,
      app_id: buildRequest.app_id,
      user_id: apikey.user_id,
    })
    throw simpleError('unauthorized', 'You do not have permission to upload for this build')
  }

  // Validate upload_path structure
  // Expected format: orgs/${org_id}/apps/${app_id}/native-builds/${upload_session_key}.zip
  if (!buildRequest.upload_path) {
    cloudlogErr({
      requestId: c.get('requestId'),
      message: 'Missing upload_path in build request',
      job_id: jobId,
      app_id: buildRequest.app_id,
    })
    throw simpleError('invalid_request', 'Build request missing upload path')
  }

  const pathPattern = /^orgs\/[^/]+\/apps\/[^/]+\/native-builds\/[^/]+\.zip$/
  if (!pathPattern.test(buildRequest.upload_path)) {
    cloudlogErr({
      requestId: c.get('requestId'),
      message: 'Invalid upload_path format',
      job_id: jobId,
      upload_path: buildRequest.upload_path,
    })
    throw simpleError('invalid_request', 'Invalid upload path format')
  }

  // Verify the upload_path contains the correct app_id and org_id
  const expectedPathPrefix = `orgs/${buildRequest.owner_org}/apps/${buildRequest.app_id}/native-builds/`
  if (!buildRequest.upload_path.startsWith(expectedPathPrefix)) {
    cloudlogErr({
      requestId: c.get('requestId'),
      message: 'Upload path does not match org/app from build request',
      job_id: jobId,
      upload_path: buildRequest.upload_path,
      expected_prefix: expectedPathPrefix,
      app_id: buildRequest.app_id,
      owner_org: buildRequest.owner_org,
    })
    throw simpleError('invalid_request', 'Upload path does not match build request')
  }

  cloudlog({
    requestId: c.get('requestId'),
    message: 'Upload path validated',
    job_id: jobId,
    upload_path: buildRequest.upload_path,
  })

  // Extract the path after /upload/:jobId/ and forward to builder
  // Example: /build/upload/abc123/myfile.zip -> /upload/myfile.zip
  // Example: /build/upload/abc123 -> /upload/
  const originalPath = c.req.path
  const uploadPrefix = `/build/upload/${jobId}`
  let tusPath = originalPath.startsWith(uploadPrefix)
    ? originalPath.slice(uploadPrefix.length)
    : '/'

  // For POST requests (creating upload), ensure trailing slash to match /upload/ route
  // For PATCH/HEAD requests (with filename), keep the path as-is (e.g., /capgo.zip)
  if (c.req.method === 'POST' && (tusPath === '' || tusPath === '/')) {
    tusPath = '/'
  }

  // Construct builder TUS URL with the path
  const builderTusUrl = `${builderUrl}/upload${tusPath}`

  cloudlog({
    requestId: c.get('requestId'),
    message: 'Proxying TUS request to builder',
    job_id: jobId,
    method: c.req.method,
    original_path: originalPath,
    upload_prefix: uploadPrefix,
    tus_path: tusPath,
    builder_url: builderTusUrl,
    has_api_key: !!builderApiKey,
  })

  // Forward the request to builder with API key
  const headers = new Headers(c.req.raw.headers)
  headers.set('x-api-key', builderApiKey)

  // For POST requests, rewrite Upload-Metadata to use the correct artifact key
  // Use the upload_path from the build request which contains the full orgs/apps path structure
  // Example: orgs/${org_id}/apps/${app_id}/native-builds/${upload_session_key}.zip
  if (c.req.method === 'POST') {
    const artifactKey = buildRequest.upload_path
    // Upload-Metadata format: "filename base64value"
    const encodedFilename = btoa(artifactKey)
    headers.set('upload-metadata', `filename ${encodedFilename}`)

    cloudlog({
      requestId: c.get('requestId'),
      message: 'Rewrote Upload-Metadata for builder',
      job_id: jobId,
      artifact_key: artifactKey,
    })
  }

  cloudlog({
    requestId: c.get('requestId'),
    message: 'Request headers prepared for builder',
    job_id: jobId,
    has_x_api_key: headers.has('x-api-key'),
  })

  // Forward the request
  const builderResponse = await fetch(builderTusUrl, {
    method: c.req.method,
    headers,
    body: c.req.raw.body,
    // @ts-ignore - duplex is valid for streaming
    duplex: 'half',
  })

  cloudlog({
    requestId: c.get('requestId'),
    message: 'Builder TUS response',
    job_id: jobId,
    status: builderResponse.status,
  })

  // Rewrite Location header if present (for POST responses)
  const responseHeaders = new Headers(builderResponse.headers)
  const locationHeader = builderResponse.headers.get('location')

  if (locationHeader) {
    // Replace builder URL with proxy URL
    // Example: https://builder.capgo.app/upload/file.zip -> https://api.capgo.app/build/upload/:jobId/file.zip
    try {
      const locationUrl = new URL(locationHeader)
      const builderUrlObj = new URL(builderUrl)

      // Check if this is a builder URL
      if (locationUrl.host === builderUrlObj.host) {
        // Extract path after /upload/
        const uploadPath = locationUrl.pathname.replace(/^\/upload/, '')

        // Construct proxy URL
        const publicUrl = getEnv(c, 'PUBLIC_URL') || 'https://api.capgo.app'
        const proxyLocation = `${publicUrl}/build/upload/${jobId}${uploadPath}`

        responseHeaders.set('location', proxyLocation)

        cloudlog({
          requestId: c.get('requestId'),
          message: 'Rewrote Location header',
          original: locationHeader,
          rewritten: proxyLocation,
        })
      }
    } catch (e) {
      cloudlogErr({
        requestId: c.get('requestId'),
        message: 'Failed to rewrite Location header',
        location: locationHeader,
        error: (e as Error).message,
      })
    }
  }

  // Return builder response to client
  return new Response(builderResponse.body, {
    status: builderResponse.status,
    headers: responseHeaders,
  })
}
