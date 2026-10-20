import type { QueryResultRow } from 'pg'
import type { QueryClient, ReadOnlyContext } from '../cloudflare_workers/bento_dispatch/contracts.ts'
import type { Product } from '../cloudflare_workers/bento_dispatch/flows/lifecycle/evidence.ts'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createPgliteEngine, Database } from 'tinbase'
import { expect, it, vi } from 'vitest'
import { lifecycleEvaluation } from '../cloudflare_workers/bento_dispatch/flows/lifecycle/index.ts'
import { claimDueLifecycleJourneys, refreshLifecycleJourneys } from '../cloudflare_workers/bento_dispatch/flows/lifecycle/refresh.ts'

interface PlanNode {
  'Node Type': string
  'Relation Name'?: string
  'Alias'?: string
  'Index Name'?: string
  'Index Cond'?: string
  'Actual Rows': number
  'Rows Removed by Filter'?: number
  'Shared Hit Blocks'?: number
  'Shared Read Blocks'?: number
  'Plans'?: PlanNode[]
}

function nodes(plan: PlanNode): PlanNode[] {
  return [plan, ...(plan.Plans ?? []).flatMap(nodes)]
}

it('bounds actual recurring selection over 200,000 mostly-idle journeys with sparse, other-product and empty candidate sets', async () => {
  const db = await Database.create(await createPgliteEngine())
  const seed = randomUUID()
  const organizations = 100_000
  try {
    // Representative parent keys/FKs; dispatch and lifecycle tables, indexes
    // and triggers come from the exact migrations. No planner setting is forced.
    await db.exec(`
      CREATE TABLE public.users(id uuid PRIMARY KEY, created_at timestamptz NOT NULL,
        onboarding jsonb NOT NULL DEFAULT '{}', created_via_invite boolean NOT NULL DEFAULT false,
        email_preferences jsonb NOT NULL DEFAULT '{}', enable_notifications boolean NOT NULL DEFAULT true,
        opt_for_newsletters boolean NOT NULL DEFAULT true, email text);
      CREATE TABLE public.orgs(id uuid PRIMARY KEY, created_by uuid NOT NULL REFERENCES public.users(id), name text NOT NULL DEFAULT 'Selection fixture',
        onboarding jsonb NOT NULL DEFAULT '{}', email_preferences jsonb NOT NULL DEFAULT '{}', management_email text,
        customer_id text, has_usage_credits boolean NOT NULL DEFAULT false);
      CREATE INDEX finx_orgs_created_by ON public.orgs(created_by);
      CREATE INDEX idx_orgs_customer_id ON public.orgs(customer_id);
      CREATE TABLE public.apps(id uuid PRIMARY KEY, app_id text NOT NULL UNIQUE, owner_org uuid NOT NULL REFERENCES public.orgs(id),
        created_at timestamptz NOT NULL, onboarding jsonb NOT NULL DEFAULT '{}');
      CREATE INDEX finx_apps_owner_org ON public.apps(owner_org);
      CREATE TABLE public.stripe_info(customer_id text PRIMARY KEY, status text, trial_at timestamptz, subscription_id text,paid_at timestamptz,
        build_time_exceeded boolean,subscription_anchor_start timestamptz,subscription_anchor_end timestamptz);
      CREATE TABLE public.role_bindings(principal_type text,principal_id uuid,scope_type text,org_id uuid,is_direct boolean,expires_at timestamptz);
      CREATE TABLE public.org_metrics_cache(org_id uuid,start_date date,end_date date,cached_at timestamptz,
        mau numeric,storage numeric,bandwidth numeric,build_time_unit numeric);
      CREATE TABLE public.plans(name text,price_m numeric,mau numeric,storage numeric,bandwidth numeric,build_time_unit numeric);
      CREATE TABLE public.build_requests(id uuid PRIMARY KEY, app_id text NOT NULL, owner_org uuid NOT NULL,
        created_at timestamptz NOT NULL, status text NOT NULL, completed_at timestamptz, builder_job_id text,
        upload_session_key text NOT NULL, platform text NOT NULL);
      CREATE TABLE public.onboarding_demo_data(app_id text NOT NULL, seed_id uuid NOT NULL, relation_name text NOT NULL,
        row_key text NOT NULL, PRIMARY KEY(seed_id,relation_name,row_key), UNIQUE(app_id,relation_name,row_key));
    `)
    await db.exec(readFileSync('supabase/migrations/20261017131933_bento_invitation_dispatches.sql', 'utf8'))
    await db.exec(readFileSync('supabase/migrations/20261019130017_bento_evaluation_state.sql', 'utf8'))
    await db.exec(readFileSync('supabase/migrations/20261020145512_organization_lifecycle_v2.sql', 'utf8'))
    await db.exec(readFileSync('supabase/migrations/20261020160725_lifecycle_monitoring_evidence.sql', 'utf8'))
    await db.query(`INSERT INTO public.users(id,created_at,email)
      SELECT md5($1 || ':user:' || n)::uuid,CURRENT_TIMESTAMP,'selection-' || n || '@example.com'
      FROM generate_series(1,$2::integer) n`, [seed, organizations])
    await db.query(`INSERT INTO public.orgs(id,created_by)
      SELECT md5($1 || ':org:' || n)::uuid,md5($1 || ':user:' || n)::uuid
      FROM generate_series(1,$2::integer) n`, [seed, organizations])
    // Internal storage fixture: candidate production/evidence is tested in the
    // evaluator suites. Idle rows sort before the few selectable rows.
    await db.query(`INSERT INTO public.bento_lifecycle_journeys(org_id,product,next_evaluation_at)
      SELECT md5($1 || ':org:' || n)::uuid,product,'2026-01-01'::timestamptz
      FROM generate_series(1,$2::integer) n CROSS JOIN (VALUES ('ota'),('builder')) products(product)`, [seed, organizations])
    await db.exec('ANALYZE public.users; ANALYZE public.orgs; ANALYZE public.bento_event_dispatches;')
    expect((await db.query('SHOW enable_seqscan')).rows).toEqual([{ enable_seqscan: 'on' }])
    expect((await db.query('SELECT count(*)::integer AS count FROM public.bento_lifecycle_journeys')).rows).toEqual([{ count: organizations * 2 }])

    // SQL NULL and JSON null decode identically in JavaScript, but only SQL NULL
    // stays out of the partial index. Exercise the real refresher's SQL writes.
    await db.query(`UPDATE public.bento_lifecycle_journeys SET candidate='null'::jsonb,next_evaluation_at='2025-01-01'
      WHERE org_id=md5($1 || ':org:1')::uuid AND product='ota'`, [seed])
    const nullState = () => db.query(`SELECT candidate IS NULL AS sql_null,candidate='null'::jsonb AS json_null
      FROM public.bento_lifecycle_journeys WHERE org_id=md5($1 || ':org:1')::uuid AND product='ota'`, [seed])
    expect((await nullState()).rows).toEqual([{ sql_null: false, json_null: true }])
    const read: ReadOnlyContext = { query: async <T extends QueryResultRow>(sql: string, values?: unknown[]) => (await db.query<T>(sql, values)).rows }
    expect(await lifecycleEvaluation('ota').findEligibleUsers(read)).toEqual([])
    const client: QueryClient = {
      query: async <T extends QueryResultRow>(sql: string, values?: unknown[]) => {
        const result = await db.query<T>(sql, values)
        return { rows: result.rows, rowCount: result.affectedRows ?? result.rows.length, command: '', oid: 0, fields: [] }
      },
    }
    expect(await refreshLifecycleJourneys(client, null)).toMatchObject({ claimed: 20, processed: 20, deferred: 0, oldestDueAt: '2025-01-01T00:00:00.000Z', saturated: true })
    expect((await nullState()).rows).toEqual([{ sql_null: true, json_null: null }])
    expect((await db.query('SELECT count(*)::integer AS count FROM public.bento_lifecycle_journeys WHERE candidate IS NOT NULL')).rows).toEqual([{ count: 0 }])

    async function select(product: Product, phase: string, expected: number) {
      const read: ReadOnlyContext = {
        query: async <T extends QueryResultRow>(sql: string, values?: unknown[]) => {
          // EXPLAIN and execute the exact SQL supplied by production selection,
          // including joins, sibling arbitration, ordering and its LIMIT.
          const { rows } = await db.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${sql}`, values)
          const analyzed = rows[0]['QUERY PLAN'][0]
          const plan = nodes(analyzed.Plan)
          const index = plan.find(node => node['Index Name'] === 'bento_lifecycle_candidates')
          expect(index, `${phase}/${product}: candidate index`).toBeDefined()
          expect(index!['Index Cond']).toContain(`'${product}'`)
          expect(index!['Index Cond']).toContain('product')
          expect(plan.filter(node => ['bento_lifecycle_journeys', 'orgs', 'users'].includes(node['Relation Name'] ?? '') && node['Node Type'] === 'Seq Scan')).toEqual([])
          const journey = plan.find(node => node.Alias === 'j')!
          expect(journey['Actual Rows']).toBeLessThanOrEqual(20)
          expect(journey['Rows Removed by Filter'] ?? 0).toBeLessThanOrEqual(32)
          expect(analyzed.Plan['Actual Rows']).toBe(expected)
          console.info(`Lifecycle recurring selection plan: ${JSON.stringify({ phase, product, journeys: organizations * 2, returned: expected, index: index!['Index Name'], journeyRows: journey['Actual Rows'], removed: journey['Rows Removed by Filter'] ?? 0, planningMs: analyzed['Planning Time'], executionMs: analyzed['Execution Time'], sharedHitBlocks: analyzed.Plan['Shared Hit Blocks'], sharedReadBlocks: analyzed.Plan['Shared Read Blocks'] })}`)
          return (await db.query<T>(sql, values)).rows
        },
      }
      const selected = await lifecycleEvaluation(product).findEligibleUsers(read)
      expect(selected).toHaveLength(expected)
      expect(selected.every(user => user.metadata.product === product)).toBe(true)
      const { rows: ordered } = await db.query(`SELECT org_id FROM public.bento_lifecycle_journeys
        WHERE product=$1 AND candidate->>'context'='selection-fixture' ORDER BY next_evaluation_at,org_id LIMIT 20`, [product])
      expect(selected.map(user => user.contextKey)).toEqual(ordered.map(row => row.org_id))
    }

    const candidate = JSON.stringify({ purpose: 'recovery:24h', branch: 'setup_recovery_24h', context: 'selection-fixture', priority: 40, expiresAt: '2099-01-01T00:00:00.000Z' })
    await db.query(`UPDATE public.bento_lifecycle_journeys SET candidate=$2::jsonb,next_evaluation_at='2026-01-02'::timestamptz
      WHERE (product='ota' AND org_id IN (SELECT md5($1 || ':org:' || n)::uuid FROM generate_series(99993,100000) n))
        OR (product='builder' AND org_id IN (SELECT md5($1 || ':org:' || n)::uuid FROM generate_series(99000,99031) n))`, [seed, candidate])
    const rejected = JSON.stringify({ ...JSON.parse(candidate), context: 'selection-rejected' })
    await db.query(`UPDATE public.bento_lifecycle_journeys SET candidate=$2::jsonb,next_evaluation_at='2026-01-01T12:00:00Z'
      WHERE product='ota' AND org_id IN (SELECT md5($1 || ':org:' || n)::uuid FROM generate_series(99990,99992) n)`, [seed, rejected])
    await db.query(`UPDATE public.bento_lifecycle_journeys SET candidate=jsonb_set(candidate,'{expiresAt}','"2020-01-01T00:00:00Z"')
      WHERE org_id=md5($1 || ':org:99992')::uuid AND product='ota'`, [seed])
    await db.query(`INSERT INTO public.bento_event_dispatches(flow_key,context_key,recipient_key,email,tag,status,attempt_count)
      SELECT 'lifecycle:v2:org',id::text,'org:' || id::text,'selection-rejected@example.com','recovery:24h',status,attempts
      FROM (VALUES (99990,'accepted',1),(99991,'failed',5)) rejected(n,status,attempts)
      CROSS JOIN LATERAL (SELECT md5($1 || ':org:' || n)::uuid AS id) ids`, [seed])
    await db.exec('ANALYZE public.bento_lifecycle_journeys;')
    await select('ota', 'sparse', 8)
    await select('builder', 'sparse', 20)
    await db.exec('UPDATE public.bento_lifecycle_journeys SET candidate=NULL WHERE product=\'ota\' AND candidate->>\'context\'=\'selection-fixture\'; ANALYZE public.bento_lifecycle_journeys;')
    await select('ota', 'rejected-only', 0)
    await select('builder', 'rejected-only', 20)
    await db.exec('UPDATE public.bento_lifecycle_journeys SET candidate=NULL WHERE product=\'ota\' AND candidate IS NOT NULL; ANALYZE public.bento_lifecycle_journeys;')
    await select('ota', 'builder-only', 0)
    await select('builder', 'builder-only', 20)
    await db.exec('UPDATE public.bento_lifecycle_journeys SET candidate=NULL WHERE candidate IS NOT NULL; ANALYZE public.bento_lifecycle_journeys;')
    await select('ota', 'empty', 0)
    await select('builder', 'empty', 0)

    // Charge one second per real SQL request. Gathering the entire batch must
    // not consume the processing budget and defer every claimed journey.
    let time = Date.now()
    const clock = vi.spyOn(Date, 'now').mockImplementation(() => time)
    try {
      const slow: QueryClient = { query: async (sql, values) => {
        time += 1000
        return client.query(sql, values)
      } }
      const result = await refreshLifecycleJourneys(slow, null)
      expect(result.claimed).toBe(20)
      expect(result.processed).toBeGreaterThan(0)
      expect(result.deferred).toBeGreaterThan(0)
      expect(result.processed + result.deferred).toBe(result.claimed)
    }
    finally {
      clock.mockRestore()
    }

    await db.exec('UPDATE public.bento_lifecycle_journeys SET next_evaluation_at=\'2099-01-01T00:00:00Z\',refresh_claim_until=NULL,refresh_claim_token=NULL;')
    await db.query(`UPDATE public.bento_lifecycle_journeys SET next_evaluation_at='2000-01-01T00:00:00Z'
      WHERE org_id IN (SELECT md5($1 || ':org:' || n)::uuid FROM generate_series(101,120) n)`, [seed])
    // Prior phases moved every timestamp. Remove their dead index entries
    // before measuring a steady mostly-future cohort; this is not a churn or
    // autovacuum-capacity benchmark. Planner settings remain unchanged.
    await db.exec('VACUUM (ANALYZE) public.bento_lifecycle_journeys;')
    for (const expected of [20, 20, 0]) {
      const claiming: QueryClient = { query: async <T extends QueryResultRow>(sql: string, values?: unknown[]) => {
        await db.exec('BEGIN; SAVEPOINT claim_plan;')
        try {
          const { rows } = await db.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${sql}`, values)
          const analyzed = rows[0]['QUERY PLAN'][0]
          const plan = nodes(analyzed.Plan)
          console.info(`Lifecycle due claim plan: ${JSON.stringify({ journeys: organizations * 2, future: organizations * 2 - 40, returned: expected, executionMs: analyzed['Execution Time'], sharedHitBlocks: analyzed.Plan['Shared Hit Blocks'], sharedReadBlocks: analyzed.Plan['Shared Read Blocks'] })}`)
          expect(plan.some(node => node['Index Name'] === 'bento_lifecycle_due')).toBe(true)
          expect(plan.filter(node => node['Relation Name'] === 'bento_lifecycle_journeys' && node['Node Type'] === 'Seq Scan')).toEqual([])
          expect(analyzed.Plan['Shared Hit Blocks'] + analyzed.Plan['Shared Read Blocks']).toBeLessThan(2000)
          expect(analyzed.Plan['Actual Rows']).toBe(expected)
          await db.exec('ROLLBACK TO SAVEPOINT claim_plan;')
          const result = await client.query<T>(sql, values)
          await db.exec('COMMIT;')
          return result
        }
        catch (error) {
          await db.exec('ROLLBACK;')
          throw error
        }
      } }
      expect((await claimDueLifecycleJourneys(claiming)).rows).toHaveLength(expected)
    }
    expect((await db.query(`SELECT count(*)::integer AS count FROM public.bento_lifecycle_journeys
      WHERE next_evaluation_at='2099-01-01T00:00:00Z' AND refresh_claim_token IS NULL`)).rows).toEqual([{ count: organizations * 2 - 40 }])
  }
  finally {
    await db.close()
  }
}, 120_000)
