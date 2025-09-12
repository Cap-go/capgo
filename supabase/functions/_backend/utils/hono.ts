import type { Context } from 'hono'
import type { Bindings } from './cloudflare.ts'
import type { DeletePayload, InsertPayload, UpdatePayload } from './supabase.ts'
import type { Database } from './supabase.types.ts'
import { sentry } from '@hono/sentry'
import { getRuntimeKey } from 'hono/adapter'
import { cors } from 'hono/cors'
import { createFactory } from 'hono/factory'
import { HTTPException } from 'hono/http-exception'
import { logger } from 'hono/logger'
import { requestId } from 'hono/request-id'
import { Hono } from 'hono/tiny'
import { timingSafeEqual } from 'hono/utils/buffer'
import { cloudlog, cloudlogErr } from './loggin.ts'
import { onError } from './on_error.ts'

import { getEnv } from './utils.ts'

export interface AuthInfo {
  userId: string
  authType: 'apikey' | 'jwt'
  apikey: Database['public']['Tables']['apikeys']['Row'] | null
  jwt: string | null
}

export interface MiddlewareKeyVariables {
  Bindings: Bindings
  Variables: {
    apikey?: Database['public']['Tables']['apikeys']['Row']
    capgkey?: string
    requestId: string
    fileId?: string
    authorization?: string
    APISecret?: string
    auth?: AuthInfo
    subkey?: Database['public']['Tables']['apikeys']['Row']
    webhookBody?: any
    oldRecord?: any
  }
}

export const useCors = cors({
  origin: '*',
  allowHeaders: ['Content-Type', 'Authorization', 'capgkey', 'x-api-key', 'x-limited-key-id', 'apisecret', 'apikey', 'x-client-info'],
  allowMethods: ['POST', 'GET', 'OPTIONS'],
})

export const honoFactory = createFactory<MiddlewareKeyVariables>()

export function triggerValidator(
  table: keyof Database['public']['Tables'],
  type: 'DELETE' | 'INSERT' | 'UPDATE',
) {
  return honoFactory.createMiddleware(async (c, next) => {
    const body = await c.req.json<DeletePayload<typeof table> | InsertPayload<typeof table> | UpdatePayload<typeof table>>()

    if (body.table !== String(table)) {
      cloudlog({ requestId: c.get('requestId'), message: `Not ${String(table)}` })
      throw simpleError('table_not_match', 'Not table', { body })
    }

    if (body.type !== type) {
      cloudlog({ requestId: c.get('requestId'), message: `Not ${type}` })
      throw simpleError('type_not_match', 'Not type', { body })
    }

    // Store the validated body in context for next middleware
    if (body.type === 'DELETE' && body.old_record) {
      c.set('webhookBody', body.old_record)
    }
    else if (body.type === 'INSERT' && body.record) {
      c.set('webhookBody', body.record)
    }
    else if (body.type === 'UPDATE' && body.record) {
      c.set('webhookBody', body.record)
      c.set('oldRecord', body.old_record)
    }
    else {
      throw simpleError('invalid_payload', 'Invalid payload', { body })
    }

    await next()
  })
}

export async function getBodyOrQuery<T>(c: Context<MiddlewareKeyVariables, any, any>) {
  let body: T
  try {
    body = await c.req.json<T>()
  }
  catch {
    body = c.req.query() as unknown as T
    if (c.req.method === 'GET') {
      return body
    }
  }
  if (!body || Object.keys(body).length === 0) {
    cloudlog({ requestId: c.get('requestId'), message: 'Cannot find body', query: c.req.query() })
    throw simpleError('invalid_json_parse_body', 'Invalid JSON body')
  }
  if ((body as any).device_id) {
    (body as any).device_id = (body as any).device_id.toLowerCase()
  }
  return body
}

export const middlewareAuth = honoFactory.createMiddleware(async (c, next) => {
  const authorization = c.req.header('authorization')
  if (!authorization) {
    cloudlog({ requestId: c.get('requestId'), message: 'Cannot find authorization', query: c.req.query() })
    throw simpleError('cannot_find_authorization', 'Cannot find authorization')
  }
  c.set('authorization', authorization)
  await next()
})

export const middlewareAPISecret = honoFactory.createMiddleware(async (c, next) => {
  const authorizationSecret = c.req.header('apisecret')
  const API_SECRET = getEnv(c, 'API_SECRET')

  // timingSafeEqual is here to prevent a timing attack
  if (!authorizationSecret || !API_SECRET) {
    cloudlog({ requestId: c.get('requestId'), message: 'Cannot find authorizationSecret or API_SECRET', query: c.req.query() })
    throw simpleError('cannot_find_authorization_secret', 'Cannot find authorization')
  }
  if (!await timingSafeEqual(authorizationSecret, API_SECRET)) {
    cloudlog({ requestId: c.get('requestId'), message: 'Invalid API secret', query: c.req.query() })
    throw simpleError('invalid_api_secret', 'Invalid API secret')
  }
  c.set('APISecret', authorizationSecret)
  await next()
})

export const BRES = { status: 'ok' }

export function createHono(functionName: string, version: string, sentryDsn?: string) {
  let appGlobal
  if (getRuntimeKey() === 'deno') {
    appGlobal = new Hono<MiddlewareKeyVariables>().basePath(`/${functionName}`)
  }
  else {
    appGlobal = new Hono<MiddlewareKeyVariables>()
  }

  if (sentryDsn) {
    appGlobal.use('*', sentry({
      dsn: sentryDsn,
      release: version,
    }) as any)
  }

  appGlobal.use('*', logger())
  appGlobal.use('*', requestId())

  appGlobal.post('/ok', (c) => {
    return c.json(BRES)
  })
  appGlobal.post('/ko', (c) => {
    const defaultResponse: SimpleErrorResponse = {
      error: 'unknown_error',
      message: 'KO',
      moreInfo: {},
    }
    return c.json(defaultResponse, 500)
  })

  return appGlobal
}

export function createAllCatch(appGlobal: Hono<MiddlewareKeyVariables>, functionName: string) {
  appGlobal.all('*', (c) => {
    cloudlog({ requestId: c.get('requestId'), functionName, message: 'Not found', url: c.req.url })
    return c.json({ error: 'not_found', message: 'Not found' }, 404)
  })
  appGlobal.onError(onError(functionName))
}

export interface SimpleErrorResponse {
  error: string
  message: string
  cause?: any
  moreInfo?: any
}

export function simpleError200(c: Context, errorCode: string, message: string, moreInfo: any = {}) {
  const status = 200
  const res: SimpleErrorResponse = {
    error: errorCode,
    message,
    ...moreInfo,
  }
  cloudlog({ requestId: c.get('requestId'), message, errorCode, moreInfo })
  return c.json(res, status)
}

export function quickError(status: number, errorCode: string, message: string, moreInfo: any = {}, cause?: any) {
  const res: SimpleErrorResponse = {
    error: errorCode,
    message,
    moreInfo,
  }
  // Provide an Error message so logs aren't empty and include our code/message
  return new HTTPException(status as any, {
    res: new Response(JSON.stringify(res), { status }),
    message: `${errorCode}: ${message}`,
    cause,
  })
}

export function simpleError(errorCode: string, message: string, moreInfo: any = {}, cause?: any) {
  return quickError(400, errorCode, message, moreInfo, cause)
}

export function parseBody<T>(c: Context) {
  return c.req.json<T>()
    .catch((e) => {
      throw simpleError('invalid_json_parse_body', 'Invalid JSON body', { e })
    })
    .then((body) => {
      if ((body as any).device_id) {
        (body as any).device_id = (body as any).device_id.toLowerCase()
      }
      return body
    })
}

export function getIsV2(c: Context) {
  const isV2 = getRuntimeKey() === 'workerd' ? Number.parseFloat(getEnv(c, 'IS_V2') ?? '0') : 0.0
  cloudlog({ requestId: c.get('requestId'), message: 'isV2', isV2 })
  if (c.req.url.endsWith('_v2')) {
    // allow to force v2 for update_v2 or update_lite_v2 or stats_v2
    return true
  }
  if (isV2 && Math.random() < isV2) {
    return true
  }
  cloudlog({ requestId: c.get('requestId'), message: 'isV2 forced to false', isV2 })
  return false
}
