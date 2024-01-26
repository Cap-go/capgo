import { type Context, type Next, type MiddlewareHandler, HTTPException } from 'https://deno.land/x/hono@v3.12.7/mod.ts'
import { checkKey } from './utils.ts'
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

export const BRES = { status: 'ok'}
