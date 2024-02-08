import type { Context, MiddlewareHandler, Next } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { checkKey, getEnv } from './utils.ts'
import type { Database } from './supabase.types.ts'
import { supabaseAdmin } from './supabase.ts'
import { cors } from 'hono/cors'

export const useCors = cors({
  origin: '*',
  allowHeaders: ['*'],
  allowMethods: ['POST', 'GET', 'OPTIONS'],
})

export const middlewareKey: MiddlewareHandler<{
  Variables: {
    apikey: Database['public']['Tables']['apikeys']['Row'] | null
  }
}> = async (c: Context, next: Next) => {
  const capgkey_string = c.req.header('capgkey')
  const apikey_string = c.req.header('authorization')
  const key = capgkey_string || apikey_string
  const apikey: Database['public']['Tables']['apikeys']['Row'] | null = await checkKey(key, supabaseAdmin(c), ['all', 'write'])
  if (!apikey)
    throw new HTTPException(400, { message: 'Invalid apikey', key })
  c.set('apikey', apikey)
  await next()
}

export async function getBody<T>(c: Context) {
  let body: T
  try {
    body = await c.req.json<T>()
  }
  catch (e) {
    body = await c.req.query() as any as T
  }
  if (!body)
    throw new HTTPException(400, { message: 'Cannot find body' })
  return body
}

export const middlewareAuth: MiddlewareHandler<{
  Variables: {
    authorization: string
  }
}> = async (c: Context, next: Next) => {
  const authorization = c.req.header('authorization')
  if (!authorization)
    throw new HTTPException(400, { message: 'Cannot find authorization' })
  c.set('authorization', authorization)
  await next()
}

export const middlewareAPISecret: MiddlewareHandler<{
  Variables: {
    APISecret: string
  }
}> = async (c: Context, next: Next) => {
  const authorizationSecret = c.req.header('apisecret')
  const API_SECRET = getEnv(c, 'API_SECRET')
  if (!authorizationSecret || !API_SECRET || authorizationSecret !== API_SECRET)
    throw new HTTPException(400, { message: 'Cannot find authorization' })
  c.set('APISecret', authorizationSecret)
  await next()
}

export const BRES = { status: 'ok' }
