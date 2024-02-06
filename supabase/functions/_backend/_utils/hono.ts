
import { type Context, type Next, type MiddlewareHandler } from 'hono'
import { HTTPException} from 'hono/http-exception'
import { checkKey, getEnv } from './utils.ts'
import type { Database } from './supabase.types.ts'
import { supabaseAdmin } from './supabase.ts'

export const middlewareKey: MiddlewareHandler<{
  Variables: {
    apikey: Database['public']['Tables']['apikeys']['Row'] | null
  }
}> = async (c: Context, next: Next) => {
  const apikey_string = c.req.header('authorization')
  const apikey: Database['public']['Tables']['apikeys']['Row'] | null = await checkKey(apikey_string, supabaseAdmin(c), ['all', 'write'])
  if (!apikey)
    throw new HTTPException(400, { message: 'Invalid apikey' })
  c.set('apikey', apikey)
  await next()
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

export const BRES = { status: 'ok'}
