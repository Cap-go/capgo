import type { Context, Next } from '@hono/hono'
import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import { getRuntimeKey } from 'hono/adapter'
import { HTTPException } from 'hono/http-exception'
import { Hono } from 'hono/tiny'
import { app as ok } from '../public/ok.ts'
import { parseUploadMetadata } from '../tus/parse.ts'
import { DEFAULT_RETRY_PARAMS, RetryBucket } from '../tus/retry.ts'
import { MAX_UPLOAD_LENGTH_BYTES, TUS_VERSION, X_CHECKSUM_SHA256 } from '../tus/uploadHandler.ts'
import { ALLOWED_HEADERS, ALLOWED_METHODS, EXPOSED_HEADERS, toBase64 } from '../tus/util.ts'
import { middlewareKey } from '../utils/hono.ts'
import { hasAppRightApikey, supabaseAdmin } from '../utils/supabase.ts'
import { backgroundTask } from '../utils/utils.ts'
import { app as download_link } from './download_link.ts'
import { app as files_config } from './files_config.ts'
import { app as upload_link } from './upload_link.ts'

const DO_CALL_TIMEOUT = 1000 * 60 * 30 // 20 minutes

const ATTACHMENT_PREFIX = 'attachments'

export const app = new Hono<MiddlewareKeyVariables>()

async function getHandler(c: Context): Promise<Response> {
  const requestId = c.get('fileId')
  // console.log('fileId', requestId)
  if (getRuntimeKey() !== 'workerd') {
    // serve file from supabase storage using they sdk
    const { data } = supabaseAdmin(c).storage.from('capgo').getPublicUrl(requestId)

    // console.log('publicUrl', data.publicUrl)
    const url = data.publicUrl.replace('http://kong:8000', 'http://localhost:54321')
    // console.log('url', url)
    return c.redirect(url)
  }

  const bucket: R2Bucket = c.env.ATTACHMENT_BUCKET

  if (bucket == null) {
    console.log('getHandler files', 'bucket is null')
    return c.json({ error: 'Not Found' }, 404)
  }

  // let response = null
  // disable cache for now TODO: add it back when we understand why it doesn't give file tto download but text
  // @ts-expect-error-next-line
  const cache = caches.default
  const cacheKey = new Request(new URL(c.req.url), c.req)
  let response = await cache.match(cacheKey)
  if (response != null) {
    console.log('getHandler files', 'cache hit')
    return response
  }

  const object = await new RetryBucket(bucket, DEFAULT_RETRY_PARAMS).get(requestId, {
    range: c.req.raw.headers,
  })
  if (object == null) {
    console.log('getHandler files', 'object is null')
    return c.json({ error: 'Not Found' }, 404)
  }
  const headers = objectHeaders(object)
  if (object.range != null && c.req.header('range')) {
    headers.set('content-range', rangeHeader(object.size, object.range))
    response = new Response(object.body, { headers, status: 206 })
    return response
  }
  else {
    headers.set('Content-Disposition', `attachment; filename="${object.key}"`)
    response = new Response(object.body, { headers })
    await backgroundTask(c, cache.put(cacheKey, response.clone()))
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

function optionsHandler(c: Context) {
  console.log('optionsHandler files', 'optionsHandler')
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
  // make requestId  safe
  console.log('files req', 'uploadHandler', requestId, c.req.method, c.req.url)
  const durableObjNs: DurableObjectNamespace = c.env.ATTACHMENT_UPLOAD_HANDLER

  if (durableObjNs == null) {
    console.log('files', 'durableObjNs is null')
    return c.json({ error: 'Invalid bucket configuration' }, 500)
  }

  const handler = durableObjNs.get(durableObjNs.idFromName(requestId))
  console.log({ requestId: c.get('requestId'), context: 'upload handler' })
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

async function checkWriteAppAccess(c: Context, next: Next) {
  const requestId = c.get('fileId') as string
  const [orgs, owner_org, apps, app_id] = requestId.split('/')
  if (orgs !== 'orgs' || apps !== 'apps') {
    throw new HTTPException(400, { message: 'Invalid requestId' })
  }
  if (requestId.split('/').length < 5) {
    throw new HTTPException(400, { message: 'Invalid requestId' })
  }
  console.log('checkWriteAppAccess', app_id, owner_org)
  const capgkey = c.get('capgkey') as string
  console.log({ requestId: c.get('requestId'), context: 'capgkey', capgkey })
  const { data: userId, error: _errorUserId } = await supabaseAdmin(c as any)
    .rpc('get_user_id', { apikey: capgkey, app_id })
  if (_errorUserId) {
    console.log({ requestId: c.get('requestId'), context: '_errorUserId', error: _errorUserId })
    throw new HTTPException(400, { message: 'Error User not found' })
  }

  if (!(await hasAppRightApikey(c as any, app_id, userId, 'read', capgkey))) {
    console.log({ requestId: c.get('requestId'), context: 'no read' })
    throw new HTTPException(400, { message: 'You can\'t access this app' })
  }

  const { data: app, error: errorApp } = await supabaseAdmin(c as any)
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

app.options(`/upload/${ATTACHMENT_PREFIX}`, optionsHandler as any)
app.post(`/upload/${ATTACHMENT_PREFIX}`, middlewareKey(['all', 'write', 'upload']), setKeyFromMetadata as any, checkWriteAppAccess as any, uploadHandler as any)

app.options(`/upload/${ATTACHMENT_PREFIX}/:id{.+}`, optionsHandler as any)
app.get(`/upload/${ATTACHMENT_PREFIX}/:id{.+}`, middlewareKey(['all', 'write', 'upload']), setKeyFromIdParam as any, checkWriteAppAccess as any, getHandler as any)
app.get(`/read/${ATTACHMENT_PREFIX}/:id{.+}`, setKeyFromIdParam as any, getHandler as any)
app.patch(`/upload/${ATTACHMENT_PREFIX}/:id{.+}`, middlewareKey(['all', 'write', 'upload']), setKeyFromIdParam as any, checkWriteAppAccess as any, uploadHandler as any)

app.route('/config', files_config)
app.route('/download_link', download_link)
app.route('/upload_link', upload_link)
app.route('/ok', ok)

app.all('*', (c) => {
  console.log('all files', c.req.url)
  return c.json({ error: 'Not Found' }, 404)
})
