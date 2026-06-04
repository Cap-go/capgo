import type { Context } from 'hono'
import type { AuthInfo, MiddlewareKeyVariables } from '../../utils/hono.ts'
import type { Database } from '../../utils/supabase.types.ts'
import { quickError } from '../../utils/hono.ts'
import { closeClient, getPgClient } from '../../utils/pg.ts'
import { supabaseAdmin, supabaseWithAuth } from '../../utils/supabase.ts'

type ApiKeyRow = Database['public']['Tables']['apikeys']['Row']

export function requireApiKeyManagementAuth(
  c: Context<MiddlewareKeyVariables>,
  errorCode: string,
  message: string,
  moreInfo: Record<string, unknown> = {},
): AuthInfo {
  const auth = c.get('auth') as AuthInfo | undefined
  if (!auth?.userId) {
    throw quickError(401, errorCode, message, moreInfo)
  }

  return auth
}

export function isValidApiKeyIdFormat(id: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  const numericRegex = /^\d+$/
  return uuidRegex.test(id) || numericRegex.test(id)
}

function isNumericApiKeyId(id: string): boolean {
  return /^\d+$/.test(id)
}

export async function ensureApiKeyManagementAllowed(
  c: Context<MiddlewareKeyVariables>,
  auth: AuthInfo,
  authApikey: ApiKeyRow | undefined,
  errorCode: string,
  moreInfo: Record<string, unknown> = {},
) {
  if (auth.authType === 'apikey' && !authApikey) {
    throw quickError(401, 'invalid_apikey', 'Invalid API key', moreInfo)
  }
  if (auth.authType === 'apikey' && await apiKeyHasLimitedScope(c, authApikey)) {
    throw quickError(401, errorCode, 'You cannot do that as a limited API key', { ...moreInfo, apikeyId: authApikey?.id })
  }
}

export function apiKeyOwnerDataClient(c: Context<MiddlewareKeyVariables>, auth: AuthInfo) {
  return auth.authType === 'apikey'
    ? supabaseAdmin(c)
    : supabaseWithAuth(c, auth)
}

export async function selectOwnedApiKeyByIdentifier<T = ApiKeyRow>(
  c: Context<MiddlewareKeyVariables>,
  auth: AuthInfo,
  id: string,
  columns = '*',
) {
  const query = apiKeyOwnerDataClient(c, auth)
    .from('apikeys')
    .select(columns)
    .eq('user_id', auth.userId)

  const filteredQuery = isNumericApiKeyId(id)
    ? query.eq('id', Number(id))
    : query.eq('key', id)

  const { data, error } = await filteredQuery.single()
  return { data: data as T | null, error }
}

export async function deleteOwnedApiKeyByIdentifier(c: Context<MiddlewareKeyVariables>, auth: AuthInfo, id: string) {
  const query = apiKeyOwnerDataClient(c, auth)
    .from('apikeys')
    .delete()
    .eq('user_id', auth.userId)

  const filteredQuery = isNumericApiKeyId(id)
    ? query.eq('id', Number(id))
    : query.eq('key', id)

  return filteredQuery
}

export async function apiKeyHasLimitedScope(c: Context<MiddlewareKeyVariables>, apikey: ApiKeyRow | undefined) {
  if (!apikey)
    return false

  if (!apikey.rbac_id)
    return false

  const pgClient = getPgClient(c)
  try {
    const result = await pgClient.query<{ is_limited: boolean }>(
      `
      WITH user_orgs AS (
        SELECT rb.org_id
        FROM public.role_bindings rb
        WHERE rb.principal_type = public.rbac_principal_user()
          AND rb.principal_id = $1::uuid
          AND rb.org_id IS NOT NULL
          AND (rb.expires_at IS NULL OR rb.expires_at > now())

        UNION

        SELECT g.org_id
        FROM public.group_members gm
        INNER JOIN public.groups g ON g.id = gm.group_id
        INNER JOIN public.role_bindings rb
          ON rb.principal_type = public.rbac_principal_group()
          AND rb.principal_id = gm.group_id
          AND rb.org_id = g.org_id
        WHERE gm.user_id = $1::uuid
          AND rb.org_id IS NOT NULL
          AND (rb.expires_at IS NULL OR rb.expires_at > now())
      ),
      active_bindings AS (
        SELECT rb.scope_type, rb.org_id, r.name AS role_name
        FROM public.role_bindings rb
        INNER JOIN public.roles r ON r.id = rb.role_id
        WHERE rb.principal_type = public.rbac_principal_apikey()
          AND rb.principal_id = $2::uuid
          AND (rb.expires_at IS NULL OR rb.expires_at > now())
      )
      SELECT (
        EXISTS (
          SELECT 1
          FROM active_bindings
          WHERE scope_type <> public.rbac_scope_org()
        )
        OR EXISTS (
          SELECT 1
          FROM user_orgs u
          WHERE NOT EXISTS (
            SELECT 1
            FROM active_bindings b
            WHERE b.scope_type = public.rbac_scope_org()
              AND b.org_id = u.org_id
              AND b.role_name IN (public.rbac_role_org_super_admin(), public.rbac_role_org_admin())
          )
        )
        OR NOT EXISTS (
          SELECT 1
          FROM active_bindings b
          WHERE b.scope_type = public.rbac_scope_org()
            AND b.role_name IN (public.rbac_role_org_super_admin(), public.rbac_role_org_admin())
        )
      ) AS is_limited
      `,
      [apikey.user_id, apikey.rbac_id],
    )

    return result.rows[0]?.is_limited ?? true
  }
  finally {
    await closeClient(c, pgClient)
  }
}
