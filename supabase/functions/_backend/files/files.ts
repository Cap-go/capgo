import type { Context, Next } from 'hono'
import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import type { Database } from '../utils/supabase.types.ts'
import { getRuntimeKey } from 'hono/adapter'
import { HTTPException } from 'hono/http-exception'
import { Hono } from 'hono/tiny'
import { app as download_link } from '../private/download_link.ts'
import { app as upload_link } from '../private/upload_link.ts'
import { app as ok } from '../public/ok.ts'
import { simpleError } from '../utils/hono.ts'
import { middlewareKey } from '../utils/hono_middleware.ts'
import { cloudlog } from '../utils/logging.ts'
import { closeClient, getDrizzleClient, getPgClient } from '../utils/pg.ts'
import { getAppByAppIdPg, getUserIdFromApikey } from '../utils/pg_files.ts'
import { checkPermissionPg } from '../utils/rbac.ts'
import { createStatsBandwidth } from '../utils/stats.ts'
import { supabaseAdmin } from '../utils/supabase.ts'
import { backgroundTask } from '../utils/utils.ts'
import { app as files_config } from './files_config.ts'
import { parseUploadMetadata } from './parse.ts'
import { DEFAULT_RETRY_PARAMS, RetryBucket } from './retry.ts'
import { supabaseTusCreateHandler, supabaseTusHeadHandler, supabaseTusPatchHandler } from './supabaseTusProxy.ts'
import { ALLOWED_HEADERS, ALLOWED_METHODS, EXPOSED_HEADERS, MAX_UPLOAD_LENGTH_BYTES, toBase64, TUS_VERSION, X_CHECKSUM_SHA256 } from './util.ts'

const DO_CALL_TIMEOUT = 1000 * 60 * 30 // 20 minutes

const ATTACHMENT_PREFIX = 'attachments'

export const app = new Hono<MiddlewareKeyVariables>()

async function saveBandwidthUsage(c: Context, fileSize: number | null | undefined) {
  cloudlog({ requestId: c.get('requestId'), message: 'saveBandwidthUsage', fileSize })
  if (!fileSize || fileSize <= 0)
    return Promise.resolve()

  cloudlog({ requestId: c.get('requestId'), message: 'getHandler files track bandwidth', fileSize })
  const r2Path = new URL(c.req.url).pathname.split(`/files/read/${ATTACHMENT_PREFIX}/`)[1]
  const app_id = r2Path?.split('/')[3]
  const device_id = c.req.query('device_id')
  if (app_id && device_id) {
    await createStatsBandwidth(c, device_id, app_id, fileSize ?? 0)
  }
  else {
    cloudlog({ requestId: c.get('requestId'), message: 'getHandler files cannot track bandwidth no app_id or device_id', r2Path, app_id, device_id })
  }
}

async function getHandler(c: Context): Promise<Response> {
  const requestId = c.get('fileId')
  cloudlog({ requestId: c.get('requestId'), message: 'getHandler files', fileId: requestId })
  if (getRuntimeKey() !== 'workerd') {
    cloudlog({ requestId: c.get('requestId'), message: 'getHandler files using supabase storage' })
    // serve file from supabase storage using they sdk
    const { data } = supabaseAdmin(c).storage.from('capgo').getPublicUrl(requestId)

    // cloudlog('publicUrl', data.publicUrl)
    const url = data.publicUrl.replace('http://kong:8000', 'http://localhost:54321')
    // cloudlog('url', url)
    return c.redirect(url)
  }

  const bucket: R2Bucket = c.env.ATTACHMENT_BUCKET

  if (bucket == null) {
    cloudlog({ requestId: c.get('requestId'), message: 'getHandler files bucket is null' })
    return c.json({ error: 'not_found', message: 'Not found' }, 404)
  }

  // Support for deno cache or CF cache do not remove this
  // @ts-expect-error-next-line
  const cache = getRuntimeKey() === 'workerd' ? caches.default : caches
  const cacheUrl = new URL(c.req.url)
  cacheUrl.searchParams.set('range', c.req.header('range') || '')
  const cacheKey = new Request(cacheUrl, c.req)
  let response = await cache.match(cacheKey)
  if (response != null) {
    cloudlog({ requestId: c.get('requestId'), message: 'getHandler files cache hit' })
    return response
  }

  const rangeHeaderFromRequest = c.req.header('range')
  if (rangeHeaderFromRequest) {
    cloudlog({ requestId: c.get('requestId'), message: 'getHandler files range request', range: rangeHeaderFromRequest })
    const objectInfo = await new RetryBucket(bucket, DEFAULT_RETRY_PARAMS).head(requestId)
    if (objectInfo == null) {
      cloudlog({ requestId: c.get('requestId'), message: 'getHandler files object is null' })
      return c.json({ error: 'not_found', message: 'Not found' }, 404)
    }
    const fileSize = objectInfo.size
    const rangeMatch = rangeHeaderFromRequest.match(/bytes=(\d+)-(\d*)/)
    if (rangeMatch) {
      const rangeStart = Number.parseInt(rangeMatch[1])
      if (rangeStart >= fileSize) {
        const emptyHeaders = new Headers()
        emptyHeaders.set('Content-Range', `bytes */${fileSize}`)
        return new Response(new Uint8Array(0), { status: 206, headers: emptyHeaders })
      }
    }
  }

  const object = await new RetryBucket(bucket, DEFAULT_RETRY_PARAMS).get(requestId, {
    range: c.req.raw.headers,
  })
  if (object == null) {
    cloudlog({ requestId: c.get('requestId'), message: 'getHandler files object is null' })
    return c.json({ error: 'not_found', message: 'Not found' }, 404)
  }
  const bytesTransferred = calculateBytesTransferred(object.size, object.range)
  await saveBandwidthUsage(c, bytesTransferred)
  const headers = objectHeaders(object)
  if (object.range != null && c.req.header('range')) {
    cloudlog({ requestId: c.get('requestId'), message: 'getHandler files range request', range: rangeHeader(object.size, object.range) })
    headers.set('content-range', rangeHeader(object.size, object.range))
    response = new Response(object.body, { headers, status: 206 })
    return response
  }
  headers.set('Content-Disposition', `attachment; filename="${object.key}"`)
  response = new Response(object.body, { headers })
  await backgroundTask(c, () => {
    cloudlog({ requestId: c.get('requestId'), message: 'getHandler files cache saved', fileId: requestId })
    cache.put(cacheKey, response.clone())
  })
  return response
}

function objectHeaders(object: R2Object): Headers {
  const headers = new Headers()
  object.writeHttpMetadata(headers)
  headers.set('etag', object.httpEtag)

  // the sha256 checksum was provided to R2 in the upload
  if (object.checksums.sha256 != null) {
    headers.set(X_CHECKSUM_SHA256, toBase64(object.checksums.sha256))
  }

  // it was a multipart upload, so we were forced to write a sha256 checksum as a custom header
  if (object.customMetadata?.[X_CHECKSUM_SHA256] != null) {
    headers.set(X_CHECKSUM_SHA256, object.customMetadata[X_CHECKSUM_SHA256])
  }
  return headers
}

function rangeHeader(objLen: number, r2Range: R2Range): string {
  let startIndexInclusive = 0
  let endIndexInclusive = objLen - 1
  if ('offset' in r2Range && r2Range.offset != null) {
    startIndexInclusive = r2Range.offset
  }
  if ('length' in r2Range && r2Range.length != null) {
    endIndexInclusive = startIndexInclusive + r2Range.length - 1
  }
  if ('suffix' in r2Range) {
    startIndexInclusive = objLen - r2Range.suffix
  }
  return `bytes ${startIndexInclusive}-${endIndexInclusive}/${objLen}`
}

function calculateBytesTransferred(objLen: number, r2Range: R2Range | undefined): number {
  if (!r2Range)
    return objLen
  let startIndexInclusive = 0
  let endIndexInclusive = objLen - 1
  if ('offset' in r2Range && r2Range.offset != null) {
    startIndexInclusive = r2Range.offset
  }
  if ('length' in r2Range && r2Range.length != null) {
    endIndexInclusive = startIndexInclusive + r2Range.length - 1
  }
  if ('suffix' in r2Range) {
    startIndexInclusive = objLen - r2Range.suffix
  }
  return endIndexInclusive - startIndexInclusive + 1
}

function optionsHandler(c: Context) {
  cloudlog({ requestId: c.get('requestId'), message: 'optionsHandler files optionsHandler' })
  return c.newResponse(null, 204, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': ALLOWED_METHODS,
    'Access-Control-Allow-Headers': ALLOWED_HEADERS,
    'Access-Control-Expose-Headers': EXPOSED_HEADERS,
    'Tus-Resumable': TUS_VERSION,
    'Tus-Version': TUS_VERSION,
    'Tus-Max-Size': MAX_UPLOAD_LENGTH_BYTES.toString(),
    'Tus-Extension': 'creation,creation-defer-length,creation-with-upload,expiration',
  })
}

// TUS protocol requests (POST/PATCH/HEAD) that get forwarded to a durable object
async function uploadHandler(c: Context) {
  const requestId = c.get('fileId') as string
  // make requestId safe
  const normalizedRequestId = decodeURIComponent(requestId)
  const durableObjNs: DurableObjectNamespace = c.env.ATTACHMENT_UPLOAD_HANDLER

  if (durableObjNs == null) {
    cloudlog({ requestId: c.get('requestId'), message: 'files durableObjNs is null' })
    throw simpleError('invalid_bucket_configuration', 'Invalid bucket configuration')
  }

  const handler = durableObjNs.get(durableObjNs.idFromName(normalizedRequestId))
  cloudlog({ requestId: c.get('requestId'), message: 'upload handler - forwarding to DO', method: c.req.method, url: c.req.url })

  // Pass requestId to DO via header so it can use it in logs
  const headers = new Headers(c.req.raw.headers)
  headers.set('X-Request-Id', c.get('requestId') || 'unknown')

  return await handler.fetch(c.req.url, {
    body: c.req.raw.body,
    method: c.req.method,
    headers,
    signal: AbortSignal.timeout(DO_CALL_TIMEOUT),
  })
}

async function setKeyFromMetadata(c: Context, next: Next) {
  const uploadMetadata = parseUploadMetadata(c, c.req.raw.headers)
  cloudlog({
    requestId: c.get('requestId'),
    message: 'setKeyFromMetadata - raw metadata',
    metadata: uploadMetadata,
  })

  const fileId = uploadMetadata.filename
  if (fileId == null) {
    cloudlog({
      requestId: c.get('requestId'),
      message: 'setKeyFromMetadata - fileId is null',
      uploadMetadataLength: c.req.header('Upload-Metadata')?.length ?? 0,
    })
    return c.json({ error: 'not_found', message: 'Not found' }, 404)
  }

  cloudlog({ requestId: c.get('requestId'), message: 'setKeyFromMetadata - raw fileId', fileId })

  // Decode base64 if necessary
  // Check if it looks like base64 (no slashes, only valid base64 chars)
  let decodedFileId = fileId
  const looksLikeBase64 = !fileId.includes('/') && /^[A-Z0-9+/]+=*$/i.test(fileId)

  if (looksLikeBase64) {
    try {
      decodedFileId = atob(fileId)
      cloudlog({ requestId: c.get('requestId'), message: 'setKeyFromMetadata - decoded from base64', decodedFileId })
    }
    catch (decodeError) {
      cloudlog({
        requestId: c.get('requestId'),
        message: 'setKeyFromMetadata - base64 decode failed, using raw',
        fileId,
        error: decodeError instanceof Error ? decodeError.message : String(decodeError),
      })
    }
  }
  else {
    cloudlog({
      requestId: c.get('requestId'),
      message: 'setKeyFromMetadata - fileId already decoded (contains slashes)',
      fileId,
    })
  }

  const normalizedFileId = decodeURIComponent(decodedFileId)
  cloudlog({ requestId: c.get('requestId'), message: 'setKeyFromMetadata - final normalized fileId', normalizedFileId })
  c.set('fileId', normalizedFileId)
  await next()
}

async function setKeyFromIdParam(c: Context, next: Next) {
  const fileId = c.req.param('id')
  cloudlog({
    requestId: c.get('requestId'),
    message: 'setKeyFromIdParam - raw param',
    fileId,
    url: c.req.url,
    method: c.req.method,
  })
  if (fileId == null) {
    cloudlog({ requestId: c.get('requestId'), message: 'setKeyFromIdParam - fileId is null' })
    return c.json({ error: 'not_found', message: 'Not found' }, 404)
  }

  const normalizedFileId = decodeURIComponent(fileId)

  // Check if this is a Supabase TUS upload ID (base64 encoded)
  // TUS upload IDs from Supabase are base64-encoded paths like: capgo/orgs/xxx/apps/yyy/file.zip/uuid
  let extractedFileId = normalizedFileId
  try {
    const decoded = atob(normalizedFileId)
    // If decoded starts with bucket name and contains orgs/, it's a TUS upload ID
    if (decoded.startsWith('capgo/') && decoded.includes('/orgs/')) {
      const parts = decoded.split('/')
      // Expected format:
      // [0]: 'capgo'
      // [1]: 'orgs'
      // [2]: orgId
      // [3]: 'apps'
      // [4]: appId
      // [5..n-2]: file path segments
      // [n-1]: UUID
      if (
        parts.length >= 6
        && parts[0] === 'capgo'
        && parts[1] === 'orgs'
        && parts[3] === 'apps'
      ) {
        cloudlog({
          requestId: c.get('requestId'),
          message: 'setKeyFromIdParam - detected Supabase TUS upload ID',
          decoded,
          parts,
        })
        // Extract file path: remove bucket prefix (capgo/) and UUID suffix
        // Resulting path starts with "orgs/..."
        const pathParts = parts.slice(1, parts.length - 1)
        if (pathParts.length > 0) {
          extractedFileId = pathParts.join('/')
          cloudlog({
            requestId: c.get('requestId'),
            message: 'setKeyFromIdParam - extracted fileId from TUS ID',
            extractedFileId,
            originalParts: parts,
            pathParts,
          })
        }
        else {
          cloudlog({
            requestId: c.get('requestId'),
            message: 'setKeyFromIdParam - TUS ID decoded but pathParts is empty, using normalizedFileId as fileId',
            decoded,
            parts,
          })
        }
      }
      else {
        cloudlog({
          requestId: c.get('requestId'),
          message: 'setKeyFromIdParam - decoded TUS ID has unexpected structure, using normalizedFileId as fileId',
          decoded,
          parts,
        })
      }
    }
  }
  catch {
    // Not a base64 string, use as-is
  }

  cloudlog({
    requestId: c.get('requestId'),
    message: 'setKeyFromIdParam - final fileId',
    originalFileId: fileId,
    extractedFileId,
  })
  c.set('fileId', extractedFileId)
  await next()
}

async function checkWriteAppAccess(c: Context, next: Next) {
  const requestId = c.get('fileId') as string
  cloudlog({
    requestId: c.get('requestId'),
    message: 'checkWriteAppAccess - start',
    fileId: requestId,
  })

  const parts = requestId.split('/')
  const [orgs, owner_org, apps, app_id] = parts

  if (orgs !== 'orgs' || apps !== 'apps') {
    cloudlog({
      requestId: c.get('requestId'),
      message: 'checkWriteAppAccess - invalid path structure',
      fileId: requestId,
      orgs,
      apps,
      expected: 'orgs/*/apps/*',
    })
    throw new HTTPException(400, {
      res: c.json({
        error: 'invalid_file_path',
        message: 'Invalid file path structure. Expected: orgs/{owner_org}/apps/{app_id}/...',
        moreInfo: { fileId: requestId, orgs, apps, requestId: c.get('requestId') },
      }),
    })
  }

  if (parts.length < 5) {
    cloudlog({
      requestId: c.get('requestId'),
      message: 'checkWriteAppAccess - path too short',
      fileId: requestId,
      pathLength: parts.length,
      minRequired: 5,
    })
    throw new HTTPException(400, {
      res: c.json({
        error: 'invalid_file_path',
        message: 'Invalid file path. Path must have at least 5 segments: orgs/{owner_org}/apps/{app_id}/{filename}',
        moreInfo: { fileId: requestId, pathLength: parts.length, requestId: c.get('requestId') },
      }),
    })
  }

  cloudlog({
    requestId: c.get('requestId'),
    message: 'checkWriteAppAccess - parsed path',
    app_id,
    owner_org,
  })

  const capgkey = c.get('capgkey') as string
  const apikey = c.get('apikey') as Database['public']['Tables']['apikeys']['Row']

  cloudlog({
    requestId: c.get('requestId'),
    message: 'checkWriteAppAccess - checking api key',
    capgkey: capgkey ? `${capgkey.substring(0, 10)}...` : 'missing',
    capgkeyLength: capgkey?.length ?? 0,
    hasCapgkey: !!capgkey,
    userId: apikey.user_id,
  })

  // Use Postgres instead of Supabase SDK
  const pgClient = getPgClient(c, true) // read-only query
  const drizzleClient = getDrizzleClient(pgClient)

  try {
    // Get user_id from apikey using Postgres
    const userId = await getUserIdFromApikey(c, capgkey, drizzleClient)

    cloudlog({
      requestId: c.get('requestId'),
      message: 'checkWriteAppAccess - get_user_id result',
      userId,
      userIdIsNull: userId === null,
    })

    if (userId === null) {
      cloudlog({
        requestId: c.get('requestId'),
        message: 'checkWriteAppAccess - user lookup failed',
        userId,
        app_id,
        capgkeyPrefix: capgkey ? capgkey.substring(0, 15) : 'missing',
      })
      throw new HTTPException(400, {
        res: c.json({
          error: 'user_not_found',
          message: 'User not found for the provided API key',
          moreInfo: { app_id, hasApiKey: !!capgkey, apiKeyLength: capgkey?.length ?? 0, requestId: c.get('requestId') },
        }),
      })
    }

    cloudlog({
      requestId: c.get('requestId'),
      message: 'checkWriteAppAccess - checking app permissions via checkPermissionPg',
      userId,
      app_id,
    })

    // Use the new RBAC permission check
    const hasPermission = await checkPermissionPg(c, 'app.read_bundles', { appId: app_id }, drizzleClient, userId, capgkey)

    cloudlog({
      requestId: c.get('requestId'),
      message: 'checkWriteAppAccess - checkPermissionPg result',
      hasPermission,
    })

    if (!hasPermission) {
      cloudlog({
        requestId: c.get('requestId'),
        message: 'checkWriteAppAccess - insufficient permissions',
        userId,
        app_id,
      })
      throw new HTTPException(403, {
        res: c.json({
          error: 'insufficient_permissions',
          message: 'You don\'t have permission to access this app',
          moreInfo: { app_id, requestId: c.get('requestId') },
        }),
      })
    }

    // Get app using Postgres
    const app = await getAppByAppIdPg(c, app_id, drizzleClient)

    if (!app) {
      cloudlog({
        requestId: c.get('requestId'),
        message: 'checkWriteAppAccess - app not found',
        app_id,
      })
      throw new HTTPException(404, {
        res: c.json({
          error: 'app_not_found',
          message: 'App not found',
          moreInfo: { app_id, requestId: c.get('requestId') },
        }),
      })
    }

    if (app.owner_org !== owner_org) {
      cloudlog({
        requestId: c.get('requestId'),
        message: 'checkWriteAppAccess - owner org mismatch',
        filePathOwnerOrg: owner_org,
        actualOwnerOrg: app.owner_org,
        app_id,
      })
      throw new HTTPException(403, {
        res: c.json({
          error: 'owner_org_mismatch',
          message: 'The owner organization in the file path does not match the app\'s owner organization',
          moreInfo: {
            app_id,
            filePathOwnerOrg: owner_org,
            actualOwnerOrg: app.owner_org,
            requestId: c.get('requestId'),
          },
        }),
      })
    }

    cloudlog({
      requestId: c.get('requestId'),
      message: 'checkWriteAppAccess - access granted',
      app_id,
      owner_org,
    })
  }
  finally {
    // Always close the connection
    await closeClient(c, pgClient)
  }

  await next()
}

app.options(`/upload/${ATTACHMENT_PREFIX}`, optionsHandler)
app.post(`/upload/${ATTACHMENT_PREFIX}`, middlewareKey(['all', 'write', 'upload'], true), setKeyFromMetadata, checkWriteAppAccess, async (c) => {
  if (getRuntimeKey() !== 'workerd') {
    return supabaseTusCreateHandler(c)
  }
  return uploadHandler(c)
})

app.options(`/upload/${ATTACHMENT_PREFIX}/:id{.+}`, optionsHandler)
// Combined GET/HEAD handler for TUS uploads - Hono tiny routes HEAD to GET
app.get(
  `/upload/${ATTACHMENT_PREFIX}/:id{.+}`,
  middlewareKey(['all', 'write', 'upload'], true),
  // Early TUS HEAD detection to avoid unnecessary ID parsing and access checks
  async (c, next) => {
    const isTusRequest = c.req.header('Tus-Resumable') != null
    const isHead = c.req.method === 'HEAD'

    if (isHead && isTusRequest && getRuntimeKey() !== 'workerd') {
      cloudlog({ requestId: c.get('requestId'), message: 'Routing HEAD TUS request to supabaseTusHeadHandler (early)' })
      return supabaseTusHeadHandler(c)
    }

    return next()
  },
  setKeyFromIdParam,
  checkWriteAppAccess,
  async (c) => {
    // Normal GET handler
    return getHandler(c)
  },
)
app.get(`/read/${ATTACHMENT_PREFIX}/:id{.+}`, setKeyFromIdParam, getHandler)
app.patch(`/upload/${ATTACHMENT_PREFIX}/:id{.+}`, middlewareKey(['all', 'write', 'upload'], true), setKeyFromIdParam, checkWriteAppAccess, async (c) => {
  if (getRuntimeKey() !== 'workerd') {
    return supabaseTusPatchHandler(c)
  }
  return uploadHandler(c)
})

app.route('/config', files_config)
app.route('/download_link', download_link)
app.route('/upload_link', upload_link)
app.route('/ok', ok)
