import type { Context } from 'hono'
import type { BentoBatchEvent } from '../../../supabase/functions/_backend/utils/bento.ts'
import type { MiddlewareKeyVariables } from '../../../supabase/functions/_backend/utils/hono.ts'
import type { PgQueryClient } from '../../../supabase/functions/_backend/utils/pg.ts'
import type { OrgInvitation } from './org_invitation_email.ts'
import { trackBentoEvents, updateBentoFields } from '../../../supabase/functions/_backend/utils/bento.ts'
import { cloudlog } from '../../../supabase/functions/_backend/utils/logging.ts'
import { closeClient, getPgClient, withPgTransaction } from '../../../supabase/functions/_backend/utils/pg.ts'
import { escapeHtml } from '../email_templates/render.ts'
import { orgInvitationLink, selectOrgInvitationForUpdate } from './org_invitation_email.ts'

// Bento owns reminder timing: the flow triggered by this event waits, then
// sends a reminder only while the invite id is still in OPEN_INVITES_FIELD.
export const INVITE_SENT_EVENT = 'org:invite_sent'
export const OPEN_INVITES_FIELD = 'capgo_open_invites'

export type OrgInvitationRecipient
  = | { kind: 'new', email: string }
    | { kind: 'existing', userId: string }

// Open invitations Bento has been told about (or is being told about now).
// Bounded by tmp_users_email_idx / finx_org_users_user_id plus unique FKs.
const OPEN_NEW_INVITES_SQL = `
  SELECT r.id::text AS id
  FROM public.tmp_users t
  JOIN public.org_invitation_email_requests r ON r.tmp_user_id = t.id
  WHERE t.email = $1 AND r.sent_at IS NOT NULL AND t.cancelled_at IS NULL
    AND GREATEST(t.updated_at, t.created_at) > CURRENT_TIMESTAMP - INTERVAL '7 days'
  ORDER BY r.id
`
const OPEN_EXISTING_INVITES_SQL = `
  SELECT r.id::text AS id
  FROM public.org_users ou
  JOIN public.org_invitation_email_requests r ON r.org_user_id = ou.id
  WHERE ou.user_id = $1 AND r.sent_at IS NOT NULL
    AND ou.is_invite AND ou.app_id IS NULL AND ou.channel_id IS NULL
  ORDER BY r.id
`

async function readOpenInvites(client: PgQueryClient, recipient: OrgInvitationRecipient): Promise<{ email: string | null, openInvites: string }> {
  let email: string | null
  let rows: { id: string }[]
  if (recipient.kind === 'new') {
    email = recipient.email
    rows = (await client.query<{ id: string }>(OPEN_NEW_INVITES_SQL, [recipient.email])).rows
  }
  else {
    const user = await client.query<{ email: string }>('SELECT email FROM public.users WHERE id = $1', [recipient.userId])
    email = user.rows[0]?.email ?? null
    rows = (await client.query<{ id: string }>(OPEN_EXISTING_INVITES_SQL, [recipient.userId])).rows
  }
  return { email, openInvites: rows.map(row => row.id).join(' ') }
}

export function buildInviteSentEvent(invitation: OrgInvitation, inviteLink: string, openInvites: string): BentoBatchEvent {
  return {
    event: INVITE_SENT_EVENT,
    data: {
      invite_id: invitation.id,
      kind: invitation.tmp_user_id !== null ? 'new' : 'existing',
      org_id: invitation.org_id,
      org_name: escapeHtml(invitation.org_name),
      org_name_subject: invitation.org_name.replace(/[\r\n]+/g, ' '),
      org_admin_name: escapeHtml(invitation.org_admin_name),
      invited_first_name: escapeHtml(invitation.first_name?.trim() || invitation.email.split('@')[0]),
      invited_last_name: escapeHtml(invitation.last_name?.trim() || ''),
      invite_link: inviteLink,
    },
    fields: { [OPEN_INVITES_FIELD]: openInvites },
  }
}

// Starts the Bento reminder flow once per sent generation. The field update
// rides on the same event so the flow never sees the invite as closed.
export async function startOrgInvitationBentoFlow(c: Context<MiddlewareKeyVariables>, invitationId: string) {
  const pgPool = await getPgClient(c)
  try {
    await withPgTransaction(pgPool, async (client) => {
      // Same lock and timeout budget as the email sender; serializes retries.
      await client.query('SET LOCAL idle_in_transaction_session_timeout = 60000')
      const invitation = await selectOrgInvitationForUpdate(client, invitationId)
      if (!invitation || !invitation.sent_at || invitation.bento_synced_at || !invitation.is_pending) {
        cloudlog({ requestId: c.get('requestId'), message: 'organization invitation Bento flow skipped', invitationId })
        return
      }

      const recipient: OrgInvitationRecipient = invitation.tmp_user_id !== null
        ? { kind: 'new', email: invitation.email }
        : { kind: 'existing', userId: invitation.recipient_user_id! }
      const { openInvites } = await readOpenInvites(client, recipient)
      const event = buildInviteSentEvent(invitation, orgInvitationLink(c, invitation), openInvites)
      const accepted = await trackBentoEvents(c, invitation.email, [event])
      if (accepted === false)
        throw new Error('Bento rejected the organization invitation event')
      // Without Bento configured there is no flow to start; leave it unmarked.
      if (accepted === undefined)
        return
      await client.query(`
        UPDATE public.org_invitation_email_requests
        SET bento_synced_at = pg_catalog.clock_timestamp()
        WHERE id = $1
      `, [invitationId])
    })
  }
  finally {
    closeClient(c, pgPool)
  }
}

// Rewrites the open-invites field after an invitation closes so running
// reminder flows for it stop at their next check.
export async function syncOrgInvitationBentoField(c: Context<MiddlewareKeyVariables>, recipient: OrgInvitationRecipient) {
  const pgPool = await getPgClient(c)
  try {
    const { email, openInvites } = await withPgTransaction(pgPool, client => readOpenInvites(client, recipient))
    if (!email) {
      cloudlog({ requestId: c.get('requestId'), message: 'organization invitation Bento field sync skipped', kind: recipient.kind })
      return
    }
    const accepted = await updateBentoFields(c, email, { [OPEN_INVITES_FIELD]: openInvites })
    if (accepted === false)
      throw new Error('Bento rejected the organization invitation field update')
  }
  finally {
    closeClient(c, pgPool)
  }
}
