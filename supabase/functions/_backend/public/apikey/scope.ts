import type { Context } from 'hono'
import type { AuthInfo, MiddlewareKeyVariables } from '../../utils/hono.ts'
import type { Database } from '../../utils/supabase.types.ts'
import { quickError } from '../../utils/hono.ts'
import { supabaseWithAuth } from '../../utils/supabase.ts'

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

export function ensureApiKeyManagementAllowed(
  c: Context<MiddlewareKeyVariables>,
  auth: AuthInfo,
  authApikey: ApiKeyRow | undefined,
  errorCode: string,
  moreInfo: Record<string, unknown> = {},
) {
  if (auth.authType !== 'jwt') {
    throw quickError(401, errorCode, 'API key management requires JWT', { ...moreInfo, apikeyId: authApikey?.id ?? auth.apikey?.id })
  }
}

export async function selectOwnedApiKeyByIdentifier<T = ApiKeyRow>(
  c: Context<MiddlewareKeyVariables>,
  auth: AuthInfo,
  id: string,
  columns = '*',
) {
  const query = supabaseWithAuth(c, auth)
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
  const query = supabaseWithAuth(c, auth)
    .from('apikeys')
    .delete()
    .eq('user_id', auth.userId)

  const filteredQuery = isNumericApiKeyId(id)
    ? query.eq('id', Number(id))
    : query.eq('key', id)

  return filteredQuery
}
