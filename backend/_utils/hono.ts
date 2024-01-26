import type { Context, Next } from 'https://deno.land/x/hono/mod.ts'
import { checkKey } from './utils.ts'
import type { Database } from './supabase.types.ts'
import { supabaseAdmin } from './supabase.ts'

export const middlewareKey = async (c: Context, next: Next): Promise<void> => {
  const apikey_string = c.req.authorization
  const apikey: Database['public']['Tables']['apikeys']['Row'] | null = await checkKey(apikey_string, supabaseAdmin(), ['all', 'write'])
  if (!apikey)
    return c.res.status(400).send({ status: 'Invalid apikey' })
  c.apikey = apikey
  c.set('apikey', apikey)
  await next()
}

declare module 'hono' {
  interface ContextVariableMap {
    apikey: Database['public']['Tables']['apikeys']['Row']
  }
}
