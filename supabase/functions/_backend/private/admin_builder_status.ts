import type { Context } from 'hono'
import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import { BRES, createHono, getEnv, simpleError, useCors } from '../utils/hono.ts'
import { middlewareAuth } from '../utils/hono_middleware.ts'
import { cloudlog, cloudlogErr } from '../utils/logging.ts'
import { supabaseClient } from '../utils/supabase.ts'
import { version } from '../utils/version.ts'

type AppContext = Context<MiddlewareKeyVariables, any, any>

async function verifyPlatformAdmin(c: AppContext): Promise<{ isAdmin: boolean, userId: string | null }> {
  const auth = c.get('auth')
  if (!auth || !auth.userId || auth.authType !== 'jwt' || !auth.jwt)
    return { isAdmin: false, userId: null }

  const userSupabase = supabaseClient(c, auth.jwt)
  const { data: isAdmin, error } = await userSupabase.rpc('is_platform_admin')
  if (error) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'admin_builder_status admin check failed', error })
    return { isAdmin: false, userId: auth.userId }
  }
  return { isAdmin: Boolean(isAdmin), userId: auth.userId }
}

async function fetchBuilder(c: AppContext, path: string, options?: { allowNonOk?: boolean }): Promise<unknown> {
  const builderUrl = getEnv(c, 'BUILDER_URL')?.replace(/\/+$/, '')
  const builderApiKey = getEnv(c, 'BUILDER_API_KEY')
  if (!builderUrl || !builderApiKey)
    throw simpleError('builder_not_configured', 'BUILDER_URL or BUILDER_API_KEY missing')

  const response = await fetch(`${builderUrl}${path}`, {
    headers: {
      'x-api-key': builderApiKey,
      'accept': 'application/json',
    },
  })
  const text = await response.text()
  let body: unknown = null
  try {
    body = text ? JSON.parse(text) : null
  }
  catch {
    body = { raw: text }
  }
  if (!response.ok && !options?.allowNonOk) {
    throw simpleError('builder_status_fetch_failed', `Builder ${path} failed`, {
      status: response.status,
      body,
    })
  }
  return body
}

export const app = createHono('', version)

app.use('*', useCors)

app.get('/', middlewareAuth(), async (c) => {
  const { isAdmin, userId } = await verifyPlatformAdmin(c)
  if (!isAdmin)
    throw simpleError('not_authorized', 'Not authorized', { userId })

  cloudlog({ requestId: c.get('requestId'), message: 'admin_builder_status', userId })

  const [ok, runnersPayload] = await Promise.all([
    fetchBuilder(c, '/ok', { allowNonOk: true }),
    fetchBuilder(c, '/gitlab-emulator/runners'),
  ])

  return c.json({
    ...BRES,
    ok,
    runners: runnersPayload,
  })
})
