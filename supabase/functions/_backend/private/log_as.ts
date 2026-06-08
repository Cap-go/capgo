import type { Context } from 'hono'
import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import { type } from 'arktype'
import { Hono } from 'hono/tiny'
import { safeParseSchema } from '../utils/ark_validation.ts'
import { middlewareAuth, parseBody, simpleError, useCors } from '../utils/hono.ts'
import { closeClient, getPgClient } from '../utils/pg.ts'
import { emptySupabase, supabaseAdmin as useSupabaseAdmin, supabaseClient as useSupabaseClient } from '../utils/supabase.ts'

export const bodySchema = type({
  'user_id?': 'string',
  'email?': 'string',
  'org_id?': 'string',
  'identifier?': 'string',
})

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+$/

export type LogAsBody = {
  user_id?: string
  email?: string
  org_id?: string
  identifier?: string
}

export type LogAsIdentifier =
  | { kind: 'user_id', value: string }
  | { kind: 'email', value: string }
  | { kind: 'org_id', value: string }
  | { kind: 'identifier', value: string }

type SupabaseAdmin = Awaited<ReturnType<typeof useSupabaseAdmin>>

function normalizeIdentifierValue(value: string | undefined): string | null {
  const normalized = value?.trim()
  return normalized ? normalized : null
}

function assertUuid(value: string, field: string) {
  if (!UUID_REGEX.test(value))
    throw simpleError('invalid_identifier', `${field} must be a valid UUID`, { field })
}

function assertEmail(value: string) {
  if (!EMAIL_REGEX.test(value))
    throw simpleError('invalid_identifier', 'email must be a valid email address')
}

export function resolveLogAsIdentifier(body: LogAsBody): LogAsIdentifier {
  const identifiers: LogAsIdentifier[] = []

  const userId = normalizeIdentifierValue(body.user_id)
  if (userId) {
    assertUuid(userId, 'user_id')
    identifiers.push({ kind: 'user_id', value: userId })
  }

  const email = normalizeIdentifierValue(body.email)
  if (email) {
    assertEmail(email)
    identifiers.push({ kind: 'email', value: email.toLowerCase() })
  }

  const orgId = normalizeIdentifierValue(body.org_id)
  if (orgId) {
    assertUuid(orgId, 'org_id')
    identifiers.push({ kind: 'org_id', value: orgId })
  }

  const identifier = normalizeIdentifierValue(body.identifier)
  if (identifier) {
    if (!UUID_REGEX.test(identifier) && !EMAIL_REGEX.test(identifier))
      throw simpleError('invalid_identifier', 'identifier must be a user id, email, or organization id')
    identifiers.push(EMAIL_REGEX.test(identifier)
      ? { kind: 'email', value: identifier.toLowerCase() }
      : { kind: 'identifier', value: identifier })
  }

  if (identifiers.length !== 1) {
    throw simpleError('invalid_identifier', 'Provide exactly one of user_id, email, org_id, or identifier', {
      provided: identifiers.map(identifier => identifier.kind),
    })
  }

  return identifiers[0]
}

async function getUserEmailById(supabaseAdmin: SupabaseAdmin, userId: string): Promise<{ email: string | null, error: unknown }> {
  const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(userId)

  return {
    email: userData?.user?.email ?? null,
    error: userError,
  }
}

async function getUserEmailByAuthEmail(c: Context<MiddlewareKeyVariables>, email: string): Promise<string | null> {
  const pgClient = getPgClient(c)

  try {
    const result = await pgClient.query<{ email: string | null }>(
      `
        SELECT email
        FROM auth.users
        WHERE email IS NOT NULL
          AND lower(email) = lower($1)
        ORDER BY created_at ASC, id ASC
        LIMIT 1
      `,
      [email],
    )

    return result.rows[0]?.email ?? null
  }
  catch (error) {
    throw simpleError('user_lookup_error', 'User lookup error', { email, error })
  }
  finally {
    await closeClient(c, pgClient)
  }
}

async function getOrgOwnerUserId(supabaseAdmin: SupabaseAdmin, orgId: string): Promise<string | null> {
  const { data: orgData, error: orgError } = await supabaseAdmin
    .from('orgs')
    .select('created_by')
    .eq('id', orgId)
    .maybeSingle()

  if (orgError)
    throw simpleError('org_lookup_error', 'Organization lookup error', { orgId, orgError })

  return orgData?.created_by ?? null
}

async function getOrgOwnerEmail(supabaseAdmin: SupabaseAdmin, orgId: string): Promise<string> {
  const ownerUserId = await getOrgOwnerUserId(supabaseAdmin, orgId)

  if (!ownerUserId)
    throw simpleError('org_does_not_exist', 'Organization does not exist', { orgId })

  const { email, error } = await getUserEmailById(supabaseAdmin, ownerUserId)
  if (!email)
    throw simpleError('org_owner_does_not_exist', 'Organization owner does not exist', { orgId, ownerUserId, error })

  return email
}

async function resolveUserEmail(c: Context<MiddlewareKeyVariables>, supabaseAdmin: SupabaseAdmin, identifier: LogAsIdentifier): Promise<string> {
  if (identifier.kind === 'email') {
    const email = await getUserEmailByAuthEmail(c, identifier.value)
    if (!email)
      throw simpleError('user_does_not_exist', 'User does not exist', { email: identifier.value })
    return email
  }

  if (identifier.kind === 'org_id')
    return getOrgOwnerEmail(supabaseAdmin, identifier.value)

  const { email, error } = await getUserEmailById(supabaseAdmin, identifier.value)
  if (email)
    return email

  if (identifier.kind === 'identifier' && UUID_REGEX.test(identifier.value))
    return getOrgOwnerEmail(supabaseAdmin, identifier.value)

  throw simpleError('user_does_not_exist', 'User does not exist', { userId: identifier.value, error })
}

export const app = new Hono<MiddlewareKeyVariables>()

app.use('/', useCors)

app.post('/', middlewareAuth, async (c) => {
  const authToken = c.req.header('authorization')

  if (!authToken)
    throw simpleError('not_authorized', 'Not authorized')

  const body = await parseBody<any>(c)
  const parsedBodyResult = safeParseSchema(bodySchema, body)
  if (!parsedBodyResult.success) {
    throw simpleError('invalid_json_body', 'Invalid json body', { body, parsedBodyResult })
  }

  const supabaseAdmin = await useSupabaseAdmin(c)
  const supabaseClient = useSupabaseClient(c, authToken)

  // Canonical platform-admin check for impersonation.
  // This endpoint must only use is_platform_admin for user-facing platform-rights.
  const { data: isAdmin, error: adminError } = await supabaseClient.rpc('is_platform_admin')
  if (adminError) {
    throw simpleError('is_admin_error', 'Is admin error', { adminError })
  }

  if (!isAdmin)
    throw simpleError('not_admin', 'Not admin')

  const identifier = resolveLogAsIdentifier(parsedBodyResult.data)
  const userEmail = await resolveUserEmail(c, supabaseAdmin, identifier)

  const { data: magicLink, error: magicError } = await supabaseAdmin.auth.admin.generateLink({
    type: 'magiclink',
    email: userEmail,
  })

  if (magicError) {
    throw simpleError('generate_magic_link_error', 'Generate magic link error', { magicError })
  }

  const tmpSupabaseClient = emptySupabase(c)
  const { data: authData, error: authError } = await tmpSupabaseClient.auth.verifyOtp({ token_hash: magicLink.properties.hashed_token, type: 'email' })

  if (authError) {
    throw simpleError('auth_error', 'Auth error', { authError })
  }

  const jwt = authData.session?.access_token
  const refreshToken = authData.session?.refresh_token

  if (!jwt) {
    throw simpleError('no_jwt', 'No jwt', { authData })
  }

  return c.json({ jwt, refreshToken })
})
