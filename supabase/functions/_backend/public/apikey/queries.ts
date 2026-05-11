import type { Context } from 'hono'
import type { MiddlewareKeyVariables } from '../../utils/hono.ts'
import { supabaseAdmin } from '../../utils/supabase.ts'

export function selectOwnedApikeys(c: Context<MiddlewareKeyVariables>, userId: string) {
  return supabaseAdmin(c)
    .from('apikeys')
    .select('*')
    .eq('user_id', userId)
}
