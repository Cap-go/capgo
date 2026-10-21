import type { Context } from 'hono'
import type { MiddlewareKeyVariables } from '../../utils/hono.ts'
import { sql } from 'drizzle-orm'
import { lockAppOnboardingForWrite, retryAppOnboardingWrite } from '../../utils/appOnboardingWriteLock.ts'
import { enableBuilderChecklist, UnsupportedBuilderOnboardingVersion } from '../../utils/enableBuilderOnboarding.ts'
import { quickError } from '../../utils/hono.ts'
import { closeClient, getDrizzleClient, getPgClient } from '../../utils/pg.ts'
import { checkPermission, checkPermissionPg } from '../../utils/rbac.ts'
import { isValidAppId } from '../../utils/utils.ts'

export async function enableBuilderOnboarding(c: Context<MiddlewareKeyVariables>, appId: string) {
  if (!isValidAppId(appId))
    throw quickError(400, 'invalid_app_id', 'Invalid app ID')
  if (!(await checkPermission(c, 'app.update_settings', { appId })))
    throw quickError(403, 'cannot_access_app', 'You cannot update this app')

  const pool = await getPgClient(c)
  try {
    const onboarding = await retryAppOnboardingWrite(getDrizzleClient(pool, { logger: false }), async (tx) => {
      const current = await lockAppOnboardingForWrite(tx, appId)
      if (!current)
        throw quickError(404, 'app_not_found', 'App not found')
      const auth = c.get('auth')!
      // Serialize with RBAC revocation and concurrent CLI progress writes, then
      // recheck permission against the locked app's current organization.
      if (!(await checkPermissionPg(c, 'app.update_settings', { appId }, tx, auth.userId, auth.apikey?.key ?? c.get('capgkey') ?? null)))
        throw quickError(403, 'cannot_access_app', 'You cannot update this app')
      const next = enableBuilderChecklist(current.onboarding)
      await tx.execute(sql`
        UPDATE public.apps SET onboarding = ${JSON.stringify(next)}::jsonb
        WHERE app_id = ${appId} AND onboarding IS DISTINCT FROM ${JSON.stringify(next)}::jsonb
      `)
      return next
    })
    c.header('Cache-Control', 'no-store')
    return c.json({ onboarding })
  }
  catch (error) {
    if (error instanceof UnsupportedBuilderOnboardingVersion)
      throw quickError(409, 'unsupported_onboarding_version', 'This checklist version is not supported')
    throw error
  }
  finally {
    closeClient(c, pool)
  }
}
