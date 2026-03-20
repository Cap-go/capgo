import type { Context } from 'hono'
import type { MiddlewareKeyVariables } from './hono.ts'
import { supabaseAdmin } from './supabase.ts'

export function isDemoAppRow(app?: { need_onboarding?: boolean | null }): boolean {
  return app?.need_onboarding === true
}

export async function isDemoApp(c: Context<MiddlewareKeyVariables>, appId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin(c)
    .from('apps')
    .select('need_onboarding')
    .eq('app_id', appId)
    .single()

  if (error || !data) {
    return false
  }

  return isDemoAppRow(data)
}
