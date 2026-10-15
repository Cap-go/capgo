import type { QueryResult, QueryResultRow } from 'pg'

export const CLAIM_LIMIT = 5
export const CLAIM_LEASE_SECONDS = 120
export const MAX_DISPATCH_ATTEMPTS = 5
export const DISPATCHES_PER_MINUTE = 60

export interface DispatchRecord extends QueryResultRow {
  id: string
  tag: string
  recipient_key: string
  context_key: string
  email: string
  claim_token: string
  attempt_count: number
}

export interface InvitationDetails extends QueryResultRow {
  email: string
  org_id: string
  org_name: string
  org_admin_name: string
  first_name: string | null
  last_name: string | null
  invite_magic_string: string | null
  is_new_user: boolean
}

interface QueryClient {
  query: <T extends QueryResultRow>(text: string, values?: unknown[]) => Promise<QueryResult<T>>
}

const failureCodes = new Set([
  'provider_rejected',
  'provider_timeout',
  'provider_unavailable',
  'invalid_configuration',
  'dispatch_failed',
])

export class DispatchStore {
  // Use a connected Client or PoolClient: claim transactions must keep one
  // connection until COMMIT, never a Pool's connection-per-query interface.
  constructor(private readonly client: QueryClient) {}

  async claim(tag: string, partition: number, limit = CLAIM_LIMIT): Promise<DispatchRecord[]> {
    if (!Number.isInteger(partition) || partition < 0 || partition > 4)
      throw new Error('Invalid dispatch partition')
    if (!Number.isInteger(limit) || limit < 1)
      throw new Error('Invalid dispatch limit')
    await this.client.query('BEGIN ISOLATION LEVEL READ COMMITTED')
    try {
      // Serialize the shared rolling provider budget, then take a fresh statement
      // snapshot after the lock. No provider request runs in this transaction.
      await this.client.query('SELECT pg_catalog.pg_advisory_xact_lock(1954098942, 1)')
      const budget = await this.client.query<{ count: number }>(`
        SELECT COUNT(*)::int AS count FROM (
          SELECT 1 FROM public.bento_event_dispatches
          WHERE last_attempt_at > pg_catalog.statement_timestamp() - INTERVAL '1 minute'
          LIMIT $1
        ) AS recent
      `, [DISPATCHES_PER_MINUTE])
      const available = DISPATCHES_PER_MINUTE - budget.rows[0]!.count
      if (available <= 0) {
        await this.client.query('COMMIT')
        return []
      }
      // The partial due index bounds work to one event/partition and five rows.
      const { rows } = await this.client.query<DispatchRecord>(`
      WITH due AS (
        SELECT id FROM public.bento_event_dispatches
        WHERE tag = $1 AND partition = $2
          AND accepted_at IS NULL AND cancelled_at IS NULL AND attempt_count < 5
          AND due_at <= CURRENT_TIMESTAMP
          AND (claim_until IS NULL OR claim_until <= CURRENT_TIMESTAMP)
        ORDER BY due_at, id
        LIMIT $3
        FOR UPDATE SKIP LOCKED
      )
      UPDATE public.bento_event_dispatches AS d
      SET attempt_count = d.attempt_count + 1,
        last_attempt_at = pg_catalog.clock_timestamp(),
        claim_token = pg_catalog.gen_random_uuid(),
        claim_until = pg_catalog.clock_timestamp() + ($4 * INTERVAL '1 second')
      FROM due WHERE d.id = due.id
      RETURNING d.id, d.tag, d.recipient_key, d.context_key, d.email,
        d.claim_token, d.attempt_count
      `, [tag, partition, Math.min(limit, CLAIM_LIMIT, available), CLAIM_LEASE_SECONDS])
      await this.client.query('COMMIT')
      return rows
    }
    catch (error) {
      await this.client.query('ROLLBACK')
      throw error
    }
  }

  async eligible(record: DispatchRecord): Promise<InvitationDetails | null> {
    // Every join starts from a primary key. Request UUID equality invalidates
    // earlier reminder generations after a resend or token rotation.
    const { rows } = await this.client.query<InvitationDetails>(`
      SELECT LOWER(COALESCE(t.email, u.email)) AS email,
        o.id AS org_id, o.name AS org_name,
        COALESCE(NULLIF(TRIM(CONCAT_WS(' ', inviter.first_name, inviter.last_name)), ''), 'Capgo team') AS org_admin_name,
        COALESCE(t.first_name, u.first_name) AS first_name,
        COALESCE(t.last_name, u.last_name) AS last_name,
        t.invite_magic_string,
        r.tmp_user_id IS NOT NULL AS is_new_user
      FROM public.bento_event_dispatches d
      JOIN public.org_invitation_email_requests r ON r.id = $3::uuid
      LEFT JOIN public.tmp_users t ON t.id = r.tmp_user_id
      LEFT JOIN public.org_users ou ON ou.id = r.org_user_id
      LEFT JOIN public.users u ON u.id = ou.user_id
      LEFT JOIN public.users inviter ON inviter.id = r.invited_by_user_id
      JOIN public.orgs o ON o.id = COALESCE(t.org_id, ou.org_id)
      WHERE d.id = $1 AND d.claim_token = $2 AND d.context_key = $3::text AND d.tag = $4
        AND d.accepted_at IS NULL AND d.cancelled_at IS NULL
        AND r.sent_at IS NOT NULL
        AND LOWER(COALESCE(t.email, u.email)) = d.email
        AND (
          (r.tmp_user_id IS NOT NULL
            AND d.tag IN ('org:invite_new_user_reminder_1', 'org:invite_new_user_reminder_2')
            AND d.recipient_key = 'email:' || LOWER(t.email)
            AND t.cancelled_at IS NULL
            AND GREATEST(t.updated_at, t.created_at) > CURRENT_TIMESTAMP - INTERVAL '7 days'
            AND d.due_at < GREATEST(t.updated_at, t.created_at) + INTERVAL '7 days')
          OR (r.org_user_id IS NOT NULL
            AND d.tag IN ('org:invite_existing_user_reminder_1', 'org:invite_existing_user_reminder_2')
            AND d.recipient_key = 'user:' || u.id::text
            AND ou.is_invite AND ou.app_id IS NULL AND ou.channel_id IS NULL)
        )
    `, [record.id, record.claim_token, record.context_key, record.tag])
    return rows[0] ?? null
  }

  async complete(record: DispatchRecord): Promise<boolean> {
    // Provider acceptance remains genuine after a lease expires. Only a new
    // claim token fences it out; checking lease time here could cause a replay.
    const result = await this.client.query(`
      UPDATE public.bento_event_dispatches
      SET accepted_at = CURRENT_TIMESTAMP, claim_token = NULL, claim_until = NULL, last_error = NULL
      WHERE id = $1 AND claim_token = $2 AND accepted_at IS NULL AND cancelled_at IS NULL
    `, [record.id, record.claim_token])
    return result.rowCount === 1
  }

  async fail(record: DispatchRecord, code: string): Promise<boolean> {
    const safeCode = failureCodes.has(code) ? code : 'dispatch_failed'
    const result = await this.client.query(`
      UPDATE public.bento_event_dispatches
      SET last_error = $3, claim_token = NULL, claim_until = CURRENT_TIMESTAMP + INTERVAL '1 minute'
      WHERE id = $1 AND claim_token = $2 AND accepted_at IS NULL AND cancelled_at IS NULL
    `, [record.id, record.claim_token, safeCode])
    return result.rowCount === 1
  }

  async cancel(record: DispatchRecord): Promise<boolean> {
    const result = await this.client.query(`
      UPDATE public.bento_event_dispatches
      SET cancelled_at = CURRENT_TIMESTAMP, claim_token = NULL, claim_until = NULL
      WHERE id = $1 AND claim_token = $2 AND accepted_at IS NULL AND cancelled_at IS NULL
    `, [record.id, record.claim_token])
    return result.rowCount === 1
  }
}
