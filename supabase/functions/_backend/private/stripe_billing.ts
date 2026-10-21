import type { Context } from 'hono'
import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import type { Permission } from '../utils/rbac.ts'
import { Hono } from 'hono/tiny'
import { parseBody, simpleError, useCors } from '../utils/hono.ts'
import { middlewareAuth } from '../utils/hono_jwt.ts'
import { checkPermission } from '../utils/rbac.ts'
import {
  createCardSetupIntent,
  getDefaultCard,
  getInAppBillingContext,
  getOpenInvoicePaymentSecret,
  getOpenInvoiceSummary,
  getSubscriptionSummary,
  listInvoices,
  parseCancelComment,
  parseCancelFeedback,
  payOpenInvoice,
  resumeSubscription,
  scheduleSubscriptionCancel,
  setDefaultPaymentMethodFromIntent,
} from '../utils/stripe_in_app.ts'
import { supabaseClient } from '../utils/supabase.ts'

// In-app billing: replaces the Stripe billing portal and hosted invoice page.

interface OrgBody {
  orgId?: string
}

interface PaymentMethodBody extends OrgBody {
  intentId?: string
}

interface CancelBody extends OrgBody {
  reason?: unknown
  comment?: unknown
}

type AppContext = Context<MiddlewareKeyVariables>

async function resolveBillingContext(c: AppContext, orgId: string | undefined, permission: Permission) {
  if (!orgId)
    throw simpleError('invalid_body', 'Missing orgId')
  const authorization = c.get('authorization')
  if (!authorization || !c.get('auth')?.userId)
    throw simpleError('not_authorized', 'Not authorized')

  // Authenticated client: RLS only returns orgs the caller belongs to.
  const { data: org, error } = await supabaseClient(c, authorization)
    .from('orgs')
    .select('customer_id')
    .eq('id', orgId)
    .single()
  if (error || !org)
    throw simpleError('not_authorized', 'Not authorized')
  if (!await checkPermission(c, permission, { orgId }))
    throw simpleError('not_authorized', 'Not authorized')
  if (!org.customer_id)
    throw simpleError('no_customer', 'No customer')

  return await getInAppBillingContext(c, org.customer_id)
}

export const app = new Hono<MiddlewareKeyVariables>()

app.use('*', useCors)

app.post('/overview', middlewareAuth, async (c) => {
  const body = await parseBody<OrgBody>(c)
  const ctx = await resolveBillingContext(c, body.orgId, 'org.read_billing')
  const [card, subscription, invoices, openInvoice] = await Promise.all([
    getDefaultCard(ctx),
    getSubscriptionSummary(c, ctx),
    listInvoices(ctx),
    getOpenInvoiceSummary(c, ctx),
  ])
  return c.json({ publishableKey: ctx.publishableKey, card, subscription, invoices, openInvoice })
})

app.post('/setup-intent', middlewareAuth, async (c) => {
  const body = await parseBody<OrgBody>(c)
  const ctx = await resolveBillingContext(c, body.orgId, 'org.update_billing')
  return c.json(await createCardSetupIntent(ctx))
})

app.post('/payment-method', middlewareAuth, async (c) => {
  const body = await parseBody<PaymentMethodBody>(c)
  if (typeof body.intentId !== 'string')
    throw simpleError('invalid_intent_id', 'Missing intentId')
  const ctx = await resolveBillingContext(c, body.orgId, 'org.update_billing')
  return c.json({ card: await setDefaultPaymentMethodFromIntent(c, ctx, body.intentId) })
})

app.post('/cancel', middlewareAuth, async (c) => {
  const body = await parseBody<CancelBody>(c)
  const feedback = parseCancelFeedback(body.reason)
  const comment = parseCancelComment(body.comment)
  const ctx = await resolveBillingContext(c, body.orgId, 'org.update_billing')
  return c.json({ subscription: await scheduleSubscriptionCancel(c, ctx, feedback, comment) })
})

app.post('/resume', middlewareAuth, async (c) => {
  const body = await parseBody<OrgBody>(c)
  const ctx = await resolveBillingContext(c, body.orgId, 'org.update_billing')
  return c.json({ subscription: await resumeSubscription(c, ctx) })
})

app.post('/pay-invoice', middlewareAuth, async (c) => {
  const body = await parseBody<OrgBody>(c)
  const ctx = await resolveBillingContext(c, body.orgId, 'org.update_billing')
  return c.json(await payOpenInvoice(c, ctx))
})

app.post('/invoice-payment-intent', middlewareAuth, async (c) => {
  const body = await parseBody<OrgBody>(c)
  const ctx = await resolveBillingContext(c, body.orgId, 'org.update_billing')
  const secret = await getOpenInvoicePaymentSecret(c, ctx)
  if (!secret)
    throw simpleError('no_open_invoice', 'No open invoice to pay')
  return c.json(secret)
})
