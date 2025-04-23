import type { Context } from '@hono/hono'
import type { Bindings } from './cloudflare.ts'
import type { Database } from './supabase.types.ts'
import { cors } from 'hono/cors'
import { createFactory, createMiddleware } from 'hono/factory'
import { HTTPException } from 'hono/http-exception'
import { timingSafeEqual } from 'hono/utils/buffer'
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

export function middlewareV2(rights: Database['public']['Enums']['key_mode'][]) {
  return createMiddleware(async (c, next) => {
    let jwt = c.req.header('authorization')
    let capgkey_string = c.req.header('capgkey') || c.req.header('x-api-key')
    const subkey_id = c.req.header('x-limited-key-id') ? Number(c.req.header('x-limited-key-id')) : null

    // make sure jwt is valid otherwise it means it was an apikey and you need to set it in capgkey_string
    // if jwt is uuid, it means it was an apikey and you need to set it in capgkey_string
    if (jwt && isUUID(jwt)) {
      console.log('Setting apikey in capgkey_string', jwt)
      capgkey_string = jwt
      jwt = undefined
    }
    if (jwt) {
      console.log('JWT provided', jwt)
      const supabaseJWT = supabaseClient(c as any, jwt)
      const { data: user, error: userError } = await supabaseJWT.auth.getUser()
      if (userError) {
        console.log('Invalid JWT', userError)
        throw new HTTPException(401, { message: 'Invalid JWT' })
      }
      c.set('auth', {
        userId: user.user?.id,
        authType: 'jwt',
      } as AuthInfo)
    }
    else if (capgkey_string) {
      console.log('Capgkey provided', capgkey_string)
      const apikey: Database['public']['Tables']['apikeys']['Row'] | null = await checkKey(c as any, capgkey_string, supabaseAdmin(c as any), rights)
      if (!apikey) {
        console.log('Invalid apikey', capgkey_string, rights)
        throw new HTTPException(401, { message: 'Invalid apikey' })
      }
      c.set('auth', {
        userId: apikey.user_id,
        authType: 'apikey',
        apikey,
      } as AuthInfo)
      c.set('apikey', apikey)
      if (subkey_id) {
        console.log('Subkey id provided', subkey_id)
        const subkey: Database['public']['Tables']['apikeys']['Row'] | null = await checkKeyById(c as any, subkey_id, supabaseAdmin(c as any), rights)
        console.log('Subkey', subkey)
        if (!subkey && subkey_id) {
          console.log('Invalid subkey', subkey_id)
          throw new HTTPException(401, { message: 'Invalid subkey' })
        }
        if (subkey && subkey.user_id !== apikey.user_id) {
          console.log('Subkey user_id does not match apikey user_id', subkey, apikey)
          throw new HTTPException(401, { message: 'Invalid subkey' })
        }
        if (subkey && subkey.limited_to_apps && subkey.limited_to_apps.length === 0 && subkey.limited_to_orgs && subkey.limited_to_orgs.length === 0) {
          console.log('Invalid subkey, no limited apps or orgs', subkey)
          throw new HTTPException(401, { message: 'Invalid subkey, no limited apps or orgs' })
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
    else {
      console.log('No apikey or subkey provided')
      throw new HTTPException(401, { message: 'No apikey or subkey provided' })
    }
    await next()
  })
}

export function middlewareKey(rights: Database['public']['Enums']['key_mode'][]) {
  const subMiddlewareKey = createMiddleware(async (c, next) => {
    const capgkey_string = c.req.header('capgkey')
    const apikey_string = c.req.header('authorization')
    const subkey_id = c.req.header('x-limited-key-id') ? Number(c.req.header('x-limited-key-id')) : null
    const key = capgkey_string || apikey_string
    if (!key) {
      console.log('No key provided')
      throw new HTTPException(401, { message: 'No key provided' })
    }
    const apikey: Database['public']['Tables']['apikeys']['Row'] | null = await checkKey(c as any, key, supabaseAdmin(c as any), rights)
    if (!apikey) {
      console.log('Invalid apikey', key)
      throw new HTTPException(401, { message: 'Invalid apikey' })
    }
    c.set('apikey', apikey)
    c.set('capgkey', key)
    if (subkey_id) {
      const subkey: Database['public']['Tables']['apikeys']['Row'] | null = await checkKeyById(c as any, subkey_id, supabaseAdmin(c as any), rights)
      if (!subkey && subkey_id) {
        console.log('Invalid subkey', subkey_id)
        throw new HTTPException(401, { message: 'Invalid subkey' })
      }
      if (subkey && subkey.limited_to_apps && subkey.limited_to_apps.length === 0 && subkey.limited_to_orgs && subkey.limited_to_orgs.length === 0) {
        console.log('Invalid subkey, no limited apps or orgs', subkey)
        throw new HTTPException(401, { message: 'Invalid subkey, no limited apps or orgs' })
      }
      if (subkey)
        c.set('subkey', subkey)
    }
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
  if (!body) {
    console.log('Cannot find body', c.req.query())
    throw new HTTPException(400, { message: 'Cannot find body' })
  }
  return body
}

export const middlewareAuth = createMiddleware(async (c, next) => {
  const authorization = c.req.header('authorization')
  if (!authorization) {
    console.log('Cannot find authorization', c.req.query())
    throw new HTTPException(400, { message: 'Cannot find authorization' })
  }
  c.set('authorization', authorization)
  await next()
})

export const middlewareAPISecret = createMiddleware(async (c, next) => {
  const authorizationSecret = c.req.header('apisecret')
  const API_SECRET = getEnv(c as any, 'API_SECRET')

  // timingSafeEqual is here to prevent a timing attack
  if (!authorizationSecret || !API_SECRET) {
    console.log('Cannot find authorizationSecret or API_SECRET', c.req.query())
    throw new HTTPException(400, { message: 'Cannot find authorization' })
  }
  if (!await timingSafeEqual(authorizationSecret, API_SECRET)) {
    console.log('Invalid API secret', c.req.query())
    throw new HTTPException(400, { message: 'Invalid API secret' })
  }
  c.set('APISecret', authorizationSecret)
  await next()
})

export const BRES = { status: 'ok' }
