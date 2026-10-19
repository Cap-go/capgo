# Lifecycle monitoring producer contract

This companion to lifecycle v2 adds private correctness evidence. It does not
allocate treatments, activate dispatch, change the sender contract, apply flows,
or authorize another send. Apply its new migration after the lifecycle and
audited dispatcher migrations. Existing migration files are unchanged.

The original creator, declared product, current authorized recipient and existing
rollout gates keep their existing meanings. `evaluateLifecycle` still returns the
same candidate; its null paths now have explicit suppression, wait and unknown
reasons. Readiness is observed only when the existing readiness-gated refresh
executes. `sender_ready` is an observation at `last_evaluated_at`, not a current
read of Vault or evidence that the sender JSON was applied to Bento.

## Durable evidence

`bento_lifecycle_decisions` appends when recipient, product, purpose, reason,
variant, context, cohort eligibility or source health changes. Moving retry or
poll timestamps do not create a new decision. The existing revision-fenced
refresh transaction records the state update, decision and evaluation heartbeat
together. `bento_lifecycle_evaluation_coverage` holds the latest successful
evaluation time and verification watermark without changing the historical
decision time. No historical exclusion counts are backfilled.

`bento_lifecycle_attempts` appends claim, defer, provider-request, accepted,
failed and released events in the corresponding dispatch transaction. Reasons
are fixed application codes; provider bodies, credentials and claim tokens are
excluded. Exact organization daily, recipient daily, optional setup weekly and
optional offer weekly cap deferrals remain separate. A provider timeout or crash
after the remote request can still leave an ambiguous unconfirmed attempt.
PostHog relay or retention is not required to preserve any of these records.

`bento_lifecycle_send_snapshots` holds one immutable resolved request projection
per dispatch and physical attempt. Retries keep their logical dispatch ID and
can have a different current recipient or app context. Capture happens after the
second current-source check and before provider I/O, under the claim token fence.
A conflicting snapshot under the same attempt is rejected. A failed or skipped
attempt is not a recorded send.

The request snapshot contains only the contract's named string and boolean
personalization fields, the event, intended recipient, policy version and a
SHA-256 checksum of their canonical JSON projection plus `unique.key`. URL fields
allow HTTPS with only the generated `oid` and `source` query parameters, with no
userinfo or fragment. Arbitrary event metadata and settings are not copied.
Separate server-only audit metadata archives a SHA-256 fingerprint of the current
billing-customer binding. It is absent from Bento payloads and every read view.
It permits matching existing durable first-subscription evidence to the same
billing context without exposing a customer identifier to the dashboard.
The archived subject and personalization are **expected resolved send request
content**. They do not prove a particular rendered body, sender template version,
observed message, delivery or human open. Those require separate Bento evidence.

History tables deny updates both through grants and a database trigger, including
updates through a privileged connection. Cascading organization erasure remains
possible. The heartbeat alone is mutable. These tables contain private recipient
and organization context and must never be exported into source fixtures, public
PRs or analytics payloads.

## Versioned read views

Every view includes `contract_version = 'bento-lifecycle-monitor-v1'`. No view is
granted to PUBLIC, anon or authenticated. The internal service role receives
SELECT only. Provision a dashboard-specific database reader with explicit SELECT
on the required views and EXECUTE only on their existing pure scalar helpers
`lifecycle_v2_user_eligible(jsonb,timestamptz,boolean)` and
`lifecycle_v2_parse_timestamp(text)`. PostgreSQL checks these function privileges
as the view caller; the helpers read no tables. Do not grant underlying table
access, writes, broad default privileges, Vault access or public PostgREST access.
Dashboard Access and platform-admin checks
belong to the private dashboard repository. Detailed identities and content
require a bounded, deliberate protected read route there.

| View | Grain and meaning |
| --- | --- |
| `bento_lifecycle_monitor_v1` | Latest changed decision per org/product/purpose; includes stable `decision_id`, immutable `evaluated_at` and `decision_changed_at`, fresh `last_evaluated_at`, current source watermark, intended/attempt recipient and dispatch acknowledgment. `is_current` requires the current decision and, for send decisions, the still-selected purpose. Accepted historical purposes remain evidence even after selection clears. |
| `bento_lifecycle_due_v1` | Prospective original-creator provenance crossed with current declared product intent, left joining journeys and coverage. Finds omitted enrollment and overdue evaluation independently of candidate JSON and the outbox. `due_scope='evaluation'`, `purpose` is null and `send_eligibility='unknown'`. |
| `bento_lifecycle_clock_candidates_v1` | Independent fixed summary, 24h/48h/final recovery and seven Trial phase clocks from persisted state and accepted predecessor spacing. Never reads the mutable evaluator candidate. `due_scope='clock'` and `send_eligibility='unknown'`. A clock requires a fresh full eligibility decision before it is considered a due send. |
| `bento_lifecycle_timeline_v1` | Append-only changed decisions and attempt events; query by indexed org/product/purpose and a bounded time window. |
| `bento_lifecycle_snapshots_v1` | Private per-attempt expected request inspection. `content_evidence='expected_send_request'`. |
| `bento_lifecycle_claims_v1` | Accepted or currently active v2 claims only. `claim_at` uses confirmed acceptance time, or active claim attempt time; this mirrors the actual budget and excludes legacy/transactional messages. |
| `bento_lifecycle_outcomes_v1` | First accepted dispatch per org/product and immutable original creator cohort, with mature 48h positive-only first-milestone association and mature 7d positive-only first-subscription association when the private billing continuity matches. The anchor is provider acceptance, not the separately observed send. Verified value comes from the snapshot incarnation's observation; readiness is explicitly organization-level and may include intentionally skipped steps. Missing progress/subscription evidence remains unknown. |

Unique organization-purpose identities define reconciliation. Shared Trial ready
and unfinished variants compete for one purpose. A product decision is not an
extra send when a sibling already consumed that organization purpose. The monitor
joins a dispatch only to the product recorded on that dispatch. Count distinct
dispatch IDs for claims and distinct trusted message IDs for actual send load.

The monitor's `intended_*` scalar fields always come from the changed decision.
The unprefixed recipient, incarnation, event and variant use the latest archived
attempt when present. A failed attempt can differ from a later reevaluation under
the same dispatch ID, so compare these fields explicitly rather than silently
presenting an old attempted variant as the current intention.

Clock coverage is conservative: current consent, support holds, source freshness,
canonical incomplete tasks, reminder context, plan availability, paid/credit
state and sibling priority still require the normal evaluator. A boundary alone
does not prove eligibility or a missing send. Failed provenance capture cannot
be reconstructed historically. A missing relation means producer capability is
pending, never zero exceptions. Views are primary-database objects, not replicated
table data; do not query them through a replica that lacks their definitions.

The outcome view does not infer causal uplift or invent a control cohort. It
exposes whether the current incarnation matches the send snapshot. A replacement
does not transfer another app's verified value. Organization readiness persists
by design and is labeled separately. `lastProgressAt` is overwritten; it cannot
reconstruct every historical setup step in a 48h window. Existing billing status
and period anchors do not prove a first subscription transition within seven
days. `stripe_info.paid_at` preserves the first subscription event for a billing
customer. The private snapshot fingerprint must match the current organization
billing binding before this timestamp can support a positive seven-day
association. A missing timestamp, absent continuity or later customer replacement
stays unknown. No read view reveals the fingerprint or billing customer ID.

## Execution and validation

No plugin request path gains primary database I/O. The only new trigger rejects
updates to the three evidence tables; it reads no table, runs once per attempted
UPDATE and is unreachable through ordinary client roles. Source views use the
bounded prospective creator/journey cohort and keyed org, user, observation,
accepted-purpose and dispatch indexes. Private dashboard requests must add time,
organization and row bounds. They must not scan or return an unbounded timeline.

The monitoring unit suite applies all three actual migrations to embedded
PostgreSQL and exercises views, privileges, immutable retries, the real dispatch
store/provider boundary, missing enrollment, changed-decision heartbeats and
independent clocks. Fixtures use fake identities only. No live events or test
emails are needed for verification.
