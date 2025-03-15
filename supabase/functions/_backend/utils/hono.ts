import type { Context } from '@hono/hono'
import type { Bindings } from './cloudflare.ts'
import type { Database } from './supabase.types.ts'
import { cors } from 'hono/cors'
import { createFactory, createMiddleware } from 'hono/factory'
import { HTTPException } from 'hono/http-exception'
import { timingSafeEqual } from 'hono/utils/buffer'
import { checkKey, getEnv } from './utils.ts'

export const useCors = cors({
  origin: '*',
  allowHeaders: ['*'],
  allowMethods: ['POST', 'GET', 'OPTIONS'],
})

export interface AuthInfo {
  userId: string
  authType: 'apikey' | 'jwt'
  apikey: Database['public']['Tables']['apikeys']['Row'] | null
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
  }
}

export const honoFactory = createFactory<MiddlewareKeyVariables>()

export function middlewareKey(rights: Database['public']['Enums']['key_mode'][]) {
  const subMiddlewareKey = createMiddleware(async (c, next) => {
    const capgkey_string = c.req.header('capgkey')
    const apikey_string = c.req.header('authorization')
    const key = capgkey_string || apikey_string
    if (!key)
      throw new HTTPException(401, { message: 'Invalid apikey' })
    const apikey: Database['public']['Tables']['apikeys']['Row'] | null = await checkKey(c as any, key, rights)
    if (!apikey)
      throw new HTTPException(401, { message: 'Invalid apikey' })
    c.set('apikey', apikey)
    c.set('capgkey', key)
    await next()
  })
  return subMiddlewareKey
}

export async function getBody<T>(c: Context<MiddlewareKeyVariables, '/' | '/:path*'>) {
  let body: T
  try {
    body = await c.req.json<T>()
  }
  catch (error) {
    console.error(error)
    body = c.req.query() as any as T
  }
  if (!body)
    throw new HTTPException(400, { message: 'Cannot find body' })
  return body
}

export const middlewareAuth = createMiddleware(async (c, next) => {
  const authorization = c.req.header('authorization')
  if (!authorization)
    throw new HTTPException(400, { message: 'Cannot find authorization' })
  c.set('authorization', authorization)
  await next()
})

export const middlewareAPISecret = createMiddleware(async (c, next) => {
  const authorizationSecret = c.req.header('apisecret')
  const API_SECRET = getEnv(c as any, 'API_SECRET')

  // timingSafeEqual is here to prevent a timing attack
  if (!authorizationSecret || !API_SECRET)
    throw new HTTPException(400, { message: 'Cannot find authorization' })
  if (!await timingSafeEqual(authorizationSecret, API_SECRET))
    throw new HTTPException(400, { message: 'Invalid API secret' })
  c.set('APISecret', authorizationSecret)
  await next()
})

export const BRES = { status: 'ok' }
