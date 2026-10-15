import type { ReminderSender } from '../cloudflare_workers/bento_dispatch/consumer.ts'
import { randomUUID } from 'node:crypto'
import { Pool } from 'pg'
import { afterAll, describe, expect, it } from 'vitest'
import { processDispatchJob } from '../cloudflare_workers/bento_dispatch/consumer.ts'
import { buildInvitationEvent } from '../cloudflare_workers/bento_dispatch/operations.ts'
import { DispatchStore } from '../cloudflare_workers/bento_dispatch/store.ts'
import { executeSQL, POSTGRES_URL, USER_ID, USER_ID_NONMEMBER } from './test-utils.ts'

const pool = new Pool({ connectionString: POSTGRES_URL, max: 10 })
afterAll(() => pool.end())

async function fixture(kind: 'new' | 'existing' = 'new', tokenAgeDays = 0) {
  const orgId = randomUUID()
  const email = `bento-dispatch-${orgId}@example.com`
  const orgName = `Bento dispatch test ${orgId}`
  await executeSQL(`INSERT INTO public.orgs (id, created_by, name, management_email)
    VALUES ($1, $2, $4, $3)`, [orgId, USER_ID, email, orgName])
  const [invite] = kind === 'new'
    ? await executeSQL<{ id: number }>(`INSERT INTO public.tmp_users
        (org_id, email, first_name, last_name, invite_magic_string, invited_by_user_id, created_at, updated_at)
        VALUES ($1, $2, 'Alex', 'Recipient', $3, $4,
          CURRENT_TIMESTAMP - ($5 * INTERVAL '1 day'), CURRENT_TIMESTAMP - ($5 * INTERVAL '1 day'))
        RETURNING id`, [orgId, email, `token-${orgId}`, USER_ID, tokenAgeDays])
    : await executeSQL<{ id: number }>(`INSERT INTO public.org_users
        (org_id, user_id, is_invite, rbac_role_name)
        VALUES ($1, $2, true, 'org_member') RETURNING id`, [orgId, USER_ID_NONMEMBER])
  const column = kind === 'new' ? 'tmp_user_id' : 'org_user_id'
  const [request] = await executeSQL<{ id: string }>(`SELECT id FROM public.org_invitation_email_requests WHERE ${column} = $1`, [invite!.id])
  const contexts = [request!.id]
  const partition = ((Number(invite!.id) % 5) + 5) % 5
  // Unique tags isolate claim tests from parallel files and real reminder rows.
  const tag = `test:bento:${orgId}`
  const client = await pool.connect()
  return {
    orgId,
    email,
    inviteId: invite!.id,
    requestId: request!.id,
    column,
    partition,
    tag,
    contexts,
    store: new DispatchStore(client),
    claimConcurrently: async (partitions = Array.from({ length: 8 }).fill(partition)) => Promise.all(partitions.map(async (claimPartition) => {
      const claimer = await pool.connect()
      try {
        return await new DispatchStore(claimer).claim(tag, claimPartition, 5)
      }
      finally { claimer.release() }
    })),
    insert: async (count = 1) => executeSQL<{ id: string }>(`INSERT INTO public.bento_event_dispatches
      (tag, recipient_key, context_key, email, due_at, partition)
      SELECT $1, 'email:' || $2, $3 || ':' || n, $2, CURRENT_TIMESTAMP - INTERVAL '1 minute', $4
      FROM generate_series(1, $5::int) n RETURNING id`, [tag, email, request!.id, partition, count]),
    acceptInitial: async () => {
      await executeSQL(`UPDATE public.org_invitation_email_requests SET sent_at = CURRENT_TIMESTAMP WHERE id = $1`, [request!.id])
      const rows = await executeSQL<{ tag: string }>(`SELECT tag FROM public.bento_event_dispatches WHERE context_key = $1 ORDER BY tag`, [request!.id])
      return rows
    },
    cleanup: async () => {
      await executeSQL('DELETE FROM public.bento_event_dispatches WHERE tag = $1 OR context_key = ANY($2)', [tag, contexts])
      await executeSQL('DELETE FROM public.orgs WHERE id = $1', [orgId])
      await executeSQL(`DELETE FROM pgmq.q_send_email WHERE message->'payload'->>'org_invitation_id' = ANY($1)`, [contexts])
      client.release()
    },
  }
}

describe('bento dispatch PostgreSQL store', () => {
  it('gives concurrent claimers disjoint rows and enforces the persistent five-attempt ceiling', async () => {
    const f = await fixture()
    try {
      const ids = await f.insert(40)
      const batches = await f.claimConcurrently()
      const claims = batches.flat()
      expect(claims).toHaveLength(40)
      expect(new Set(claims.map(row => row.id)).size).toBe(40)
      expect(claims.every(row => row.attempt_count === 1 && row.claim_token)).toBe(true)
      expect(await f.store.claim(f.tag, f.partition, 5)).toEqual([])
      for (let attempt = 2; attempt <= 5; attempt++) {
        await executeSQL(`UPDATE public.bento_event_dispatches SET claim_until = CURRENT_TIMESTAMP - INTERVAL '1 second', last_attempt_at = CURRENT_TIMESTAMP - INTERVAL '2 minutes'
          WHERE id = ANY($1::uuid[])`, [ids.map(row => row.id)])
        const next = (await f.claimConcurrently()).flat()
        expect(next).toHaveLength(40)
        expect(next.every(row => row.attempt_count === attempt)).toBe(true)
      }
      await executeSQL(`UPDATE public.bento_event_dispatches SET claim_until = CURRENT_TIMESTAMP - INTERVAL '1 second' WHERE tag = $1`, [f.tag])
      expect(await f.store.claim(f.tag, f.partition, 5)).toEqual([])
    }
    finally { await f.cleanup() }
  })

  it('fences stale owners, acknowledges genuine acceptance after lease expiry, and skips accepted duplicates', async () => {
    const f = await fixture()
    try {
      await f.insert()
      const [first] = await f.store.claim(f.tag, f.partition, 1)
      await executeSQL(`UPDATE public.bento_event_dispatches SET claim_until = CURRENT_TIMESTAMP - INTERVAL '1 second' WHERE id = $1`, [first!.id])
      const [second] = await f.store.claim(f.tag, f.partition, 1)
      expect(second!.claim_token).not.toBe(first!.claim_token)
      expect(await f.store.complete(first!)).toBe(false)
      expect(await f.store.fail(first!, 'provider_timeout')).toBe(false)
      expect(await f.store.cancel(first!)).toBe(false)
      await executeSQL(`UPDATE public.bento_event_dispatches SET claim_until = CURRENT_TIMESTAMP - INTERVAL '1 second' WHERE id = $1`, [second!.id])
      expect(await f.store.complete(second!)).toBe(true)
      expect(await f.store.claim(f.tag, f.partition, 1)).toEqual([])
    }
    finally { await f.cleanup() }
  })

  it('retains schedule times, backs off failures, and stores only fixed error codes', async () => {
    const f = await fixture()
    try {
      await f.insert()
      const [claim] = await f.store.claim(f.tag, f.partition, 1)
      const [before] = await executeSQL<{ due_at: string }>('SELECT due_at FROM public.bento_event_dispatches WHERE id = $1', [claim!.id])
      expect(await f.store.fail(claim!, 'sensitive customer content')).toBe(true)
      const [after] = await executeSQL<{ due_at: string, last_error: string, claim_token: string | null }>('SELECT due_at, last_error, claim_token FROM public.bento_event_dispatches WHERE id = $1', [claim!.id])
      expect(after).toMatchObject({ due_at: before!.due_at, last_error: 'dispatch_failed', claim_token: null })
      expect(await f.store.claim(f.tag, f.partition, 1)).toEqual([])
    }
    finally { await f.cleanup() }
  })

  it('excludes future, cancelled, accepted, and other-partition rows and bounds claim size', async () => {
    const f = await fixture()
    try {
      const rows = await f.insert(12)
      await executeSQL(`UPDATE public.bento_event_dispatches SET due_at = CURRENT_TIMESTAMP + INTERVAL '1 day' WHERE id = $1`, [rows[0]!.id])
      await executeSQL('UPDATE public.bento_event_dispatches SET cancelled_at = CURRENT_TIMESTAMP WHERE id = $1', [rows[1]!.id])
      await executeSQL('UPDATE public.bento_event_dispatches SET accepted_at = CURRENT_TIMESTAMP WHERE id = $1', [rows[2]!.id])
      await executeSQL('UPDATE public.bento_event_dispatches SET partition = $2 WHERE id = $1', [rows[3]!.id, (f.partition + 1) % 5])
      expect(await f.store.claim(f.tag, f.partition, 100)).toHaveLength(5)
      expect(await f.store.claim(f.tag, f.partition, 5)).toHaveLength(3)
    }
    finally { await f.cleanup() }
  })

  it.each(['new', 'existing'] as const)('checks fresh %s invitation state and skips obsolete generations', async (kind) => {
    const f = await fixture(kind)
    try {
      expect(await f.acceptInitial()).toHaveLength(2)
      const tag = kind === 'new' ? 'org:invite_new_user_reminder_1' : 'org:invite_existing_user_reminder_1'
      await executeSQL('UPDATE public.bento_event_dispatches SET due_at = CURRENT_TIMESTAMP WHERE context_key = $1 AND tag = $2', [f.requestId, tag])
      const [claim] = await f.store.claim(tag, f.partition, 5)
      expect(claim!.context_key).toBe(f.requestId)
      const eligible = await f.store.eligible(claim!)
      expect(eligible).toMatchObject({ org_id: f.orgId, org_name: `Bento dispatch test ${f.orgId}`, is_new_user: kind === 'new' })
      expect(eligible!.invite_magic_string).toBe(kind === 'new' ? `token-${f.orgId}` : null)
      await executeSQL(`UPDATE public.org_invitation_email_requests SET requested_at = CURRENT_TIMESTAMP - INTERVAL '6 minutes' WHERE id = $1`, [f.requestId])
      await executeSQL(`SELECT public.queue_org_invitation_email($1, $2, $3)`, [kind, f.inviteId, USER_ID])
      const [replacement] = await executeSQL<{ id: string }>(`SELECT id FROM public.org_invitation_email_requests WHERE ${f.column} = $1`, [f.inviteId])
      f.contexts.push(replacement!.id)
      expect(await f.store.eligible(claim!)).toBeNull()
      expect(await f.store.cancel(claim!)).toBe(true)
    }
    finally { await f.cleanup() }
  })

  it('suppresses cancelled or expired temporary invitations and accepted memberships', async () => {
    const fresh = await fixture('new')
    const expired = await fixture('new', 8)
    const existing = await fixture('existing')
    try {
      for (const f of [fresh, existing])
        await f.acceptInitial()
      await executeSQL(`UPDATE public.bento_event_dispatches SET due_at = CURRENT_TIMESTAMP WHERE context_key = ANY($1)`, [[fresh.requestId, existing.requestId]])
      const [newClaim] = await fresh.store.claim('org:invite_new_user_reminder_1', fresh.partition, 5)
      const [existingClaim] = await existing.store.claim('org:invite_existing_user_reminder_1', existing.partition, 5)
      await executeSQL('UPDATE public.tmp_users SET cancelled_at = CURRENT_TIMESTAMP WHERE id = $1', [fresh.inviteId])
      expect(await fresh.store.eligible(newClaim!)).toBeNull()
      expect(await expired.acceptInitial()).toEqual([])
      await executeSQL(`INSERT INTO public.bento_event_dispatches (tag, recipient_key, context_key, email, due_at, partition)
        VALUES ('org:invite_new_user_reminder_1', 'email:' || $1, $2, $1, CURRENT_TIMESTAMP, $3)`, [expired.email, expired.requestId, expired.partition])
      const [expiredClaim] = await expired.store.claim('org:invite_new_user_reminder_1', expired.partition, 5)
      expect(await expired.store.eligible(expiredClaim!)).toBeNull()
      await executeSQL('UPDATE public.org_users SET is_invite = false WHERE id = $1', [existing.inviteId])
      expect(await existing.store.eligible(existingClaim!)).toBeNull()
    }
    finally {
      await fresh.cleanup()
      await expired.cleanup()
      await existing.cleanup()
    }
  })

  it('rejects a first-stage reminder scheduled after temporary token expiry', async () => {
    const f = await fixture('new', 6)
    try {
      await f.acceptInitial()
      const tag = 'org:invite_new_user_reminder_1'
      const [row] = await executeSQL<{ id: string }>('SELECT id FROM public.bento_event_dispatches WHERE tag = $1 AND context_key = $2', [tag, f.requestId])
      // A claim normally becomes due only after this expiry. Simulate a stale
      // claimed job without changing its original schedule or current token.
      const token = randomUUID()
      await executeSQL('UPDATE public.bento_event_dispatches SET claim_token = $2, attempt_count = 1 WHERE id = $1', [row!.id, token])
      expect(await f.store.eligible({ id: row!.id, tag, context_key: f.requestId, recipient_key: `email:${f.email}`, email: f.email, claim_token: token, attempt_count: 1 })).toBeNull()
    }
    finally { await f.cleanup() }
  })

  it('atomically limits all concurrent partitions to sixty dispatch attempts per rolling minute', async () => {
    const f = await fixture()
    try {
      await f.insert(61)
      await executeSQL(`WITH ordered AS (
        SELECT id, ((row_number() OVER (ORDER BY id) - 1) % 5)::smallint AS part
        FROM public.bento_event_dispatches WHERE tag = $1
      ) UPDATE public.bento_event_dispatches d SET partition = ordered.part FROM ordered WHERE d.id = ordered.id`, [f.tag])
      const claims = (await f.claimConcurrently(Array.from({ length: 20 }, (_, index) => index % 5))).flat()
      expect(claims).toHaveLength(60)
      expect(await f.store.claim(f.tag, f.partition, 5)).toEqual([])
      const [count] = await executeSQL<{ count: number }>(`SELECT COUNT(*)::int AS count FROM public.bento_event_dispatches
        WHERE tag = $1 AND last_attempt_at > CURRENT_TIMESTAMP - INTERVAL '1 minute'`, [f.tag])
      expect(count!.count).toBe(60)
      await executeSQL(`UPDATE public.bento_event_dispatches SET last_attempt_at = CURRENT_TIMESTAMP - INTERVAL '2 minutes' WHERE tag = $1`, [f.tag])
      expect((await f.claimConcurrently([0, 1, 2, 3, 4])).flat()).toHaveLength(1)
    }
    finally { await f.cleanup() }
  })

  it.each(['new', 'existing'] as const)('dispatches the complete %s-user reminder flow and suppresses repeat or resolved invitations', async (kind) => {
    const f = await fixture(kind)
    const sent: ReturnType<typeof buildInvitationEvent>[] = []
    const send: ReminderSender = async (record, invitation) => {
      sent.push(buildInvitationEvent(record, invitation, 'https://console.capgo.app'))
      return true
    }
    try {
      expect(await f.acceptInitial()).toHaveLength(2)
      const operation = kind === 'new' ? 'org:invite_new_user_reminder_1' : 'org:invite_existing_user_reminder_1'
      const job = { version: 1 as const, operation, partition: f.partition, runId: randomUUID() }
      await executeSQL('UPDATE public.bento_event_dispatches SET due_at = CURRENT_TIMESTAMP WHERE tag = $1 AND context_key = $2', [operation, f.requestId])
      expect(await processDispatchJob(job, f.store, send)).toEqual({ accepted: 1, cancelled: 0, failed: 0 })
      expect(sent).toHaveLength(1)
      expect(sent[0]!.event).toBe(operation)
      expect(sent[0]!.data.invite_link).toBe(kind === 'new'
        ? `https://console.capgo.app/invitation?invite_magic_string=token-${f.orgId}`
        : `https://console.capgo.app/dashboard?invite_org=${f.orgId}`)
      const [accepted] = await executeSQL<{ accepted_at: string | null, attempt_count: number }>('SELECT accepted_at, attempt_count FROM public.bento_event_dispatches WHERE tag = $1 AND context_key = $2', [operation, f.requestId])
      expect(accepted!.accepted_at).not.toBeNull()
      expect(accepted!.attempt_count).toBe(1)
      expect(await processDispatchJob(job, f.store, send)).toEqual({ accepted: 0, cancelled: 0, failed: 0 })
      if (kind === 'new')
        await executeSQL('UPDATE public.tmp_users SET cancelled_at = CURRENT_TIMESTAMP WHERE id = $1', [f.inviteId])
      else
        await executeSQL('UPDATE public.org_users SET is_invite = false WHERE id = $1', [f.inviteId])
      const secondOperation = kind === 'new' ? 'org:invite_new_user_reminder_2' : 'org:invite_existing_user_reminder_2'
      await executeSQL('UPDATE public.bento_event_dispatches SET due_at = CURRENT_TIMESTAMP WHERE tag = $1 AND context_key = $2', [secondOperation, f.requestId])
      expect(await processDispatchJob({ ...job, operation: secondOperation }, f.store, send)).toEqual({ accepted: 0, cancelled: 1, failed: 0 })
      expect(sent).toHaveLength(1)
    }
    finally { await f.cleanup() }
  })

  it('uses bounded due and rolling-budget indexes with 100,000 rows and eight parallel reads', async () => {
    const f = await fixture()
    try {
      await executeSQL(`INSERT INTO public.bento_event_dispatches
        (tag, recipient_key, context_key, email, due_at, partition, accepted_at, last_attempt_at)
        SELECT $1, 'email:' || $2, n::text, $2,
          CASE WHEN n > 80000 THEN CURRENT_TIMESTAMP + INTERVAL '1 day' ELSE CURRENT_TIMESTAMP - INTERVAL '1 day' END,
          $3, CASE WHEN n <= 60000 THEN CURRENT_TIMESTAMP END,
          CASE WHEN n <= 60 THEN CURRENT_TIMESTAMP ELSE CURRENT_TIMESTAMP - INTERVAL '2 days' END
        FROM generate_series(1, 100000) n`, [f.tag, f.email, f.partition])
      await executeSQL('ANALYZE public.bento_event_dispatches')
      const explainDue = () => pool.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
        SELECT id FROM public.bento_event_dispatches
        WHERE tag = $1 AND partition = $2 AND due_at <= CURRENT_TIMESTAMP
          AND accepted_at IS NULL AND cancelled_at IS NULL AND attempt_count < 5
          AND (claim_until IS NULL OR claim_until <= CURRENT_TIMESTAMP)
        ORDER BY due_at, id LIMIT 5 FOR UPDATE SKIP LOCKED`, [f.tag, f.partition])
      const [due, budget] = await Promise.all([
        explainDue(),
        pool.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
          SELECT COUNT(*) FROM (SELECT 1 FROM public.bento_event_dispatches
            WHERE last_attempt_at > statement_timestamp() - INTERVAL '1 minute' LIMIT 60) recent`),
      ])
      const dueText = JSON.stringify(due.rows[0]!['QUERY PLAN'])
      const budgetText = JSON.stringify(budget.rows[0]!['QUERY PLAN'])
      expect(dueText).toContain('bento_event_dispatches_due_idx')
      expect(budgetText).toContain('bento_event_dispatches_last_attempt_idx')
      expect(dueText).not.toContain('Seq Scan')
      expect(budgetText).not.toContain('Seq Scan')
      const parallel = await Promise.all([
        ...Array.from({ length: 8 }, explainDue),
        pool.query('SELECT id FROM public.orgs WHERE id = $1 LIMIT 1', [f.orgId]),
      ])
      expect(parallel[8]!.rows).toEqual([{ id: f.orgId }])
      for (const plan of parallel.slice(0, 8))
        expect(plan.rows[0]!['QUERY PLAN'][0].Plan['Actual Rows']).toBe(5)
      const measurements = parallel.slice(0, 8).map(plan => plan.rows[0]!['QUERY PLAN'][0]['Execution Time'])
      console.log('Bento 100k PostgreSQL plans', JSON.stringify({
        due: due.rows[0]!['QUERY PLAN'][0],
        budget: budget.rows[0]!['QUERY PLAN'][0],
        parallelExecutionMs: measurements,
      }))
    }
    finally { await f.cleanup() }
  })
})
