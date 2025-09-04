import type { Context } from 'hono'
import type { Database } from '../../utils/supabase.types.ts'
// import ky from 'ky'
import { simpleError } from '../../utils/hono.ts'
import { hasAppRightApikey, supabaseAdmin } from '../../utils/supabase.ts'

interface CreateBundleBody {
  app_id: string
  version: string
  external_url: string
  checksum: string
  session_key?: string
}

function validateUrlFormat(url: string) {
  if (!url.startsWith('https://')) {
    throw simpleError('invalid_protocol', 'External URL must use HTTPS protocol', { external_url: url })
  }
}

// async function followRedirectsHead(url: string, maxRedirects = 5): Promise<Response> {
//   let currentUrl = url
//   let redirectCount = 0

//   while (redirectCount <= maxRedirects) {
//     const response = await ky.head(currentUrl, {
//       headers: {
//         'User-Agent': 'Capgo-Bundle-Validator/1.0',
//       },
//       timeout: 10000,
//       retry: 2,
//       throwHttpErrors: false, // Don't throw on 3xx status codes
//     })

//     // Check if it's a redirect status
//     if (response.status >= 300 && response.status < 400) {
//       const location = response.headers.get('location')
//       if (!location) {
//         throw simpleError('url_fetch_error', 'Redirect response without location header', {
//           external_url: currentUrl,
//           status: response.status,
//         })
//       }

//       // Handle relative URLs
//       currentUrl = new URL(location, currentUrl).href
//       redirectCount++

//       if (redirectCount > maxRedirects) {
//         throw simpleError('url_fetch_error', 'Too many redirects', {
//           external_url: url,
//           finalUrl: currentUrl,
//           redirectCount,
//         })
//       }
//       continue
//     }

//     // Not a redirect, return the response
//     return response
//   }

//   throw simpleError('url_fetch_error', 'Unexpected error in redirect handling', {
//     external_url: url,
//   })
// }

// async function verifyUrlAccessibility(url: string): Promise<void> {
//   try {
//     const response = await followRedirectsHead(url)

//     if (!response.ok) {
//       throw simpleError('url_not_accessible', 'External URL is not accessible', {
//         external_url: url,
//         status: response.status,
//         statusText: response.statusText,
//         finalUrl: response.url,
//       })
//     }

//     const contentType = response.headers.get('content-type') || ''
//     const contentLength = response.headers.get('content-length')

//     // Check if it's likely a file (not HTML page)
//     if (contentType.includes('text/html')) {
//       throw simpleError('url_not_file', 'External URL appears to be a webpage, not a file', {
//         external_url: url,
//         contentType,
//       })
//     }

//     // Check if it's a zip file
//     const isZipContentType = contentType.includes('application/zip')
//       || contentType.includes('application/x-zip-compressed')
//       || contentType.includes('application/octet-stream')
//     const isZipExtension = url.toLowerCase().endsWith('.zip')

//     // Check Content-Disposition header for filename
//     const contentDisposition = response.headers.get('content-disposition') || ''
//     const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/)
//     const filename = filenameMatch ? filenameMatch[1].replace(/['"]/g, '') : ''
//     const isZipFilename = filename.toLowerCase().endsWith('.zip')

//     if (!isZipContentType && !isZipExtension && !isZipFilename) {
//       throw simpleError('url_not_zip', 'External URL must point to a ZIP file', {
//         external_url: url,
//         contentType,
//         contentDisposition,
//         detectedFilename: filename,
//       })
//     }

//     // Check if file has content
//     if (contentLength === '0') {
//       throw simpleError('url_empty_file', 'External URL points to an empty file', {
//         external_url: url,
//       })
//     }
//   }
//   catch (error) {
//     if (error instanceof Error && (error.message.includes('url_not_accessible') || error.message.includes('url_not_file') || error.message.includes('url_empty_file'))) {
//       throw error
//     }
//     throw simpleError('url_fetch_error', 'Failed to verify external URL accessibility', {
//       external_url: url,
//       error: error instanceof Error ? error.message : 'Unknown error',
//     })
//   }
// }

async function getAppOrganization(c: Context, appId: string): Promise<string> {
  const { data: app, error: appError } = await supabaseAdmin(c)
    .from('apps')
    .select('owner_org')
    .eq('app_id', appId)
    .single()

  if (appError || !app) {
    throw simpleError('cannot_find_app', 'Cannot find app', { supabaseError: appError })
  }

  return app.owner_org
}

async function checkVersionExists(c: Context, appId: string, version: string): Promise<void> {
  const { data: existingVersion } = await supabaseAdmin(c)
    .from('app_versions')
    .select('id')
    .eq('app_id', appId)
    .eq('name', version)
    .eq('deleted', false)
    .single()

  if (existingVersion) {
    throw simpleError('version_already_exists', 'Version already exists', { version })
  }
}

async function insertBundle(c: Context, body: CreateBundleBody, ownerOrg: string, userId: string): Promise<any> {
  const { data: newBundle, error: createError } = await supabaseAdmin(c)
    .from('app_versions')
    .insert({
      app_id: body.app_id,
      checksum: body.checksum,
      name: body.version,
      ...(body.session_key && { session_key: body.session_key }),
      external_url: body.external_url,
      storage_provider: 'external',
      owner_org: ownerOrg,
      user_id: userId,
    })
    .select()
    .single()

  if (createError) {
    throw simpleError('cannot_create_bundle', 'Cannot create bundle', { supabaseError: createError })
  }

  return newBundle
}

export async function createBundle(c: Context, body: CreateBundleBody, apikey: Database['public']['Tables']['apikeys']['Row']): Promise<Response> {
  if (!body.app_id) {
    throw simpleError('missing_app_id', 'Missing required fields: app_id', { app_id: body.app_id })
  }
  if (!body.version) {
    throw simpleError('missing_version', 'Missing required fields: version', { version: body.version })
  }
  if (!body.external_url) {
    throw simpleError('missing_external_url', 'Missing required fields: external_url', { external_url: body.external_url })
  }
  if (!body.checksum) {
    throw simpleError('missing_checksum', 'Missing required fields: checksum', { checksum: body.checksum })
  }
  if (!(await hasAppRightApikey(c, body.app_id, apikey.user_id, 'write', apikey.key))) {
    throw simpleError('cannot_create_bundle', 'You can\'t access this app', { app_id: body.app_id })
  }

  validateUrlFormat(body.external_url)
  // await verifyUrlAccessibility(body.external_url)

  const ownerOrg = await getAppOrganization(c, body.app_id)
  await checkVersionExists(c, body.app_id, body.version)

  const newBundle = await insertBundle(c, body, ownerOrg, apikey.user_id)

  return c.json({
    status: 'success',
    bundle: newBundle,
  })
}
