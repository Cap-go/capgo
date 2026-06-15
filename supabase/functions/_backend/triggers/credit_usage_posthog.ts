import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import { Hono } from 'hono/tiny'
import type { UsageOverageEventRow } from '../utils/credit_usage_posthog.ts'
import { buildCreditUsagePosthogEventInput, getCreditUsageSourceRefOverageEventId } from '../utils/credit_usage_posthog.ts'
import { BRES, middlewareAPISecret, parseBody, simpleError } from '../utils/hono.ts'
import { cloudlog } from '../utils/logging.ts'
import { trackPosthogEvent } from '../utils/posthog.ts'
import { supabaseAdmin } from '../utils/supabase.ts'

interface CreditUsagePosthogPayload {
  transaction_id?: number | string
}

export const app = new Hono<MiddlewareKeyVariables>()

app.post('/', middlewareAPISecret, async (c) => {
  const payload = await parseBody<CreditUsagePosthogPayload>(c)
  const transactionId = Number(payload.transaction_id)

  if (!Number.isInteger(transactionId) || transactionId <= 0)
    throw simpleError('invalid_payload', 'Missing transaction_id in credit usage PostHog payload', { payload })

  const supabase = supabaseAdmin(c)
  const { data: transaction, error: transactionError } = await supabase
    .from('usage_credit_transactions')
    .select('*')
    .eq('id', transactionId)
    .maybeSingle()

  if (transactionError)
    throw simpleError('transaction_lookup_failed', 'Failed to load usage credit transaction', { transactionId, error: transactionError })

  if (!transaction) {
    cloudlog({ requestId: c.get('requestId'), message: 'usage credit transaction not found, skipping PostHog event', transactionId })
    return c.json(BRES)
  }

  let overageEvent: UsageOverageEventRow | null = null
  const overageEventId = getCreditUsageSourceRefOverageEventId(transaction.source_ref)
  if (overageEventId) {
    const { data, error } = await supabase
      .from('usage_overage_events')
      .select('*')
      .eq('id', overageEventId)
      .maybeSingle()

    if (error)
      throw simpleError('overage_lookup_failed', 'Failed to load usage overage event', { transactionId, overageEventId, error })

    overageEvent = data
  }

  const eventInput = buildCreditUsagePosthogEventInput(transaction, overageEvent, 'backend')
  const sent = await trackPosthogEvent(c, {
    channel: eventInput.channel,
    description: eventInput.description,
    event: eventInput.event,
    groups: eventInput.groups,
    setPersonProperties: false,
    tags: eventInput.tags,
    timestamp: eventInput.timestamp,
    user_id: eventInput.distinctId,
  })

  cloudlog({
    requestId: c.get('requestId'),
    message: sent ? 'credit usage PostHog event sent' : 'credit usage PostHog event skipped',
    transactionId,
    orgId: transaction.org_id,
  })

  return c.json(BRES)
})
