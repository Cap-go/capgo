import type { Context } from 'hono'
import type { AuthInfo } from './hono.ts'
import type { Database } from './supabase.types.ts'
import { honoFactory, quickError } from './hono.ts'
import { cloudlog } from './logging.ts'
import { checkKey, checkKeyById, supabaseAdmin, supabaseClient } from './supabase.ts'

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
    return quickError(401, 'invalid_apikey', 'Invalid apikey')
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
      return quickError(401, 'invalid_subkey', 'Invalid subkey')
    }
    if (subkey && subkey.user_id !== apikey.user_id) {
      cloudlog({ requestId: c.get('requestId'), message: 'Subkey user_id does not match apikey user_id', subkey, apikey })
      return quickError(401, 'invalid_subkey', 'Invalid subkey')
    }
    if (subkey?.limited_to_apps && subkey?.limited_to_apps.length === 0 && subkey?.limited_to_orgs && subkey?.limited_to_orgs.length === 0) {
      cloudlog({ requestId: c.get('requestId'), message: 'Invalid subkey, no limited apps or orgs', subkey })
      return quickError(401, 'invalid_subkey', 'Invalid subkey, no limited apps or orgs')
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
    return quickError(401, 'invalid_jwt', 'Invalid JWT')
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
      cloudlog({ requestId: c.get('requestId'), message: 'No apikey or subkey provided' })
      return quickError(401, 'no_jwt_apikey_or_subkey', 'No JWT, apikey or subkey provided')
    }
    await next()
  })
}

export function middlewareKey(rights: Database['public']['Enums']['key_mode'][]) {
  const subMiddlewareKey = honoFactory.createMiddleware(async (c, next) => {
    const capgkey_string = c.req.header('capgkey')
    const apikey_string = c.req.header('authorization')
    const subkey_id = c.req.header('x-limited-key-id') ? Number(c.req.header('x-limited-key-id')) : null
    const key = capgkey_string ?? apikey_string
    cloudlog({
      requestId: c.get('requestId'),
      message: 'middlewareKey - checking authorization',
      method: c.req.method,
      url: c.req.url,
      hasCapgkey: !!capgkey_string,
      hasAuthorization: !!apikey_string,
      hasKey: !!key,
    })
    if (!key) {
      cloudlog({ requestId: c.get('requestId'), message: 'No key provided', method: c.req.method, url: c.req.url })
      return quickError(401, 'no_key_provided', 'No key provided')
    }
    const apikey: Database['public']['Tables']['apikeys']['Row'] | null = await checkKey(c, key, supabaseAdmin(c), rights)
    if (!apikey) {
      cloudlog({ requestId: c.get('requestId'), message: 'Invalid apikey', key, method: c.req.method, url: c.req.url })
      return quickError(401, 'invalid_apikey', 'Invalid apikey')
    }
    c.set('apikey', apikey)
    c.set('capgkey', key)
    if (subkey_id) {
      const subkey: Database['public']['Tables']['apikeys']['Row'] | null = await checkKeyById(c, subkey_id, supabaseAdmin(c), rights)
      if (!subkey) {
        cloudlog({ requestId: c.get('requestId'), message: 'Invalid subkey', subkey_id })
        return quickError(401, 'invalid_subkey', 'Invalid subkey')
      }
      if (subkey?.limited_to_apps && subkey?.limited_to_apps.length === 0 && subkey?.limited_to_orgs && subkey?.limited_to_orgs.length === 0) {
        cloudlog({ requestId: c.get('requestId'), message: 'Invalid subkey, no limited apps or orgs', subkey })
        return quickError(401, 'invalid_subkey', 'Invalid subkey, no limited apps or orgs')
      }
      if (subkey)
        c.set('subkey', subkey)
    }
    await next()
  })
  return subMiddlewareKey
}
