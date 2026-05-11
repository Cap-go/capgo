import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import { Hono } from 'hono/tiny'
import { middlewareAuth, parseBody, simpleError, useCors } from '../utils/hono.ts'
import { cloudlog } from '../utils/logging.ts'
import { createCheckout } from '../utils/stripe.ts'
import { getEnv } from '../utils/utils.ts'
import { resolveStripeBillingCustomer } from './stripe_billing_context.ts'

interface CheckoutData {
  priceId: string
  clientReferenceId?: string
  recurrence: 'month' | 'year'
  attributionId?: string
  successUrl: string
  cancelUrl: string
  orgId: string
}

function getCheckoutRequestLogMetadata(body: CheckoutData) {
  return {
    hasPriceId: Boolean(body.priceId),
    hasClientReferenceId: Boolean(body.clientReferenceId),
    recurrence: body.recurrence,
    hasAttributionId: Boolean(body.attributionId),
    hasSuccessUrl: Boolean(body.successUrl),
    hasCancelUrl: Boolean(body.cancelUrl),
    hasOrgId: Boolean(body.orgId),
  }
}

export const app = new Hono<MiddlewareKeyVariables>()

app.use('/', useCors)

app.post('/', middlewareAuth, async (c) => {
  const body = await parseBody<CheckoutData>(c)
  cloudlog({ requestId: c.get('requestId'), message: 'post stripe checkout request', request: getCheckoutRequestLogMetadata(body) })

  if (!body.orgId)
    throw simpleError('no_org_id_provided', 'No org_id provided')

  const customerId = await resolveStripeBillingCustomer(c, 'checkout', body.orgId)
  const checkout = await createCheckout(c, customerId, body.recurrence ?? 'month', body.priceId ?? 'price_1KkINoGH46eYKnWwwEi97h1B', body.successUrl ?? `${getEnv(c, 'WEBAPP_URL')}/app/usage`, body.cancelUrl ?? `${getEnv(c, 'WEBAPP_URL')}/app/usage`, body.clientReferenceId, body.attributionId)
  return c.json({ url: checkout.url })
})
