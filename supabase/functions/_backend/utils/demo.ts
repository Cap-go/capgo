import type { Context } from 'hono'
import type { MiddlewareKeyVariables } from './hono.ts'
import { cloudlog } from './logging.ts'
import { closeClient, getPgClient } from './pg.ts'
import { supabaseAdmin } from './supabase.ts'

export function isDemoAppRow(app?: { need_onboarding?: boolean | null }): boolean {
  return app?.need_onboarding === true
}

export async function isDemoApp(c: Context<MiddlewareKeyVariables>, appId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin(c)
    .from('apps')
    .select('need_onboarding')
    .eq('app_id', appId)
    .maybeSingle()

  if (error) {
    cloudlog({ requestId: c.get('requestId'), message: 'Cannot load onboarding app flag', error, app_id: appId })
    throw error
  }

  if (!data) {
    return false
  }

  return isDemoAppRow(data)
}

export async function lockOnboardingApp(c: Context<MiddlewareKeyVariables>, appId: string) {
  const pgClient = getPgClient(c)

  try {
    await pgClient.query('SELECT pg_advisory_lock(hashtext($1))', [`onboarding-demo:${appId}`])
    return pgClient
  }
  catch (error) {
    closeClient(c, pgClient)
    cloudlog({ requestId: c.get('requestId'), message: 'Cannot acquire onboarding app lock', error, app_id: appId })
    throw error
  }
}

export async function unlockOnboardingApp(
  c: Context<MiddlewareKeyVariables>,
  pgClient: ReturnType<typeof getPgClient>,
  appId: string,
) {
  try {
    await pgClient.query('SELECT pg_advisory_unlock(hashtext($1))', [`onboarding-demo:${appId}`])
  }
  catch (error) {
    cloudlog({ requestId: c.get('requestId'), message: 'Cannot release onboarding app lock', error, app_id: appId })
  }
  finally {
    closeClient(c, pgClient)
  }
}
