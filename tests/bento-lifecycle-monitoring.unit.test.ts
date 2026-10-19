import type { DispatchRecord, EligibleUser, QueryClient } from '../cloudflare_workers/bento_dispatch/contracts.ts'
import type { LifecycleInput } from '../cloudflare_workers/bento_dispatch/flows/lifecycle/types.ts'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createPgliteEngine, Database } from 'tinbase'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { evaluateLifecycle, evaluateLifecycleDecision } from '../cloudflare_workers/bento_dispatch/flows/lifecycle/evaluate.ts'
import { recordLifecycleAttempt, recordLifecycleDecision, recordLifecycleSnapshot } from '../cloudflare_workers/bento_dispatch/flows/lifecycle/monitoring.ts'
import { buildLifecycleEvent } from '../cloudflare_workers/bento_dispatch/flows/lifecycle/payload.ts'
import { refreshLifecycleJourneys } from '../cloudflare_workers/bento_dispatch/flows/lifecycle/refresh.ts'
import { createMutationContext } from '../cloudflare_workers/bento_dispatch/helpers.ts'
import { DispatchStore } from '../cloudflare_workers/bento_dispatch/store.ts'

let db: Database
let client: QueryClient
const after = (hours: number, from = Date.now()) => new Date(from + hours * 3_600_000).toISOString()
const treatment = { intent: 'ota', abtests_enrolled: ['new_emails_v2'], abtests: { new_emails_v2: { branch: 'A', assigned_at: '2026-10-18T01:00:00.000Z' } } }

beforeAll(async () => {
  db = await Database.create(await createPgliteEngine())
  // Real migrations own the evidence schema, grants, indexes and views. Only
  // unrelated parent tables are reduced to their relevant keyed columns.
  await db.exec(`CREATE TABLE public.users(id uuid PRIMARY KEY, created_at timestamptz NOT NULL,
      onboarding jsonb NOT NULL DEFAULT '{}', created_via_invite boolean NOT NULL DEFAULT false,
      email_preferences jsonb NOT NULL DEFAULT '{}', enable_notifications boolean NOT NULL DEFAULT true,
      opt_for_newsletters boolean NOT NULL DEFAULT true, email text);
    CREATE TABLE public.orgs(id uuid PRIMARY KEY, created_by uuid NOT NULL REFERENCES public.users(id),name text NOT NULL DEFAULT 'Example organization',
      onboarding jsonb NOT NULL DEFAULT '{}',email_preferences jsonb NOT NULL DEFAULT '{}',management_email text,
      customer_id text,has_usage_credits boolean NOT NULL DEFAULT false);
    CREATE INDEX finx_orgs_created_by ON public.orgs(created_by);
    CREATE INDEX idx_orgs_customer_id ON public.orgs(customer_id);
    CREATE TABLE public.apps(id uuid PRIMARY KEY,app_id text UNIQUE,owner_org uuid REFERENCES public.orgs(id),
      created_at timestamptz NOT NULL,onboarding jsonb NOT NULL DEFAULT '{}');
    CREATE INDEX finx_apps_owner_org ON public.apps(owner_org);
    CREATE TYPE public.stripe_status AS ENUM('created','succeeded','updated','failed','deleted','canceled');
    CREATE TABLE public.stripe_info(customer_id text PRIMARY KEY,status public.stripe_status,trial_at timestamptz,subscription_id text,paid_at timestamptz);
    CREATE TABLE public.role_bindings(principal_type text,principal_id uuid,scope_type text,org_id uuid,is_direct boolean,expires_at timestamptz);
    CREATE TABLE public.org_metrics_cache(org_id uuid,start_date date,end_date date,cached_at timestamptz,mau bigint,storage bigint,bandwidth bigint,build_time_unit bigint);
    CREATE TABLE public.plans(name text,price_m numeric,mau bigint,storage bigint,bandwidth bigint,build_time_unit bigint);
    CREATE TABLE public.build_requests(id uuid PRIMARY KEY,app_id text,owner_org uuid,created_at timestamptz,
      status text,completed_at timestamptz,builder_job_id text,upload_session_key text,platform text);
    CREATE TABLE public.onboarding_demo_data(app_id text,seed_id uuid,relation_name text,row_key text,
      PRIMARY KEY(seed_id,relation_name,row_key),UNIQUE(app_id,relation_name,row_key));`)
  for (const name of ['20261017131933_bento_invitation_dispatches', '20261017144842_organization_lifecycle_v2', '20261019095333_lifecycle_monitoring_evidence'])
    await db.exec(readFileSync(`supabase/migrations/${name}.sql`, 'utf8'))
  client = { query: async (sql, values) => {
    const result = await db.query(sql, values)
    return { ...result, rowCount: result.affectedRows ?? result.rows.length }
  } } as QueryClient
}, 30_000)

afterAll(async () => db?.close())

async function fixture() {
  const orgId = randomUUID()
  const creatorId = randomUUID()
  const recipientId = randomUUID()
  await db.query(`INSERT INTO public.users(id,created_at,onboarding,email) VALUES($1,'2026-10-18T00:00:00Z',$2::jsonb,'creator@example.com')`, [creatorId, JSON.stringify(treatment)])
  await db.query(`INSERT INTO public.orgs(id,created_by,onboarding) VALUES($1,$2,'{"intent":"ota"}')`, [orgId, creatorId])
  const input: LifecycleInput = {
    now: after(0),
    orgId,
    orgName: 'Example organization',
    product: 'ota',
    recipientId,
    email: 'owner@example.com',
    creatorTreatment: true,
    consent: true,
    selected: true,
    shippingIntent: true,
    supportHold: false,
    paused: false,
    evidence: null,
    sourceHealthy: true,
    state: { enrolledAt: after(-48), lastProgressAt: after(-48), appLessSince: after(-48), checklistCompleteAt: null, firstValueAt: null, batch: null },
    accepted: [],
    trialDeadline: null,
    billingHealthy: true,
    paid: false,
    compatibleCredits: false,
    plan: null,
  }
  const decision = evaluateLifecycleDecision(input)
  const user: EligibleUser = {
    flowKey: 'lifecycle:v2:org',
    contextKey: orgId,
    recipientKey: `org:${orgId}`,
    email: input.email,
    tag: decision.candidate!.purpose,
    action: 'send',
    reason: decision.reason,
    metadata: { orgId, product: 'ota', recipientId, revision: 1, ...decision.candidate },
  }
  await db.query(`UPDATE public.bento_lifecycle_journeys SET revision=1,state=$2::jsonb,candidate=$3::jsonb WHERE org_id=$1`, [orgId, JSON.stringify(input.state), JSON.stringify(decision.candidate)])
  const event = { id: randomUUID(), flow_key: user.flowKey, context_key: orgId, recipient_key: user.recipientKey, email: input.email, tag: user.tag, status: 'sending', claim_token: randomUUID(), attempt_count: 1 } satisfies DispatchRecord
  await db.query(`INSERT INTO public.bento_event_dispatches(id,flow_key,context_key,recipient_key,email,tag,status,claim_token,claim_until,attempt_count,last_attempt_at,details)
    VALUES($1,$2,$3,$4,$5,$6,'sending',$7,CURRENT_TIMESTAMP+INTERVAL '2 minutes',1,CURRENT_TIMESTAMP,$8::jsonb)`, [event.id, user.flowKey, orgId, user.recipientKey, input.email, user.tag, event.claim_token, JSON.stringify({ metadata: user.metadata })])
  return { orgId, creatorId, recipientId, input, decision, user, event }
}

describe('durable lifecycle monitoring evidence', () => {
  it('keeps changed decisions append-only and leaves decision cohorts unchanged on a heartbeat', async () => {
    const f = await fixture()
    const provenance = { originalCreatorId: f.creatorId, sourceVerifiedAt: f.input.now }
    await recordLifecycleDecision(client, f.input, f.decision, 1, after(1), provenance)
    const first = (await db.query('SELECT * FROM public.bento_lifecycle_monitor_v1 WHERE org_id=$1', [f.orgId])).rows[0]
    f.input.now = after(0.1)
    provenance.sourceVerifiedAt = f.input.now
    await recordLifecycleDecision(client, f.input, evaluateLifecycleDecision(f.input), 1, after(2), provenance)
    const second = (await db.query('SELECT * FROM public.bento_lifecycle_monitor_v1 WHERE org_id=$1', [f.orgId])).rows[0]
    expect(second.decision_id).toBe(first.decision_id)
    expect(second.evaluated_at).toEqual(first.evaluated_at)
    expect(new Date(second.source_verified_at).getTime()).toBe(Date.parse(f.input.now))
    expect(new Date(second.last_evaluated_at).getTime()).toBeGreaterThan(new Date(first.last_evaluated_at).getTime())
    expect((await db.query('SELECT id FROM public.bento_lifecycle_decisions WHERE org_id=$1', [f.orgId])).rows).toHaveLength(1)
    f.input.supportHold = true
    f.input.now = after(0.2)
    await db.query('UPDATE public.bento_lifecycle_journeys SET candidate=NULL WHERE org_id=$1', [f.orgId])
    await recordLifecycleDecision(client, f.input, evaluateLifecycleDecision(f.input), 1, after(7 * 24), provenance)
    const rows = (await db.query('SELECT * FROM public.bento_lifecycle_monitor_v1 WHERE org_id=$1', [f.orgId])).rows
    expect(rows).toHaveLength(2)
    expect(rows.find(row => row.is_current)).toMatchObject({ decision: 'suppress', reason: 'support_hold', recipient_email: f.input.email })
    expect(rows.find(row => row.purpose)).toMatchObject({ is_current: false })
    expect((await db.query('SELECT id FROM public.bento_lifecycle_decisions WHERE org_id=$1', [f.orgId])).rows).toHaveLength(2)
  })

  it('detects eligible organization enrollment omissions without requiring an outbox or decision row', async () => {
    const f = await fixture()
    await db.query('DELETE FROM public.bento_lifecycle_journeys WHERE org_id=$1', [f.orgId])
    const rows = (await db.query('SELECT * FROM public.bento_lifecycle_due_v1 WHERE org_id=$1', [f.orgId])).rows
    expect(rows).toEqual([expect.objectContaining({ org_id: f.orgId, product: 'ota', journey_missing: true, reason: 'journey_missing', send_eligibility: 'unknown', last_evaluated_at: null, due_scope: 'evaluation' })])
    await db.query('UPDATE public.users SET created_via_invite=true WHERE id=$1', [f.creatorId])
    expect((await db.query('SELECT * FROM public.bento_lifecycle_due_v1 WHERE org_id=$1', [f.orgId])).rows).toEqual([])
  })

  it('archives each retry separately, drops arbitrary fields and rejects token-bearing URLs', async () => {
    const f = await fixture()
    const payload = buildLifecycleEvent(f.input, f.decision.candidate!, f.event.id, 'https://console.example.com')
    payload.data.arbitrary_secret = 'must not persist'
    await recordLifecycleSnapshot(client, f.user, f.event, payload)
    f.user.email = 'replacement-owner@example.com'
    f.input.email = f.user.email
    f.event.attempt_count = 2
    const retryPayload = buildLifecycleEvent(f.input, f.decision.candidate!, f.event.id, 'https://console.example.com')
    await recordLifecycleSnapshot(client, f.user, f.event, retryPayload)
    const rows = (await db.query('SELECT * FROM public.bento_lifecycle_snapshots_v1 WHERE dispatch_id=$1 ORDER BY attempt_number', [f.event.id])).rows
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ recipient_email: 'owner@example.com', content_evidence: 'expected_send_request' })
    expect(rows[1]).toMatchObject({ recipient_email: 'replacement-owner@example.com' })
    expect(rows[0].snapshot_checksum).not.toBe(rows[1].snapshot_checksum)
    expect(rows[0].personalization).not.toHaveProperty('arbitrary_secret')
    await recordLifecycleDecision(client, { ...f.input, email: 'new-intention@example.com' }, f.decision, 1, after(1), { originalCreatorId: f.creatorId, sourceVerifiedAt: f.input.now })
    const monitored = (await db.query('SELECT * FROM public.bento_lifecycle_monitor_v1 WHERE org_id=$1 AND purpose=$2', [f.orgId, f.user.tag])).rows[0]
    expect(monitored).toMatchObject({ recipient_email: 'replacement-owner@example.com', intended_recipient_email: 'new-intention@example.com' })
    retryPayload.data.email_subject = 'A different request under an existing attempt'
    await expect(recordLifecycleSnapshot(client, f.user, f.event, retryPayload)).rejects.toThrow('already differs')
    f.event.attempt_count = 3
    retryPayload.data.continue_url = 'https://console.example.com/path?token=never-archive'
    await expect(recordLifecycleSnapshot(client, f.user, f.event, retryPayload)).rejects.toThrow('Unsafe lifecycle snapshot URL')
    expect((await db.query('SELECT id FROM public.bento_lifecycle_send_snapshots WHERE dispatch_id=$1', [f.event.id])).rows).toHaveLength(2)
  })

  it('archives before sending and records accepted outcomes transactionally beside dispatch state', async () => {
    const f = await fixture()
    // Use the real store and helper across a provider boundary, backed by the
    // actual PostgreSQL migration rather than mirrored query mocks.
    await db.query('DELETE FROM public.bento_event_dispatches WHERE id=$1', [f.event.id])
    const store = new DispatchStore(client)
    const queued = (await store.schedule(`monitor-test:${randomUUID()}`, 1))!
    await store.markEnqueued(queued.id, queued.enqueue_claim_token!)
    const run = (await store.claimRun({ version: 1, evaluationKey: queued.evaluation_key, runId: queued.id }))!
    await store.recordFlowEvent(run, f.user, 'flow:started', 'fixture_enrolled')
    const send = vi.fn(async () => {
      const snapshots = await db.query('SELECT id FROM public.bento_lifecycle_send_snapshots WHERE org_id=$1', [f.orgId])
      expect(snapshots.rows).toHaveLength(1)
      return true
    })
    const ctx = createMutationContext(store, run, send)
    expect(await ctx.sendBentoEvent(f.user, async () => ({ action: 'send', buildEvent: id => buildLifecycleEvent(f.input, f.decision.candidate!, id, 'https://console.example.com') }))).toMatchObject({ outcome: 'accepted' })
    expect(send).toHaveBeenCalledOnce()
    const events = (await db.query('SELECT kind FROM public.bento_lifecycle_timeline_v1 WHERE org_id=$1 ORDER BY recorded_at,evidence_id', [f.orgId])).rows.map(row => row.kind)
    expect(events).toContain('claimed')
    expect(events).toContain('provider_request')
    expect(events).toContain('accepted')
    expect((await db.query('SELECT status FROM public.bento_event_dispatches WHERE context_key=$1 AND tag=$2', [f.orgId, f.user.tag])).rows).toEqual([{ status: 'accepted' }])
  })

  it('reports independent summary, escalation and Trial clocks without declaring eligibility or failing on malformed state', async () => {
    const f = await fixture()
    const incarnation = randomUUID()
    const batchOpened = after(-2)
    const batchLast = after(-1.9)
    await db.query(`UPDATE public.bento_lifecycle_journeys SET selected_app_incarnation=$2,state=$3::jsonb WHERE org_id=$1`, [f.orgId, incarnation, JSON.stringify({ ...f.input.state, batch: { key: 'fixed', incarnation, openedAt: batchOpened, lastAt: batchLast } })])
    let rows = (await db.query('SELECT * FROM public.bento_lifecycle_clock_candidates_v1 WHERE org_id=$1', [f.orgId])).rows
    expect(rows.find(row => row.purpose === 'summary:fixed')).toMatchObject({ send_eligibility: 'unknown', due_scope: 'clock' })
    expect(new Date(rows.find(row => row.purpose === 'summary:fixed').due_at).getTime()).toBe(Date.parse(batchOpened) + 900_000)
    await db.query(`UPDATE public.bento_event_dispatches SET status='accepted',event_at=CURRENT_TIMESTAMP-INTERVAL '25 hours' WHERE id=$1`, [f.event.id])
    rows = (await db.query('SELECT * FROM public.bento_lifecycle_clock_candidates_v1 WHERE org_id=$1', [f.orgId])).rows
    expect(rows.some(row => row.purpose === 'reminder:48h')).toBe(true)
    expect(rows.some(row => row.purpose === 'reminder:24h')).toBe(false)
    await db.query(`INSERT INTO public.stripe_info(customer_id,status,trial_at,subscription_id) VALUES($1,'created',CURRENT_TIMESTAMP+INTERVAL '8 days',NULL)`, [f.orgId])
    await db.query('UPDATE public.orgs SET customer_id=$2 WHERE id=$1', [f.orgId, f.orgId])
    rows = (await db.query('SELECT * FROM public.bento_lifecycle_clock_candidates_v1 WHERE org_id=$1', [f.orgId])).rows
    expect(rows.filter(row => row.purpose.startsWith('trial:'))).toHaveLength(7)
    await db.query(`UPDATE public.stripe_info SET status='succeeded',subscription_id='' WHERE customer_id=$1`, [f.orgId])
    expect((await db.query(`SELECT * FROM public.bento_lifecycle_clock_candidates_v1 WHERE org_id=$1 AND purpose LIKE 'trial:%'`, [f.orgId])).rows).toHaveLength(7)
    await db.query(`UPDATE public.bento_lifecycle_journeys SET state='{"lastProgressAt":"not a date","batch":{"key":"invalid","openedAt":"yesterday","lastAt":"bad"}}' WHERE org_id=$1`, [f.orgId])
    await expect(db.query('SELECT * FROM public.bento_lifecycle_clock_candidates_v1 WHERE org_id=$1', [f.orgId])).resolves.toBeDefined()
  })

  it('exposes only accepted/live v2 claims and keeps private evidence inaccessible and immutable to client roles', async () => {
    const f = await fixture()
    await recordLifecycleAttempt(client, f.user, 'claimed', 'dispatch_claimed', f.event)
    const rows = (await db.query('SELECT * FROM public.bento_lifecycle_claims_v1 WHERE org_id=$1', [f.orgId])).rows
    expect(rows).toEqual([expect.objectContaining({ dispatch_id: f.event.id, claim_status: 'sending', recipient_id: f.recipientId })])
    await db.query(`UPDATE public.bento_event_dispatches SET claim_until=CURRENT_TIMESTAMP-INTERVAL '1 minute' WHERE id=$1`, [f.event.id])
    expect((await db.query('SELECT * FROM public.bento_lifecycle_claims_v1 WHERE org_id=$1', [f.orgId])).rows).toEqual([])
    const views = ['monitor', 'due', 'clock_candidates', 'timeline', 'snapshots', 'claims', 'outcomes'].map(name => `bento_lifecycle_${name}_v1`)
    for (const name of [...views, 'bento_lifecycle_decisions', 'bento_lifecycle_evaluation_coverage', 'bento_lifecycle_attempts', 'bento_lifecycle_send_snapshots']) {
      const result = (await db.query(`SELECT has_table_privilege('anon',$1,'SELECT') AS anon_read,
        has_table_privilege('authenticated',$1,'SELECT') AS member_read,
        has_table_privilege('service_role',$1,'SELECT') AS internal_read`, [`public.${name}`])).rows[0]
      expect(result).toEqual({ anon_read: false, member_read: false, internal_read: true })
    }
    for (const name of ['decisions', 'attempts', 'send_snapshots']) {
      expect((await db.query(`SELECT has_table_privilege('service_role',$1,'UPDATE') AS can_update`, [`public.bento_lifecycle_${name}`])).rows).toEqual([{ can_update: false }])
    }
    await expect(db.query(`UPDATE public.bento_lifecycle_attempts SET reason='rewrite' WHERE org_id=$1`, [f.orgId])).rejects.toThrow('append-only')
  })

  it('gives null evaluator paths explicit reasons while preserving the existing candidate decision', async () => {
    const f = await fixture()
    for (const override of [{ supportHold: true }, { creatorTreatment: false }, { consent: false }, { selected: false }, { sourceHealthy: false }, { billingHealthy: false }]) {
      const input = { ...f.input, ...override }
      expect(evaluateLifecycleDecision(input).candidate).toEqual(evaluateLifecycle(input))
      expect(evaluateLifecycleDecision(input).reason).not.toBe('no_candidate_due')
      expect(evaluateLifecycle(input)).toBeNull()
    }
    f.input.now = f.input.state.enrolledAt
    expect(evaluateLifecycleDecision({ ...f.input, paid: true })).toMatchObject({ candidate: null, decision: 'suppress', reason: 'paid_commercial_suppressed' })
    expect(evaluateLifecycleDecision({ ...f.input, compatibleCredits: true })).toMatchObject({ candidate: null, decision: 'suppress', reason: 'usage_credits_commercial_suppressed' })
  })

  it('records decisions and refresh heartbeats through the real source and revision-fenced refresher', async () => {
    await db.query(`UPDATE public.bento_lifecycle_journeys SET next_evaluation_at=CURRENT_TIMESTAMP+INTERVAL '7 days'`)
    const f = await fixture()
    await db.query(`ALTER TABLE public.stripe_info ADD COLUMN IF NOT EXISTS build_time_exceeded boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS subscription_anchor_start timestamptz,ADD COLUMN IF NOT EXISTS subscription_anchor_end timestamptz`)
    await db.query(`INSERT INTO public.role_bindings VALUES('user',$1,'org',$2,true,NULL)`, [f.creatorId, f.orgId])
    await db.query(`INSERT INTO public.stripe_info(customer_id,status,trial_at) VALUES($1,'created',CURRENT_TIMESTAMP+INTERVAL '100 days')`, [f.orgId])
    await db.query(`UPDATE public.orgs SET customer_id=$2 WHERE id=$1`, [f.orgId, f.orgId])
    expect(await refreshLifecycleJourneys(client, null)).toBe(1)
    const row = (await db.query('SELECT * FROM public.bento_lifecycle_monitor_v1 WHERE org_id=$1 AND is_current', [f.orgId])).rows[0]
    expect(row).toMatchObject({ original_creator_id: f.creatorId, source_healthy: true, recipient_id: f.creatorId, recipient_email: 'creator@example.com', sender_ready: true })
    // This stacked base can lack PR3732's runtime config. The actual source
    // correctly records a closed cohort gate until that dependency is present.
    expect(['no_app_recovery_24h', 'creator_ineligible']).toContain(row.reason)
    expect((await db.query('SELECT refresh_claim_token FROM public.bento_lifecycle_journeys WHERE org_id=$1', [f.orgId])).rows).toEqual([{ refresh_claim_token: null }])
  })

  it('associates positive mature milestones with their own incarnation and leaves missing outcomes unknown', async () => {
    const f = await fixture()
    const incarnation = randomUUID()
    const payload = buildLifecycleEvent(f.input, f.decision.candidate!, f.event.id, 'https://console.example.com')
    payload.data.app_incarnation = incarnation
    await recordLifecycleSnapshot(client, f.user, f.event, payload)
    await db.query(`UPDATE public.bento_event_dispatches SET status='accepted',event_at=CURRENT_TIMESTAMP-INTERVAL '50 hours' WHERE id=$1`, [f.event.id])
    await db.query(`UPDATE public.bento_lifecycle_journeys SET selected_app_incarnation=$2 WHERE org_id=$1`, [f.orgId, incarnation])
    let outcome = (await db.query('SELECT * FROM public.bento_lifecycle_outcomes_v1 WHERE org_id=$1', [f.orgId])).rows[0]
    expect(outcome).toMatchObject({ setup48h_mature: true, setup48h_status: 'unknown', subscription7d_status: 'unknown', incarnation_matches: true, anchor_evidence: 'provider_acceptance' })
    const firstValueAt = after(-20)
    await db.query(`INSERT INTO public.bento_lifecycle_app_observations(org_id,product,app_incarnation,verified,verified_at,healthy)
      VALUES($1,'ota',$2,$3::jsonb,CURRENT_TIMESTAMP,true)`, [f.orgId, incarnation, JSON.stringify({ otaAppliedAt: firstValueAt })])
    outcome = (await db.query('SELECT * FROM public.bento_lifecycle_outcomes_v1 WHERE org_id=$1', [f.orgId])).rows[0]
    expect(outcome.setup48h_status).toBe('verified_value_observed')
    await db.query(`UPDATE public.bento_lifecycle_journeys SET selected_app_incarnation=$2,state=$3::jsonb WHERE org_id=$1`, [f.orgId, randomUUID(), JSON.stringify({ firstValueAt: after(-2) })])
    outcome = (await db.query('SELECT * FROM public.bento_lifecycle_outcomes_v1 WHERE org_id=$1', [f.orgId])).rows[0]
    expect(outcome.incarnation_matches).toBe(false)
    expect(new Date(outcome.first_value_at).getTime()).toBe(Date.parse(firstValueAt))
    expect(outcome.setup48h_status).toBe('verified_value_observed')
  })

  it('associates a mature first subscription only with matching privately archived billing continuity', async () => {
    const f = await fixture()
    const customerId = `cus_fixture_${f.orgId}`
    const payload = buildLifecycleEvent(f.input, f.decision.candidate!, f.event.id, 'https://console.example.com')
    await recordLifecycleSnapshot(client, f.user, f.event, payload, { billingCustomerId: customerId })
    expect(payload.data).not.toHaveProperty('billingCustomerId')
    const stored = (await db.query('SELECT billing_customer_fingerprint FROM public.bento_lifecycle_send_snapshots WHERE dispatch_id=$1', [f.event.id])).rows[0]
    expect(stored.billing_customer_fingerprint).toMatch(/^[a-f0-9]{64}$/)
    expect(stored.billing_customer_fingerprint).not.toContain(customerId)
    await db.query(`UPDATE public.bento_event_dispatches SET status='accepted',event_at=CURRENT_TIMESTAMP-INTERVAL '8 days' WHERE id=$1`, [f.event.id])
    await db.query(`INSERT INTO public.stripe_info(customer_id,status,subscription_id,paid_at)
      VALUES($1,'succeeded','sub_fixture',CURRENT_TIMESTAMP-INTERVAL '4 days')`, [customerId])
    await db.query('UPDATE public.orgs SET customer_id=$2 WHERE id=$1', [f.orgId, customerId])
    let outcome = (await db.query('SELECT * FROM public.bento_lifecycle_outcomes_v1 WHERE org_id=$1', [f.orgId])).rows[0]
    expect(outcome).toMatchObject({ subscription7d_mature: true, subscription7d_status: 'first_subscription_observed', billing_context_matches: true })
    expect(outcome).not.toHaveProperty('billing_customer_fingerprint')
    expect(outcome).not.toHaveProperty('customer_id')
    const inspected = (await db.query('SELECT * FROM public.bento_lifecycle_snapshots_v1 WHERE dispatch_id=$1', [f.event.id])).rows[0]
    expect(inspected).not.toHaveProperty('billing_customer_fingerprint')
    await db.query('UPDATE public.orgs SET customer_id=$2 WHERE id=$1', [f.orgId, `cus_replacement_fixture_${f.orgId}`])
    outcome = (await db.query('SELECT * FROM public.bento_lifecycle_outcomes_v1 WHERE org_id=$1', [f.orgId])).rows[0]
    expect(outcome).toMatchObject({ subscription7d_status: 'unknown', billing_context_matches: false, first_subscription_at: null })
  })
})
