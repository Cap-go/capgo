import type { Context } from 'hono'
import type { AuthInfo } from '../../utils/hono.ts'
import { type } from 'arktype'
import { safeParseSchema } from '../../utils/ark_validation.ts'
import { quickError, simpleError } from '../../utils/hono.ts'
import { apikeyHasOrgRightWithPolicy, hasOrgRightApikey, supabaseWithAuth } from '../../utils/supabase.ts'

const bodySchema = type({
  'orgId': 'string',
  'tableName?': 'string',
  'operation?': 'string',
  'page?': 'number | string.numeric.parse',
  'limit?': 'number | string.numeric.parse',
})

const auditLogSchema = type({
  id: 'number',
  created_at: 'string',
  table_name: 'string',
  record_id: 'string',
  operation: 'string',
  user_id: 'string | null',
  org_id: 'string',
  old_record: 'unknown',
  new_record: 'unknown',
  changed_fields: 'string[] | null',
})

const auditLogsSchema = auditLogSchema.array()

export async function getAuditLogs(c: Context, bodyRaw: any): Promise<Response> {
  const bodyParsed = safeParseSchema(bodySchema, bodyRaw)
  if (!bodyParsed.success) {
    throw simpleError('invalid_body', 'Invalid body', { error: bodyParsed.error })
  }
  const body = bodyParsed.data

  const auth = c.get('auth') as AuthInfo | undefined
  if (!auth?.userId) {
    throw simpleError('not_authorized', 'Not authorized')
  }

  const supabase = supabaseWithAuth(c, auth)
  if (auth.authType === 'apikey') {
    if (!auth.apikey) {
      throw simpleError('not_authorized', 'Not authorized')
    }

    // Enforce org scoping + API key policy (expiration) before checking user rights.
    const orgCheck = await apikeyHasOrgRightWithPolicy(c, auth.apikey, body.orgId, supabase)
    if (!orgCheck.valid) {
      if (orgCheck.error === 'org_requires_expiring_key') {
        throw quickError(401, 'org_requires_expiring_key', 'This organization requires API keys with an expiration date. Please use a different key or update this key with an expiration date.')
      }
      throw simpleError('invalid_org_id', 'You can\'t access this organization', { org_id: body.orgId })
    }

    // Separate check: API key scope is not enough; user must have super_admin rights.
    const capgkey = c.get('capgkey')
    if (!capgkey || typeof capgkey !== 'string') {
      throw simpleError('not_authorized', 'Not authorized')
    }
    const hasRight = await hasOrgRightApikey(c, body.orgId, auth.userId, 'super_admin', capgkey)
    if (!hasRight) {
      throw simpleError('invalid_org_id', 'You can\'t access this organization', { org_id: body.orgId })
    }
  }
  else {
    const { data: hasRight, error: rightsError } = await supabase.rpc('check_min_rights', {
      min_right: 'super_admin',
      org_id: body.orgId,
      user_id: auth.userId,
      channel_id: null as any,
      app_id: null as any,
    })

    // Validate org access (super_admin required by RLS)
    if (rightsError || !hasRight) {
      throw simpleError('invalid_org_id', 'You can\'t access this organization', { org_id: body.orgId })
    }
  }

  const limit = Math.min(body.limit ?? 50, 100)
  const page = body.page ?? 0
  const from = page * limit
  const to = (page + 1) * limit - 1

  let query = supabase
    .from('audit_logs')
    .select('*', { count: 'exact' })
    .eq('org_id', body.orgId)
    .order('created_at', { ascending: false })
    .range(from, to)

  // Apply optional filters
  if (body.tableName) {
    query = query.eq('table_name', body.tableName)
  }
  if (body.operation) {
    query = query.eq('operation', body.operation)
  }

  const { data, error, count } = await query

  if (error) {
    throw simpleError('cannot_get_audit_logs', 'Cannot get audit logs', { error })
  }

  const dataParsed = safeParseSchema(auditLogsSchema, data)
  if (!dataParsed.success) {
    throw simpleError('cannot_parse_audit_logs', 'Cannot parse audit logs', { error: dataParsed.error })
  }

  return c.json({
    data: dataParsed.data,
    total: count ?? 0,
    page,
    limit,
  })
}
