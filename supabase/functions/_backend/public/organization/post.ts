import type { Context } from 'hono'
import type { AuthInfo, MiddlewareKeyVariables } from '../../utils/hono.ts'
import type { Database } from '../../utils/supabase.types.ts'
import { type } from 'arktype'
import { safeParseSchema } from '../../utils/ark_validation.ts'
import { simpleError } from '../../utils/hono.ts'
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

  const supabase = supabaseWithAuth(c, auth)
  const { data: self, error: userErr } = await supabase.from('users').select('email').eq('id', auth.userId).single()
  if (userErr || !self?.email) {
    throw simpleError('cannot_get_user', 'Cannot get user', { error: userErr?.message })
  }
  const orgId = crypto.randomUUID()
  const pendingCustomerId = await createPendingStripeInfo(c, orgId, estimatedMau)
  const newOrg = {
    id: orgId,
    name: body.name,
    created_by: auth.userId,
    management_email: body.email ?? self.email ?? '',
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
