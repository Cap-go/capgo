# Organization lifecycle email evaluation

This implementation depends on the protected A/B enrollment migration and engine
in [PR #3732](https://github.com/Cap-go/capgo.app/pull/3732), and the matching
49 isolated Bento sender branches in
[PR #21](https://github.com/Cap-go/bento-unofficial-api/pull/21).
It does not allocate experiments, backfill existing organizations, enable a
rollout control, send a test email, or deploy a workflow.

## Enrollment and recipients

`org_lifecycle_creators` prospectively records `NEW.created_by` at organization
insertion. `orgs.created_by` is unsuitable as historical provenance because
ownership transfer and account cleanup can replace it. The private provenance
row cannot be changed, including by later ownership changes; deleting the
original user does not replace that identity. Older organizations without this
capture remain outside this cohort. The original creator must still resolve to
a protected signup marker, a valid persisted v2 treatment A, the configured
self-signup audience and original creator's persisted `created_via_invite = false`,
the creation cutoff, current OTA/Builder intent, and the Builder treatment
prerequisite where applicable. No evaluation calls the allocator.
Invited creators stay excluded even with a stale treatment. Signup provenance
comes from the original user row; the recipient's invitation or membership and
client-provided onboarding JSON cannot establish self-signup eligibility.

The recipient is the current owner with an unexpired direct organization
membership and enabled organization/personal onboarding preferences and
notification consent. Original enrollment does not grant the creator access or
make a departed creator a recipient. Product content is independent; organization
and recipient collision budgets are shared. Organization preference links use a
membership-checked `oid` deep link, so another currently selected organization
cannot silently receive a billing or notification action.

## State, evidence and sending

Small modules under `cloudflare_workers/bento_dispatch/flows/lifecycle/` separate
cohort reads, typed evidence, progress collection, recovery, Trial clocks,
capacity, payload presentation, and atomic claim limits. The existing audited
worker handles scheduling, provider acceptance, retries and analytics relay.

Journey state is keyed by organization/product; app observations are keyed by
organization/product plus immutable `apps.id`. Deletion and ID reuse preserve
organization readiness and accepted purpose history while creating a fresh app
observation boundary. Transfers capture a new destination boundary. An
authenticated setup-page selection carries the exact incarnation and enabled
product. It changes context with an observation boundary, never the progress
clock. Passive usage heartbeats cannot switch apps or repeatedly wake retired
journeys. Old facts load as context and do not create a congratulatory batch. Ambiguous app selection
is unknown evidence, never a claim that no app exists.

Independent canonical statuses remain done/pending/skipped/warning/unknown.
Done-or-intentionally-skipped canonical checklists establish plan readiness;
only a real, non-demo applied bundle or successful cloud build establishes value.
Outcome polling continues after checklist completion. Demo provenance uses the
canonical `(app_id, relation_name, row_key)` index, independently of the demo seed
UUID. Analytics reads are bounded by current app creation/capture time and a
90-day lookback, with grouped version results validated against finalized real
bundles; an earlier demo result cannot hide a later genuine applied update.
Unknown coverage suppresses abandonment.
A supported Builder checklist with an omitted/null platform has the known next
task “Choose my platform”; it can receive recovery and unfinished Trial guidance
without earning iOS/Android facts, checklist readiness or real value. Invalid
platform values and unknown platform-specific steps remain unhealthy.

One genuinely new fact opens a fixed 15-minute batch. More facts join that batch
without moving its due time. A separately verified running build can hold it.
Normal/resumed/success/purchase variants compete for the same summary purpose.
Accepted summaries derive durable success/resumed/offer aliases. A later real
outcome is still new even if the checklist was manually resolved earlier.

The 24h, 48h and final purposes are shared across selected products in an
organization. Context includes product, app incarnation/platform, unresolved
steps and last meaningful progress (plus continuous app-less period). Escalation
requires the matching prior confirmed acceptance; a different app or product
cannot satisfy it. Replacement does not replenish consumed purposes. The final
reminder requires both matching sends, shipping intent and a current app; it is
due from day five and expires at day seven. Actual build-time denials supply the
separate funding-help branch; missing builds never imply a funding problem.

Provider acceptance alone consumes a purpose. Retries preserve its dispatch ID
and five-attempt ceiling, and refresh nonaccepted recipient/context metadata
under the current revision fence. The short existing claim transaction enforces
one organization/person send per rolling day, three optional setup sends per
rolling seven days and one optional offer per week. Retained Trial touches
bypass the optional weekly caps. A verified success with an unpaid plan CTA
consumes the same optional offer budget and durable offer alias; a paid success
does not. A due Trial candidate wins organization-level product arbitration at
selection, serialized claim and both live send rechecks. A higher priority
sibling arriving after selection can therefore reserve the organization slot;
blocked/exhausted candidates yield the cohort front.

## Retained Trial calendar

A read-only audit of the live Trial graph on 2026-10-17 verified a Stripe
CustomerCreated enrollment and seven sequential waits of 7/5/2/1/3/5/5 days.
The payment-incoming hook precedes the expired notice by one day. Old `trial7`
backend tags separately represent a 2–7-calendar-day billing segment, and
`trial0` also depends on allowance; neither defines this schedule.

This implementation preserves the seven purpose identities and wait spacing,
with explicit deadline-relative anchors at -8/-3/-1/0/+3/+8/+13 days relative to
`stripe_info.trial_at`. The first purpose also waits at least seven days after
journey enrollment. Later purposes cannot compress the confirmed acceptance
spacing. Missed windows do not create catch-up bursts. Extensions recompute
unsent anchors without replaying consumed phases; canonical completion changes
only the next unsent phase's ready/unfinished variant. The exact subject
`🚨 Capgo payment incoming !` is retained, while supplied copy states the actual
UTC deadline and makes no automatic-charge claim. Paid coverage or available
usage credits suppress upgrade pressure. Fresh measured usage and current
monthly catalog pricing determine the smallest fitting plan; missing pricing or
usage does not fabricate a recommendation.

## Setup email destinations

The approved 19 October sender contract adds the plain-text
`cta_destination_hint` field. All 28 setup, recovery and unfinished Trial
branches use **Continue setup in Capgo** for a current eligible app, or
**Choose my app in Capgo** without an app. The hint explains the actual
destination; concrete run/upload/build instructions stay in the body. The
remaining 21 purchase, ready Trial, first-success and funding primaries retain
their purpose-specific actions.

Current-app setup and OTA AI-help links retain the authorized organization and
app URL, with `source=capgo_lifecycle`, `oid` and `lifecycleSetup=1`. The client
resolver re-reads that exact app's persisted onboarding JSON through the
authenticated, organization-scoped client at click time, without a refresh RPC
or write. An unfinished visit
keeps normal setup behavior. A visit that would normally redirect after
completion instead selects `showChecklist=1`, the completed-view interface from
PR #3741. **PR #3741 must be deployed before lifecycle activation.** The email
does not set that flag from a send-time completion snapshot. Missing or
inaccessible apps fall back to authorized selection; the resolver does not pick
another app. The auth guard preserves these explicit authorized lifecycle
setup/selection destinations against the ordinary one-pending-app shortcut.
If org membership is lost, it removes the inaccessible `oid` and opens an
explicit unscoped chooser (`source=capgo_lifecycle&lifecycleSelect=1`), retaining
authentication, MFA and invitation gates.
Normal setup retains its own refresh behavior. An unavailable app read opens
the authorized chooser. This does not promise post-send retargeting of a static delivered
URL, changed app name or body copy.

The OTA secondary action is **Open setup for AI help**, styled as a quieter
outlined button by the sender. With a current app, explain that the user opens
the first checklist step and chooses **Copy AI setup prompt** there, then pastes
it into the coding assistant working with the project. The email link opens the
page and does not copy a prompt. Without an app, choose/add the app before
promising a checklist control. Builder AI help stays text about the current
task and non-secret error, without an unverified prompt-copy UI. Both button
styles use email-compatible markup and targets at least 44px high in the
matching sender definition.

This CTA revision changes no subjects, purposes, timing, sending budgets,
eligibility, experiment assignments or no-app episode rules.

## Activation and legacy handoff

All lifecycle gates default closed. The shared dispatcher independently runs
invitation reminders from valid Worker credentials and origin, without a global
Vault activation switch. Lifecycle-only readiness/analytics reads cannot block
that existing reminder path. The authorized lifecycle activation sequence is:

1. Merge/apply PR #3732's protected enrollment migration and engine first.
2. Merge this lifecycle migration/worker and PR #21's JSON definition. Deploy
   PR #3741's completed-checklist view before activating email destinations.
   Deployment and live Bento application remain separate operator actions.
3. Verify the deployed JSON contains every event/tag in
   `lifecycle-v2-contract.json`, with isolated event → tag → email → finish
   branches. Verify inline text escaping and actual product URL targets.
4. Inspect legacy Aha, Builder and **Stripe CustomerCreated-rooted Trial** flows,
   including their already-running sessions. Backend event/tag suppression
   cannot stop a Trial session already enrolled by Stripe. Before attesting
   handoff, stop or exclude only the new-cohort organization/recipient sessions
   and verify that future Stripe enrollments cannot start both sequencers.
   Use original-creator cohort evidence plus current authorized recipients,
   not a person's A/B tag alone. Do not remove shared Trial/paid tags globally.
5. For multi-organization recipients, verify legacy session provenance before
   excluding it. An organization-less session cannot safely be attributed to a
   treated organization while preserving a control organization's email.
   Leave ambiguous organization journeys held (`support_hold = true`) and their
   legacy delivery active until session-level exclusion can be verified. Clear
   the hold only after that evidence exists; changing the hold wakes evaluation.
6. Only after sender and legacy-session verification explicitly set Vault
   `BENTO_LIFECYCLE_V2_SENDER_CONTRACT` and
   `BENTO_LIFECYCLE_V2_LEGACY_HANDOFF` to `new-emails-v2-2026-10-19`, and retain
   the lifecycle-only `BENTO_EVENT_DISPATCH_ENABLED=true` opt-in. That flag does
   not gate invitation reminders or replace either attestation. Explicit
   deployment overrides use the same exact values. This PR sets none of them.

Readiness and legacy suppression use the same protected creator predicate and
three controls. Unknown readiness retains existing legacy delivery and prevents
new provider events. Unrelated invitations, billing and transactional messages
are not suppressed. Existing subscription/customer/paid tags remain intact.

A draft managed sender does not qualify for the sender-contract attestation.
Publishing and verifying the matching sender is a separate authorized operator
step; configured Worker credentials alone never enable lifecycle dispatch or
legacy lifecycle suppression.

## Execution model and capacity

No plugin request path gains a primary database read/write. Trigger work starts
from a new/changed organization, user, app, billing customer or build identity.
Every new SQL function has an empty search path, explicit owner and PUBLIC/anon/
authenticated EXECUTE revocation. These functions are private trigger/scalar
helpers, with no new RPC or RLS-policy call. Public/invalid-key/broad-key and
unfiltered PostgREST SELECT requests execute none of the new functions.

Creator enrollment uses `(original_creator_id, org_id)`, organization selection
uses `apps(owner_org, app_id)` and a `LIMIT 2` ambiguity check, and individual
source joins use org/user/app primary keys. Demo exclusions use
`onboarding_demo_data(app_id, relation_name, row_key)`. Bundle/build lookups
start at indexed `app_id`; recommendations use the exact organization billing
period in `org_metrics_cache`. Dispatch counts use partial organization and
recipient expression indexes and bounded weekly counts. The migration test
executes `EXPLAIN (ANALYZE, BUFFERS)` with the normal planner over 100,000
additional synthetic users, organizations and creator rows. The measured keyed
lookup returned one row, used `org_lifecycle_original_creator`, `orgs_pkey` and
`users_pkey`, and had no sequential scan: 0.183 ms execution, 13 buffer hits and
zero reads in embedded PostgreSQL. These are fixture measurements, not
production-machine latency.

Recurring candidate selection has a separate partial index on
`bento_lifecycle_journeys(product, next_evaluation_at, org_id) WHERE candidate IS NOT NULL`.
The refresher stores an absent candidate as SQL `NULL`; JSON `null` would still
enter that index. The recurring-selection test distinguishes both values in SQL
and runs the real refresher to verify the stored value becomes SQL `NULL`.
It explains and executes the actual `findEligibleUsers` SQL, including its joins,
sibling arbitration, ordering and limit, with the normal PostgreSQL planner over
100,000 users/organizations and 200,000 journeys. The fixture has eight eligible
OTA candidates, three rejected OTA candidates (accepted, exhausted and expired),
32 Builder candidates and otherwise idle rows. Separate phases cover only
rejected OTA candidates, Builder-only candidates and no candidates. Each plan
uses the candidate index with a product condition and avoids sequential scans
of the large journey/user/organization tables. This is independent of the
creator-enrollment proof above. The index removes idle-cohort scanning; `LIMIT 20`
does not cap how many populated candidates rejected by the other predicates
may need examination.

The unchanged minutely scheduler publishes the registered lifecycle checks and
`lifecycle:v2:prepare` through the same unique invocation framework. Readiness,
Vault, analytics, source, progress and outcome work runs only in queue consumers.
The preparation task leases at most 20 due organization/product rows through the
due-time index and SKIP LOCKED, ordered by deadline, organization and product.
This is one combined batch, not one message or selection query per organization. Tokens and revisions fence expired refreshes; observation
IDs and state updates commit together. Lifecycle handlers resolve/send
sequentially on each pinned connection, avoiding concurrent source transactions
spending a claim lease behind one another; independent queue deliveries still
run in parallel. Analytics requests are batched and capped
at 8KB per query, five seconds each, with at most 2,001 grouped version results.
Overflow is unhealthy coverage. The refresher has a 35-second soft deadline. It initially reserves source
loading to ten seconds (allowing an in-flight keyed lookup to finish), leaves
time for processing, and checks remaining time between rows. It never holds a
transaction over network I/O. Results report claimed/processed/deferred counts,
the oldest claimed deadline and batch saturation; saturation is not an exact
backlog count. Twenty is an initial safety bound, not a capacity certificate. Unfinished leases are reclaimable after 120 seconds.

Fixed batch/reminder/Trial boundaries schedule the next evaluation exactly.
Passive unresolved apps use distributed hourly slots; paid/ineligible/held
journeys sleep seven days, exhausted journeys daily. Relevant user/org/app/build/
billing changes wake them immediately. A 500-journey simulation at 20 evaluations
per minute proves ordinary polling fits the hourly capacity and pending batches
remain timely, avoiding permanent five-minute churn from completed cohorts.
The actual due-claim query is also explained with the normal planner over
200,000 journeys, including 199,960 future rows, two due groups and an empty
claim, after vacuuming dead entries left by the fixture’s earlier wholesale
timestamp updates. This isolates steady-state selection, not churn/autovacuum
capacity. Native PostgreSQL tests prove disjoint claims on separate connections,
future-row preservation and revision fencing during a real organization wakeup.
A controlled slow-source fixture proves processing advances instead of loading
until every claim must be deferred. These measurements do not certify
production throughput. This is console-scale coordination; it does not scan manifests or fan out per
plugin request. Actual backlog/refresh failure logs must be checked before
increasing rollout volume.
