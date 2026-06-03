import type { Context } from 'hono'
import type { AuthInfo, MiddlewareKeyVariables } from '../../utils/hono.ts'
import type { Database } from '../../utils/supabase.types.ts'
import { type } from 'arktype'
import { safeParseSchema } from '../../utils/ark_validation.ts'
import { quickError, simpleError } from '../../utils/hono.ts'
import { closeClient, getPgClient } from '../../utils/pg.ts'
import { supabaseAdmin, supabaseWithAuth } from '../../utils/supabase.ts'
import { normalizeWebsiteUrl } from './website.ts'

const MAX_ESTIMATED_MAU = 1_000_000

const estimatedMauSchema = type('number.integer >= 0').narrow((value, ctx) => {
  if (value > MAX_ESTIMATED_MAU) {
    return ctx.reject({
      expected: `a value <= ${MAX_ESTIMATED_MAU}`,
      actual: JSON.stringify(value),
    })
  }

  return true
})

const bodySchema = type({
  'name': 'string >= 3',
  'email?': 'string.email',
  'estimatedMau?': estimatedMauSchema,
  'website?': 'string',
})

async function getInitialPlanForMau(c: Context<MiddlewareKeyVariables>, estimatedMau: number) {
  const adminClient = supabaseAdmin(c)
  const { data: plan, error } = await adminClient
    .from('plans')
    .select('name, stripe_id, mau')
    .gte('mau', estimatedMau)
    .order('mau', { ascending: true })
    .limit(1)
    .single()

  if (error || !plan?.stripe_id) {
    throw simpleError('cannot_get_plan', 'Cannot get plan', { error: error?.message, estimatedMau })
  }

  return plan
}

async function createPendingStripeInfo(c: Context<MiddlewareKeyVariables>, orgId: string, estimatedMau: number) {
  const plan = await getInitialPlanForMau(c, estimatedMau)
  const pendingCustomerId = `pending_${orgId}`
  const trialAt = new Date()
  trialAt.setDate(trialAt.getDate() + 15)

  const { error } = await supabaseAdmin(c)
    .from('stripe_info')
    .insert({
      customer_id: pendingCustomerId,
      product_id: plan.stripe_id,
      trial_at: trialAt.toISOString(),
      status: null,
      is_good_plan: true,
    })

  if (error) {
    throw simpleError('cannot_create_org_plan', 'Cannot create org plan', { error: error.message, estimatedMau, plan: plan.name })
  }

  return pendingCustomerId
}

async function getOwnerEmail(c: Context<MiddlewareKeyVariables>, auth: AuthInfo) {
  if (auth.authType === 'jwt') {
    const { data: self, error } = await supabaseWithAuth(c, auth)
      .from('users')
      .select('email')
      .eq('id', auth.userId)
      .single()

    if (error || !self?.email) {
      throw simpleError('cannot_get_user', 'Cannot get user', { error: error?.message })
    }

    return self.email
  }

  let pgClient
  try {
    pgClient = getPgClient(c)
    const result = await pgClient.query<{ email: string }>(
      'SELECT email FROM public.users WHERE id = $1::uuid LIMIT 1',
      [auth.userId],
    )
    const email = result.rows[0]?.email
    if (!email) {
      throw simpleError('cannot_get_user', 'Cannot get user')
    }

    return email
  }
  finally {
    if (pgClient) {
      closeClient(c, pgClient)
    }
  }
}

async function ensureApiKeyCanCreateOrganization(c: Context<MiddlewareKeyVariables>, auth: AuthInfo) {
  if (auth.authType !== 'apikey') {
    return
  }

  const apikeyString = auth.apikey?.key ?? c.get('capgkey')
  if (!apikeyString) {
    throw quickError(401, 'invalid_apikey', 'Invalid apikey')
  }

  let pgClient
  try {
    pgClient = getPgClient(c)
    const result = await pgClient.query<{ allowed: boolean }>(
      'SELECT public.apikey_has_global_permission($1::text, public.rbac_perm_org_create()) AS allowed',
      [apikeyString],
    )
    if (result.rows[0]?.allowed !== true) {
      throw quickError(403, 'permission_denied', 'Permission denied: org.create')
    }
  }
  finally {
    if (pgClient) {
      closeClient(c, pgClient)
    }
  }
}

export async function post(
  c: Context<MiddlewareKeyVariables>,
  bodyRaw: any,
  _apikey: Database['public']['Tables']['apikeys']['Row'] | null | undefined,
): Promise<Response> {
  const bodyParsed = safeParseSchema(bodySchema, bodyRaw)
  if (!bodyParsed.success) {
    throw simpleError('invalid_body', 'Invalid body', { error: bodyParsed.error })
  }
  const body = bodyParsed.data
  const website = normalizeWebsiteUrl(body.website)
  const estimatedMau = body.estimatedMau ?? 0

  const auth = c.get('auth') as AuthInfo | undefined
  if (!auth?.userId) {
    throw simpleError('not_authorized', 'Not authorized')
  }

  await ensureApiKeyCanCreateOrganization(c, auth)
  const ownerEmail = await getOwnerEmail(c, auth)
  const supabase = supabaseWithAuth(c, auth)
  const orgId = crypto.randomUUID()
  const pendingCustomerId = await createPendingStripeInfo(c, orgId, estimatedMau)
  const newOrg = {
    id: orgId,
    name: body.name,
    created_by: auth.userId,
    management_email: body.email ?? ownerEmail,
    customer_id: pendingCustomerId,
    website,
  }
  const { error: errorOrg } = await supabase
    .from('orgs')
    .insert(newOrg)

  if (errorOrg) {
    await supabaseAdmin(c)
      .from('stripe_info')
      .delete()
      .eq('customer_id', pendingCustomerId)

    throw simpleError('cannot_create_org', 'Cannot create org', { error: errorOrg?.message })
  }

  return c.json({ id: orgId })
}
