import type { QueryResultRow } from 'pg'
import type { QueryClient } from '../cloudflare_workers/bento_dispatch/contracts.ts'
import { randomUUID } from 'node:crypto'
import { Pool } from 'pg'
import { afterAll, expect, it } from 'vitest'
import { claimDueLifecycleJourneys, refreshLifecycleJourneys } from '../cloudflare_workers/bento_dispatch/flows/lifecycle/refresh.ts'
import { LIFECYCLE_SOURCE_SQL } from '../cloudflare_workers/bento_dispatch/flows/lifecycle/source.ts'
import { executeSQL, POSTGRES_URL, USER_ID } from './test-utils.ts'

const pool = new Pool({ connectionString: POSTGRES_URL, max: 4 })
afterAll(() => pool.end())

async function cohort(count: number) {
  const ids = Array.from({ length: count + 1 }, () => randomUUID())
  await executeSQL(`INSERT INTO public.orgs(id,name,management_email,created_by)
    SELECT id,'Lifecycle refresh ' || id::text,'lifecycle-refresh@example.com',$2 FROM unnest($1::uuid[]) id`, [ids, USER_ID])
  await executeSQL(`INSERT INTO public.bento_lifecycle_journeys(org_id,product,next_evaluation_at)
    SELECT id,product,'2000-01-01'::timestamptz FROM unnest($1::uuid[]) id
    CROSS JOIN (VALUES ('ota'),('builder')) products(product)
    ON CONFLICT (org_id,product) DO UPDATE SET next_evaluation_at=EXCLUDED.next_evaluation_at`, [ids.slice(0, count)])
  await executeSQL(`INSERT INTO public.bento_lifecycle_journeys(org_id,product,next_evaluation_at)
    SELECT $1::uuid,product,'2099-01-01T00:00:00Z'::timestamptz FROM (VALUES ('ota'),('builder')) products(product)
    ON CONFLICT (org_id,product) DO UPDATE SET next_evaluation_at=EXCLUDED.next_evaluation_at`, [ids[count]])
  return {
    ids,
    future: ids[count],
    cleanup: async () => {
      await executeSQL('DELETE FROM public.bento_event_dispatches WHERE context_key=ANY($1::text[]) AND flow_key LIKE \'lifecycle:v2:%\'', [ids])
      await executeSQL('DELETE FROM public.orgs WHERE id=ANY($1::uuid[])', [ids])
      await executeSQL('DELETE FROM public.stripe_info WHERE customer_id=ANY($1::text[])', [ids.map(id => `pending_${id}`)])
    },
  }
}

it('claims disjoint oldest groups on separate PostgreSQL connections and never claims future journeys', async () => {
  const f = await cohort(40)
  const first = await pool.connect()
  const second = await pool.connect()
  try {
    const expected = await executeSQL<{ org_id: string, product: string }>(`SELECT org_id,product FROM public.bento_lifecycle_journeys
      WHERE org_id=ANY($1::uuid[]) AND org_id<>$2 ORDER BY next_evaluation_at,org_id,product LIMIT 40`, [f.ids, f.future])
    const groups = await Promise.all([claimDueLifecycleJourneys(first), claimDueLifecycleJourneys(second)])
    expect(groups.map(group => group.rows.length)).toEqual([20, 20])
    const selected = groups.flatMap(group => group.rows.map(row => `${row.org_id}:${row.product}`)).sort()
    expect(new Set(selected).size).toBe(40)
    expect(selected).toEqual(expected.map(row => `${row.org_id}:${row.product}`).sort())
    const future = await executeSQL(`SELECT refresh_claim_token,next_evaluation_at='2099-01-01T00:00:00Z'::timestamptz AS unchanged
      FROM public.bento_lifecycle_journeys WHERE org_id=$1`, [f.future])
    expect(future).toHaveLength(2)
    expect(future.every(row => row.refresh_claim_token === null && row.unchanged)).toBe(true)
  }
  finally {
    first.release()
    second.release()
    await f.cleanup()
  }
})

it('keeps a concurrent real organization wakeup from being overwritten by an older refresh snapshot', async () => {
  const f = await cohort(10)
  const client = await pool.connect()
  let unblock!: () => void
  let loaded!: (value: { orgId: string, product: string, revision: number }) => void
  const resumed = new Promise<void>((resolve) => {
    unblock = resolve
  })
  const snapshot = new Promise<{ orgId: string, product: string, revision: number }>((resolve) => {
    loaded = resolve
  })
  let intercepted = false
  const db: QueryClient = { query: async <T extends QueryResultRow>(sql: string, values?: unknown[]) => {
    const result = await client.query<T>(sql, values)
    if (sql === LIFECYCLE_SOURCE_SQL && !intercepted) {
      intercepted = true
      loaded({ orgId: String(values![0]), product: String(values![1]), revision: Number(result.rows[0].revision) })
      await resumed
    }
    return result
  } }
  const work = refreshLifecycleJourneys(db, null)
  try {
    const before = await Promise.race([snapshot, work.then(() => {
      throw new Error('Expected an in-flight source snapshot')
    })])
    expect(f.ids).toContain(before.orgId)
    await executeSQL(`UPDATE public.orgs SET email_preferences='{"onboarding":false}'::jsonb WHERE id=$1`, [before.orgId])
    await executeSQL(`UPDATE public.bento_lifecycle_journeys SET state='{"sentinel":"new-source-state"}'::jsonb
      WHERE org_id=$1 AND product=$2`, [before.orgId, before.product])
    unblock()
    const result = await work
    expect(result.claimed).toBe(20)
    expect(result.processed).toBe(19)
    expect(result.deferred).toBe(1)
    const [after] = await executeSQL<{ revision: string, state: unknown, candidate: unknown }>(`SELECT revision,state,candidate FROM public.bento_lifecycle_journeys
      WHERE org_id=$1 AND product=$2`, [before.orgId, before.product])
    expect(Number(after!.revision)).toBeGreaterThan(before.revision)
    expect(after!.state).toEqual({ sentinel: 'new-source-state' })
    expect(after!.candidate).toBeNull()
  }
  finally {
    unblock()
    await work.catch(() => {})
    client.release()
    await f.cleanup()
  }
})
