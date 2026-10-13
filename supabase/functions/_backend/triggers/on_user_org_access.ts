import type { Database } from '../utils/supabase.types.ts'
import { z } from 'zod'
import { syncBentoSubscriberTags } from '../utils/bento.ts'
import { syncBentoFirstOrgOnRoleBindingWrite } from '../utils/bento_first_org.ts'
import { BRES, createHono, middlewareAPISecret, simpleError, triggerValidator } from '../utils/hono.ts'
import { supabaseAdmin } from '../utils/supabase.ts'
import { sendEventToTracking } from '../utils/tracking.ts'
import { version } from '../utils/version.ts'

export const app = createHono('', version)

app.post('/', middlewareAPISecret, triggerValidator('role_bindings', ['INSERT', 'UPDATE']), async (c) => {
  const record = c.get('webhookBody') as Partial<Database['public']['Tables']['role_bindings']['Row']>
  const bindingId = z.uuid().safeParse(record.id)
  if (!bindingId.success)
    throw simpleError('invalid_payload', 'Invalid role binding id', { id: record.id })

  const { type } = await c.req.json<{ type: 'INSERT' | 'UPDATE' }>()
  let posthogFailure: { error: unknown } | undefined
  if (type === 'INSERT' && record.reason === 'Accepted invitation'
    && record.principal_type === 'user' && record.scope_type === 'org' && record.is_direct === true) {
    const userId = z.uuid().safeParse(record.principal_id)
    const orgId = z.uuid().safeParse(record.org_id)
    const grantedAt = new Date(record.granted_at ?? '')
    if (!userId.success || !orgId.success || !Number.isFinite(grantedAt.getTime()))
      throw simpleError('invalid_payload', 'Invalid accepted invitation binding')

    // Both invitation RPCs enqueue this INSERT atomically with membership acceptance.
    // Use the immutable queued binding, even if it was changed/deleted before delivery.
    try {
      await sendEventToTracking(c, {
        channel: 'organization-invitation',
        event: 'organization_membership_invitation_accepted',
        user_id: userId.data,
        occurred_at: grantedAt.toISOString(),
        timeoutMs: 1000,
        groups: { organization: orgId.data },
        nonPersonTags: {
          org_id: orgId.data,
          $insert_id: `organization-invitation-accepted:${bindingId.data}`,
          capture_source: 'database_trigger',
        },
      }, { background: false, strict: true, requirePosthogDelivery: true })
    }
    catch (error) {
      posthogFailure = { error }
    }
  }

  await syncBentoFirstOrgOnRoleBindingWrite(c, bindingId.data)

  // Stop Invite-to-org Bento reminders after accept.
  if (record.reason === 'Accepted invitation' && record.principal_id) {
    const { data: user } = await supabaseAdmin(c)
      .from('users')
      .select('email')
      .eq('id', record.principal_id)
      .maybeSingle()
    if (user?.email) {
      await syncBentoSubscriberTags(c, {
        email: user.email.trim().toLowerCase(),
        segments: ['org:invite_accepted'],
        deleteSegments: [],
      })
    }
  }

  if (posthogFailure)
    throw posthogFailure.error

  return c.json(BRES)
})
