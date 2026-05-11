import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import { Hono } from 'hono/tiny'
import { middlewareAuth, parseBody, useCors } from '../utils/hono.ts'
import { cloudlog } from '../utils/logging.ts'
import { createPortal } from '../utils/stripe.ts'
import { resolveStripeBillingCustomer } from './stripe_billing_context.ts'

interface PortalData {
  callbackUrl: string
  orgId: string
}

function getPortalRequestLogMetadata(body: PortalData) {
  return {
    hasCallbackUrl: Boolean(body.callbackUrl),
    hasOrgId: Boolean(body.orgId),
  }
}

export const app = new Hono<MiddlewareKeyVariables>()

app.use('/', useCors)

app.post('/', middlewareAuth, async (c) => {
  const body = await parseBody<PortalData>(c)
  cloudlog({ requestId: c.get('requestId'), message: 'post stripe portal request', request: getPortalRequestLogMetadata(body) })
  const customerId = await resolveStripeBillingCustomer(c, 'portal', body.orgId)
  const link = await createPortal(c, customerId, body.callbackUrl)
  return c.json({ url: link.url })
})
