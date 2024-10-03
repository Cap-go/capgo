import { HTTPException } from 'hono/http-exception'
import { Hono } from 'hono/tiny'
import type { Context, Next } from '@hono/hono'
import { parseUploadMetadata } from '../tus/parse.ts'
import { DEFAULT_RETRY_PARAMS, RetryBucket } from '../tus/retry.ts'
import { MAX_UPLOAD_LENGTH_BYTES, TUS_VERSION, X_CHECKSUM_SHA256 } from '../tus/uploadHandler.ts'
import { ALLOWED_HEADERS, ALLOWED_METHODS, EXPOSED_HEADERS, toBase64 } from '../tus/util.ts'
import { middlewareKey } from '../utils/hono.ts'
import { hasAppRight, supabaseAdmin } from '../utils/supabase.ts'

const DO_CALL_TIMEOUT = 1000 * 60 * 30 // 20 minutes

const ATTACHMENT_PREFIX = 'attachments'

export const app = new Hono()

app.options(`/upload/${ATTACHMENT_PREFIX}`, optionsHandler)
app.post(`/upload/${ATTACHMENT_PREFIX}`, middlewareKey(['all', 'write', 'upload']), setKeyFromMetadata, checkAppAccess, uploadHandler)

app.options(`/upload/${ATTACHMENT_PREFIX}/:id{.+}`, optionsHandler)
app.get(`/upload/${ATTACHMENT_PREFIX}/:id{.+}`, middlewareKey(['all', 'write', 'upload']), setKeyFromIdParam, checkAppAccess, getHandler)
// TODO: create a key system with DO to allow read only after a get returned it
app.get(`/read/${ATTACHMENT_PREFIX}/:id{.+}`, setKeyFromIdParam, validateTemporaryKey, getHandler)
app.patch(`/upload/${ATTACHMENT_PREFIX}/:id{.+}`, middlewareKey(['all', 'write', 'upload']), setKeyFromIdParam, checkAppAccess, uploadHandler)

app.all('*', (c) => {
  console.log('all upload_bundle', c.req.url)
  return c.json({ error: 'Not Found' }, 404)
})

async function getHandler(c: Context): Promise<Response> {
  const requestId = c.get('fileId')

  const bucket: R2Bucket = c.env.ATTACHMENT_BUCKET

  if (bucket == null) {
    console.log('getHandler upload_bundle', 'bucket is null')
    return c.json({ error: 'Not Found' }, 404)
  }

  let response = null
  // disable cache for now TODO: add it back when we understand why it doesn't give file tto download but text
  // // @ts-expect-error-next-line
  // const cache = caches.default
  // const cacheKey = new Request(new URL(c.req.url), c.req)
  // let response = await cache.match(cacheKey)
  // if (response != null) {
  //   return response
  // }

  const object = await new RetryBucket(bucket, DEFAULT_RETRY_PARAMS).get(requestId, {
    range: c.req.raw.headers,
  })
  if (object == null) {
    console.log('getHandler upload_bundle', 'object is null')
    return c.json({ error: 'Not Found' }, 404)
  }
  const headers = objectHeaders(object)
  if (object.range != null && c.req.header('range')) {
    headers.set('content-range', rangeHeader(object.size, object.range))
    response = new Response(object.body, { headers, status: 206 })
    return response
  }
  else {
    response = new Response(object.body, { headers })
    // c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()))
    return response
  }
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

function optionsHandler(c: Context): Response {
  console.log('optionsHandler upload_bundle', 'optionsHandler')
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
async function uploadHandler(c: Context): Promise<Response> {
  const requestId = c.get('fileId')
  // make requestId  safe
  console.log('upload_bundle req', 'uploadHandler', requestId, c.req.method, c.req.url)
  const durableObjNs: DurableObjectNamespace = c.env.ATTACHMENT_UPLOAD_HANDLER

  if (durableObjNs == null) {
    console.log('upload_bundle', 'durableObjNs is null')
    return c.json({ error: 'Invalid bucket configuration' }, 500)
  }

  const handler = durableObjNs.get(durableObjNs.idFromName(requestId))
  console.log({ requestId: c.get('requestId'), context: 'can handler' })
  return await handler.fetch(c.req.url, {
    body: c.req.raw.body,
    method: c.req.method,
    headers: c.req.raw.headers,
    signal: AbortSignal.timeout(DO_CALL_TIMEOUT),
  })
}

async function setKeyFromMetadata(c: Context, next: Next) {
  const fileId = parseUploadMetadata(c.req.raw.headers).filename
  if (fileId == null) {
    console.log({ requestId: c.get('requestId'), context: 'fileId is null' })
    return c.json({ error: 'Not Found' }, 404)
  }
  c.set('fileId', fileId)
  await next()
}

async function setKeyFromIdParam(c: Context, next: Next) {
  const fileId = c.req.param('id')
  if (fileId == null) {
    console.log({ requestId: c.get('requestId'), context: 'fileId is null' })
    return c.json({ error: 'Not Found' }, 404)
  }
  c.set('fileId', fileId)
  await next()
}

async function validateTemporaryKey(c: Context, next: Next) {
  const signKey = c.req.query('key')
  const versionID = c.req.query('versionID')
  const path = c.get('fileId')
  if (!signKey || !path) {
    console.log({ requestId: c.get('requestId'), context: 'Missing key or path' })
    return c.json({ error: 'Missing key or path' }, 400)
  }

  const durableObjNs: DurableObjectNamespace = c.env.TEMPORARY_KEY_HANDLER
  const handler = durableObjNs.get(durableObjNs.idFromName('temporary-keys'))

  const url = new URL(c.req.url)
  const response = await handler.fetch(`${url.protocol}//${url.host}/validate?key=${signKey}&versionID=${versionID}&path=${path}`)
  const { valid, error } = await response.json<{ valid: boolean, error?: string }>()

  if (!valid) {
    return c.json({ error: error || 'Invalid or expired key' }, 403)
  }

  await next()
}

async function checkAppAccess(c: Context, next: Next) {
  const requestId = c.get('fileId')
  const [orgs, owner_org, apps, app_id] = requestId.split('/')
  if (orgs !== 'orgs' || apps !== 'apps') {
    throw new HTTPException(400, { message: 'Invalid requestId' })
  }
  if (requestId.split('/').length < 5) {
    throw new HTTPException(400, { message: 'Invalid requestId' })
  }
  console.log('checkAppAccess', app_id, owner_org)
  const capgkey = c.get('capgkey')
  console.log({ requestId: c.get('requestId'), context: 'capgkey', capgkey })
  const { data: userId, error: _errorUserId } = await supabaseAdmin(c)
    .rpc('get_user_id', { apikey: capgkey, app_id })
  if (_errorUserId) {
    console.log({ requestId: c.get('requestId'), context: '_errorUserId', error: _errorUserId })
    throw new HTTPException(400, { message: 'Error User not found' })
  }

  if (!(await hasAppRight(c, app_id, userId, 'read'))) {
    console.log({ requestId: c.get('requestId'), context: 'no read' })
    throw new HTTPException(400, { message: 'You can\'t access this app' })
  }

  const { data: app, error: errorApp } = await supabaseAdmin(c)
    .from('apps')
    .select('app_id, owner_org')
    .eq('app_id', app_id)
    .single()
  if (errorApp) {
    console.log({ requestId: c.get('requestId'), context: 'errorApp', error: errorApp })
    throw new HTTPException(400, { message: 'Error App not found' })
  }
  if (app.owner_org !== owner_org) {
    console.log({ requestId: c.get('requestId'), context: 'owner_org' })
    throw new HTTPException(400, { message: 'You can\'t access this app' })
  }
  await next()
}
