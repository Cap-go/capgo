import type { Context } from 'hono'
import type Stripe from 'stripe'
import type { Bindings } from './cloudflare.ts'
import type { StripeData } from './stripe.ts'
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
import { cloudlog } from './loggin.ts'
import { cloudlogErr } from './loggin.ts'
import { onError } from './on_error.ts'
import { extractDataEvent, parseStripeEvent } from './stripe_event.ts'
import { supabaseAdmin, supabaseClient } from './supabase.ts'
import { checkKey, checkKeyById, getEnv } from './utils.ts'

export const useCors = cors({
  origin: '*',
  allowHeaders: ['*'],
  allowMethods: ['POST', 'GET', 'OPTIONS'],
})

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
    stripeEvent?: Stripe.Event
    stripeData?: StripeData
  }
}

export const honoFactory = createFactory<MiddlewareKeyVariables>()

// TODO: make universal middleware who
//  Accept authorization header (JWT)
//  Accept capgkey header (legacy apikey header name for CLI)
//  Accept x-api-key header (new apikey header name for CLI + public api)
//  Accept x-limited-key-id header (subkey id, for whitelabel api, only work in combination with x-api-key)
// It takes rights as an argument, so it can be used in public and private api
// It sets apikey, capgkey, subkey to the context
// It throws an error if the apikey is invalid
// It throws an error if the subkey is invalid
// It throws an error if the apikey is invalid and the subkey is invalid
// It throws an error if the apikey is invalid and the subkey is invalid
// It throws an error if no apikey or subkey is provided
// It throws an error if the rights are invalid

function isUUID(str: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str)
}

async function foundAPIKey(c: Context, capgkeyString: string, rights: Database['public']['Enums']['key_mode'][]) {
  const subkey_id = c.req.header('x-limited-key-id') ? Number(c.req.header('x-limited-key-id')) : null

  cloudlog({ requestId: c.get('requestId'), message: 'Capgkey provided', capgkeyString })
  const apikey: Database['public']['Tables']['apikeys']['Row'] | null = await checkKey(c, capgkeyString, supabaseAdmin(c), rights)
  if (!apikey) {
    cloudlog({ requestId: c.get('requestId'), message: 'Invalid apikey', capgkeyString, rights })
    throw quickError(401, 'invalid_apikey', 'Invalid apikey')
  }
  c.set('auth', {
    userId: apikey.user_id,
    authType: 'apikey',
    apikey,
  } as AuthInfo)
  c.set('apikey', apikey)
  if (subkey_id) {
    cloudlog({ requestId: c.get('requestId'), message: 'Subkey id provided', subkey_id })
    const subkey: Database['public']['Tables']['apikeys']['Row'] | null = await checkKeyById(c, subkey_id, supabaseAdmin(c), rights)
    cloudlog({ requestId: c.get('requestId'), message: 'Subkey', subkey })
    if (!subkey) {
      cloudlog({ requestId: c.get('requestId'), message: 'Invalid subkey', subkey_id })
      throw quickError(401, 'invalid_subkey', 'Invalid subkey')
    }
    if (subkey && subkey.user_id !== apikey.user_id) {
      cloudlog({ requestId: c.get('requestId'), message: 'Subkey user_id does not match apikey user_id', subkey, apikey })
      throw quickError(401, 'invalid_subkey', 'Invalid subkey')
    }
    if (subkey?.limited_to_apps && subkey?.limited_to_apps.length === 0 && subkey?.limited_to_orgs && subkey?.limited_to_orgs.length === 0) {
      cloudlog({ requestId: c.get('requestId'), message: 'Invalid subkey, no limited apps or orgs', subkey })
      throw quickError(401, 'invalid_subkey', 'Invalid subkey, no limited apps or orgs')
    }
    if (subkey) {
      c.set('auth', {
        userId: apikey.user_id,
        authType: 'apikey',
        apikey: subkey,
      } as AuthInfo)
      c.set('subkey', subkey)
    }
  }
}

async function foundJWT(c: Context, jwt: string) {
  cloudlog({ requestId: c.get('requestId'), message: 'JWT provided', jwt })
  const supabaseJWT = supabaseClient(c, jwt)
  const { data: user, error: userError } = await supabaseJWT.auth.getUser()
  if (userError) {
    cloudlog({ requestId: c.get('requestId'), message: 'Invalid JWT', userError })
    throw quickError(401, 'invalid_jwt', 'Invalid JWT')
  }
  c.set('auth', {
    userId: user.user?.id,
    authType: 'jwt',
    jwt,
  } as AuthInfo)
}

export function middlewareV2(rights: Database['public']['Enums']['key_mode'][]) {
  return honoFactory.createMiddleware(async (c, next) => {
    let jwt = c.req.header('authorization')
    let capgkey = c.req.header('capgkey') ?? c.req.header('x-api-key')

    // make sure jwt is valid otherwise it means it was an apikey and you need to set it in capgkey_string
    // if jwt is uuid, it means it was an apikey and you need to set it in capgkey_string
    if (jwt && isUUID(jwt)) {
      cloudlog({ requestId: c.get('requestId'), message: 'Setting apikey in capgkey_string', jwt })
      capgkey = jwt
      jwt = undefined
    }
    if (jwt) {
      await foundJWT(c, jwt)
    }
    else if (capgkey) {
      await foundAPIKey(c, capgkey, rights)
    }
    else {
      cloudlog('No apikey or subkey provided')
      throw quickError(401, 'no_jwt_apikey_or_subkey', 'No JWT, apikey or subkey provided')
    }
    await next()
  })
}

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

export function middlewareStripeWebhook() {
  return honoFactory.createMiddleware(async (c, next) => {
    if (!getEnv(c, 'STRIPE_WEBHOOK_SECRET') || !getEnv(c, 'STRIPE_SECRET_KEY')) {
      cloudlog({ requestId: c.get('requestId'), message: 'Webhook Error: no secret found' })
      throw simpleError('webhook_error_no_secret', 'Webhook Error: no secret found')
    }

    const signature = c.req.raw.headers.get('stripe-signature')
    if (!signature || !getEnv(c, 'STRIPE_WEBHOOK_SECRET') || !getEnv(c, 'STRIPE_SECRET_KEY')) {
      cloudlog({ requestId: c.get('requestId'), message: 'Webhook Error: no signature' })
      throw simpleError('webhook_error_no_signature', 'Webhook Error: no signature')
    }
    const body = await c.req.text()
    const stripeEvent = await parseStripeEvent(c, body, signature!)
    const stripeDataEvent = extractDataEvent(c, stripeEvent)
    const stripeData = stripeDataEvent.data
    if (stripeData.customer_id === '') {
      cloudlog({ requestId: c.get('requestId'), message: 'Webhook Error: no customer found' })
      throw simpleError('webhook_error_no_customer', 'Webhook Error: no customer found')
    }
    c.set('stripeEvent', stripeEvent)
    c.set('stripeData', stripeDataEvent)
    await next()
  })
}

export function middlewareKey(rights: Database['public']['Enums']['key_mode'][]) {
  const subMiddlewareKey = honoFactory.createMiddleware(async (c, next) => {
    const capgkey_string = c.req.header('capgkey')
    const apikey_string = c.req.header('authorization')
    const subkey_id = c.req.header('x-limited-key-id') ? Number(c.req.header('x-limited-key-id')) : null
    const key = capgkey_string ?? apikey_string
    if (!key) {
      cloudlog('No key provided')
      throw quickError(401, 'no_key_provided', 'No key provided')
    }
    const apikey: Database['public']['Tables']['apikeys']['Row'] | null = await checkKey(c, key, supabaseAdmin(c), rights)
    if (!apikey) {
      cloudlog({ requestId: c.get('requestId'), message: 'Invalid apikey', key })
      throw quickError(401, 'invalid_apikey', 'Invalid apikey')
    }
    c.set('apikey', apikey)
    c.set('capgkey', key)
    if (subkey_id) {
      const subkey: Database['public']['Tables']['apikeys']['Row'] | null = await checkKeyById(c, subkey_id, supabaseAdmin(c), rights)
      if (!subkey) {
        cloudlog({ requestId: c.get('requestId'), message: 'Invalid subkey', subkey_id })
        throw quickError(401, 'invalid_subkey', 'Invalid subkey')
      }
      if (subkey?.limited_to_apps && subkey?.limited_to_apps.length === 0 && subkey?.limited_to_orgs && subkey?.limited_to_orgs.length === 0) {
        cloudlog({ requestId: c.get('requestId'), message: 'Invalid subkey, no limited apps or orgs', subkey })
        throw quickError(401, 'invalid_subkey', 'Invalid subkey, no limited apps or orgs')
      }
      if (subkey)
        c.set('subkey', subkey)
    }
    await next()
  })
  return subMiddlewareKey
}

export async function getBody<T>(c: Context<MiddlewareKeyVariables, any, any>) {
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
  cloudlogErr({ requestId: c.get('requestId'), message, errorCode, moreInfo })
  return c.json(res, status)
}

export function quickError(status: number, errorCode: string, message: string, moreInfo: any = {}, cause?: any) {
  // const safeCause = cause ? JSON.stringify(cause, Object.getOwnPropertyNames(cause)) : undefined
  const res: SimpleErrorResponse = {
    error: errorCode,
    message,
    moreInfo,
    // cause: safeCause,
  }
  console.log('res of simpleError', res)
  return new HTTPException(status as any, { res: new Response(JSON.stringify(res), { status }) }, cause)
}

export function simpleError(errorCode: string, message: string, moreInfo: any = {}, cause?: any) {
  return quickError(400, errorCode, message, moreInfo, cause)
}
