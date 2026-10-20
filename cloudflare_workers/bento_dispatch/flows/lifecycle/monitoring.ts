import type { BentoEvent, DispatchRecord, EligibleUser, LifecycleSendAudit, QueryClient } from '../../contracts.ts'
import type { LifecycleDecision } from './evaluate.ts'
import type { LifecycleInput } from './types.ts'
import contract from '../../../../docs/bento/lifecycle-v2-contract.json' with { type: 'json' }
import { lifecycleBranch } from './payload.ts'
import { trialWindows } from './trial.ts'
import { DAY, HOUR, iso, ms } from './types.ts'

export const LIFECYCLE_MONITOR_POLICY = contract.version
const lifecycle = (user: EligibleUser) => user.flowKey.startsWith('lifecycle:v2:')

async function checksum(value: string) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('')
}

function reminderDueAt(input: LifecycleInput, purpose: string) {
  const idle = Math.max(ms(input.state.lastProgressAt), input.evidence ? 0 : ms(input.state.appLessSince))
  if (!Number.isFinite(idle))
    return null
  if (purpose === 'reminder:24h')
    return iso(idle + DAY)
  let previousPurpose = 'reminder:24h'
  let days = 2
  if (purpose === 'reminder:final') {
    previousPurpose = 'reminder:48h'
    days = 5
  }
  const previous = input.accepted.find(item => item.purpose === previousPurpose)
  return previous ? iso(Math.max(idle + days * DAY, ms(previous.acceptedAt) + DAY)) : null
}

function candidateDueAt(input: LifecycleInput, candidate: LifecycleDecision['candidate']) {
  if (!candidate)
    return null
  if (candidate.purpose.startsWith('summary:'))
    return input.state.batch ? iso(ms(input.state.batch.openedAt) + HOUR / 4) : null
  if (candidate.purpose.startsWith('trial:')) {
    const window = trialWindows(input).find(item => `trial:${item.key}` === candidate.purpose)
    return window ? iso(window.due) : null
  }
  if (candidate.purpose.startsWith('reminder:'))
    return reminderDueAt(input, candidate.purpose)
  return input.now
}

export interface DecisionProvenance {
  runId?: string
  originalCreatorId: string | null
  sourceVerifiedAt: string | null
}

// Caller holds the journey revision fence and owns the transaction. Only the
// heartbeat changes on identical decisions; the evidence rows remain append-only.
export async function recordLifecycleDecision(db: QueryClient, input: LifecycleInput, decision: LifecycleDecision, revision: number, nextAt: string, provenance: DecisionProvenance) {
  const candidate = decision.candidate
  const variant = candidate?.branch ?? null
  const eventName = variant ? lifecycleBranch(input.product, variant).event : null
  const fields = {
    orgId: input.orgId,
    product: input.product,
    purpose: candidate?.purpose ?? null,
    decision: decision.decision,
    reason: decision.reason,
    recipientId: input.recipientId || null,
    recipientEmail: input.email || null,
    originalCreatorId: provenance.originalCreatorId,
    creatorCohort: input.creatorTreatment ? 'treatment' : 'ineligible',
    appIncarnation: input.evidence?.incarnation ?? null,
    eventName,
    variant,
    context: candidate?.context ?? null,
    commercialOffer: candidate?.commercialOffer === true,
    sourceHealthy: input.sourceHealthy,
    policyVersion: LIFECYCLE_MONITOR_POLICY,
  }
  // Moving expiry/next-poll timestamps are intentionally outside this hash.
  const fingerprint = await checksum(JSON.stringify(fields))
  await db.query(`WITH previous AS (
      SELECT d.id, d.fingerprint FROM public.bento_lifecycle_evaluation_coverage c
      JOIN public.bento_lifecycle_decisions d ON d.id = c.latest_decision_id
      WHERE c.org_id = $1::uuid AND c.product = $2
    ), inserted AS (
      INSERT INTO public.bento_lifecycle_decisions
        (org_id, product, purpose, due_at, evaluated_at, decision, reason, recipient_id, recipient_email,
         original_creator_id, creator_cohort, app_incarnation, event_name, variant, policy_version,
         source_healthy, source_verified_at, fingerprint, context_key, run_id)
      SELECT $1::uuid,$2,$3,$4::timestamptz,$5::timestamptz,$6,$7,$8::uuid,$9,$10::uuid,$11,$12::uuid,$13,$14,$15,$16,$17::timestamptz,$18,$19,$22::uuid
      WHERE NOT EXISTS (SELECT 1 FROM previous WHERE fingerprint = $18)
      RETURNING id
    ) INSERT INTO public.bento_lifecycle_evaluation_coverage
      (org_id,product,evaluated_at,next_evaluation_at,revision,latest_decision_id,sender_ready,source_healthy,source_verified_at,run_id)
      VALUES($1::uuid,$2,$5::timestamptz,$20::timestamptz,$21,COALESCE((SELECT id FROM inserted),(SELECT id FROM previous)),true,$16,$17::timestamptz,$22::uuid)
      ON CONFLICT(org_id,product) DO UPDATE SET evaluated_at=EXCLUDED.evaluated_at,
        next_evaluation_at=EXCLUDED.next_evaluation_at,revision=EXCLUDED.revision,latest_decision_id=EXCLUDED.latest_decision_id,
        sender_ready=EXCLUDED.sender_ready,source_healthy=EXCLUDED.source_healthy,source_verified_at=EXCLUDED.source_verified_at,run_id=EXCLUDED.run_id`, [
    input.orgId,
    input.product,
    fields.purpose,
    candidateDueAt(input, candidate),
    input.now,
    fields.decision,
    fields.reason,
    fields.recipientId,
    fields.recipientEmail,
    fields.originalCreatorId,
    fields.creatorCohort,
    fields.appIncarnation,
    eventName,
    variant,
    LIFECYCLE_MONITOR_POLICY,
    input.sourceHealthy,
    provenance.sourceVerifiedAt,
    fingerprint,
    fields.context,
    nextAt,
    revision,
    provenance.runId ?? null,
  ])
}

// No arbitrary metadata, links, settings, provider error bodies or claim tokens.
export async function recordLifecycleAttempt(db: QueryClient, user: EligibleUser, kind: string, reason: string, event?: DispatchRecord, runId?: string) {
  if (!lifecycle(user))
    return
  await db.query(`INSERT INTO public.bento_lifecycle_attempts
    (org_id,product,purpose,dispatch_id,attempt_number,run_id,kind,reason,recipient_id,recipient_email)
    VALUES($1::uuid,$2,$3,$4::uuid,$5,$6::uuid,$7,$8,$9::uuid,$10)`, [
    user.metadata.orgId,
    user.metadata.product,
    user.tag,
    event?.id ?? null,
    event?.attempt_count ?? null,
    runId ?? null,
    kind,
    reason,
    user.metadata.recipientId,
    user.email.toLowerCase(),
  ])
}

function validateSnapshotIdentity(user: EligibleUser, event: DispatchRecord, payload: BentoEvent) {
  const product = user.metadata.product
  const branch = user.metadata.branch
  if ((product !== 'ota' && product !== 'builder') || typeof branch !== 'string')
    throw new Error('Invalid lifecycle snapshot identity')
  if (payload.email.toLowerCase() !== user.email.toLowerCase() || payload.data.dispatch_id !== event.id
    || payload.data.org_id !== user.metadata.orgId || payload.data.product !== user.metadata.product
    || payload.event !== lifecycleBranch(product, branch).event
    || (payload.data.unique as { key?: unknown } | undefined)?.key !== event.id) {
    throw new Error('Invalid lifecycle snapshot identity')
  }
}

function validateSnapshotUrl(value: string) {
  const url = new URL(value)
  if (url.protocol !== 'https:' || url.username || url.password || url.hash)
    throw new Error('Unsafe lifecycle snapshot URL')
  for (const [name, value] of url.searchParams) {
    if (name === 'oid' || name === 'source')
      continue
    if (name === 'lifecycleSetup' && value === '1')
      continue
    throw new Error('Unsafe lifecycle snapshot URL')
  }
}

function snapshotPersonalization(payload: BentoEvent) {
  const data: Record<string, string | boolean> = {}
  for (const key of [...contract.required_string_fields].sort((left, right) => left.localeCompare(right, 'en'))) {
    const value = payload.data[key]
    if (typeof value !== 'string' || value.length > 16_384)
      throw new Error('Invalid lifecycle snapshot field')
    if (key.endsWith('_url'))
      validateSnapshotUrl(value)
    data[key] = value
  }
  for (const key of ['checklist_complete', 'first_value_verified']) {
    if (typeof payload.data[key] !== 'boolean')
      throw new Error('Invalid lifecycle snapshot field')
    data[key] = payload.data[key] as boolean
  }
  return data
}

// Capture the allowlisted resolved request, once per physical attempt. Retries can
// legitimately have different recipient/context under the same dispatch ID.
export async function recordLifecycleSnapshot(db: QueryClient, user: EligibleUser, event: DispatchRecord, payload: BentoEvent, evidence?: LifecycleSendAudit, runId?: string) {
  if (!lifecycle(user))
    return
  validateSnapshotIdentity(user, event, payload)
  const data = snapshotPersonalization(payload)
  const serialized = JSON.stringify({ email: payload.email.toLowerCase(), event: payload.event, data: { ...data, unique: { key: event.id } } })
  if (new TextEncoder().encode(serialized).length > 64 * 1024)
    throw new Error('Lifecycle snapshot too large')
  const digest = await checksum(serialized)
  const billingFingerprint = evidence?.billingCustomerId ? await checksum(`bento-billing-customer-v1:${evidence.billingCustomerId}`) : null
  await db.query(`INSERT INTO public.bento_lifecycle_send_snapshots
    (dispatch_id,attempt_number,org_id,product,purpose,recipient_id,recipient_email,event_name,variant,
     app_incarnation,policy_version,snapshot_checksum,expected_subject,personalization,billing_customer_fingerprint)
    VALUES($1::uuid,$2,$3::uuid,$4,$5,$6::uuid,$7,$8,$9,$10::uuid,$11,$12,$13,$14::jsonb,$15)
    ON CONFLICT(dispatch_id,attempt_number) DO NOTHING`, [
    event.id,
    event.attempt_count,
    user.metadata.orgId,
    user.metadata.product,
    user.tag,
    user.metadata.recipientId,
    payload.email.toLowerCase(),
    payload.event,
    user.metadata.branch,
    payload.data.app_incarnation || null,
    LIFECYCLE_MONITOR_POLICY,
    digest,
    payload.data.email_subject,
    JSON.stringify(data),
    billingFingerprint,
  ])
  const saved = await db.query<{ snapshot_checksum: string, billing_customer_fingerprint: string | null }>(`SELECT snapshot_checksum,billing_customer_fingerprint FROM public.bento_lifecycle_send_snapshots
    WHERE dispatch_id=$1::uuid AND attempt_number=$2`, [event.id, event.attempt_count])
  if (saved.rows[0]?.snapshot_checksum !== digest || saved.rows[0]?.billing_customer_fingerprint !== billingFingerprint)
    throw new Error('Lifecycle snapshot already differs')
  await recordLifecycleAttempt(db, user, 'provider_request', 'resolved_payload_archived', event, runId)
}
