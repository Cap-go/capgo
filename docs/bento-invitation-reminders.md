# Bento evaluation runner and invitation reminders

The dedicated `capgo-bento-dispatch-prod` Worker runs named evaluations declared
in `cloudflare_workers/bento_dispatch/bentoFlows.ts`. The minutely cron uses
Cloudflare's `controller.scheduledTime` to calculate each evaluation's aligned
`everyMinutes` slot. All four invitation evaluations run once per scheduled
minute when the previous execution and analytics handoff have finished; a
five-minute cadence uses slots such as 10:00, 10:05 and 10:10. Late invocation or
queue publication does not shift the cadence, and old or duplicate ticks cannot
start a second execution of an already handled slot. After a delay, the next
available tick evaluates the current cohort rather than replaying missed slots.

One evaluation queue delivers one `{ version: 1, evaluationKey, runId }` message
per invocation. A pending publication retries the same durable UUID. Queue receipt also records
a missing enqueue timestamp when publication succeeded before the publisher crashed. Publication
and execution have separate fenced ten-minute claims. A still-running execution
is left alone until its claim expires; cron can then republish the same run UUID
and the consumer resumes its saved selection, with at most five attempts. One
unfinished run per evaluation prevents overlapping execution; unrelated
evaluations are independent. Completed or terminally failed rows are reused for
the next due slot only after their analytics have been handed off. Reuse rotates
the run UUID and clears the previous snapshot, attempts and result, so delayed
queue messages or claim owners cannot affect the new execution. PostHog retains
the execution history, correlated by run UUID.
There are no recipient partitions, pre-scheduled reminder rows, or enrollment
triggers.

## Read, report, then handle

Every definition has two functions: `findEligibleUsers` and
`handleEligibleUsers`. The finder sees the whole relevant active cohort in a
PostgreSQL read-only transaction, with only a query capability. PostgreSQL rejects
writes, including data-changing CTEs; the query interface also rejects transaction
control and multiple statements. It returns identity, context, reason, action and
safe JSON metadata. Invitation metadata includes the actual initial and prior
reminder acknowledgement timestamps, expiry, eligible/evaluated times and the
satisfied wait condition. Send candidates and terminal candidates are both included.

The engine saves the original complete selection unchanged in the private run
row so handler retries receive identical domain metadata. Only the analytics
projection passes through the existing sanitizer. It queues the entire
eligibility report through the existing `POSTHOG_QUEUE`. Normal reports contain
native `eligible_users` arrays, split into numbered parts sharing the run UUID
when needed to stay within the existing 96 KiB envelope limit. An individual
oversized or deeply nested candidate uses numbered JSON fragments with a shared fragment UUID;
concatenate those fragments by part before parsing. The full list is preserved.
No handler runs until all selection parts have been handed off.

The approved analytics contract for this runner intentionally includes the full
eligible identity and email list, with context, reasons and safe metadata, in
private PostHog reports and private run snapshots. This authorization does not
permit publishing real recipient data in this public repository, fixtures,
commits, PRs or issues. Tokens, credentials and provider payloads remain excluded.

The handler receives shared `sendBentoEvent`, `sendBentoEvents`, `recordFlowEvent`
and `endFlow` capabilities, read-only access, and runtime settings. It receives
no unrestricted SQL write client. Invitation handlers pass a current-source
resolver to the shared helpers. Source generations, membership, cancellation,
expiry and previous reminder acceptance are rechecked before and after claiming
a send. Tokens, token-bearing URLs and provider payloads are never copied into
the eligibility snapshot or audit metadata; current names and links are resolved
separately immediately before the provider request.

## Durable events and audit recovery

Exactly two private, service-role-only tables are added:

- `bento_event_dispatches` records logical facts, sends and flow termination.
  Events are unique by `(flow_key, context_key, recipient_key, tag)`. A `recorded`
  fact is local history; `accepted` specifically means Bento acknowledgement.
  `event_at` is absent before provider acceptance. The active-start partial index
  excludes closed historical flows.
- `bento_evaluation_runs` stores only the current/latest execution state, claims,
  complete eligibility snapshot and outcome summary. A unique `evaluation_key`
  bounds this table to one row per registered check: four rows for invitations.
  Its scheduled slot controls cadence; physical enqueue time is diagnostic.
  Pending analytics block reuse of that evaluation's row until handoff succeeds.

The state migration retains each evaluation's unfinished row, or its latest
finished row, and consolidates all pending run audits into it before deleting
redundant execution history. Existing event-delivery history is preserved.
Deploy the migration before the updated worker. The old worker can finish queued
jobs but cannot insert another run under the new unique constraint. New scheduling
therefore pauses until the updated Worker deploys successfully, including if a
deployment prerequisite fails. Its next tick evaluates the still-current cohort;
it cannot recover a reminder whose invitation has already expired. The updated
worker resumes scheduling without a separate switch.

Business mutations append a correlated PostHog intent in the same database
transaction. This includes send claims/attempts, acknowledgement or unconfirmed
provider outcomes, stale skips, terminal facts and evaluation completion/failure.
Failures identify their safe phase (`finder`, `selection_persist`,
`eligibility_queue`, `handler`, or `completion`), without raw exception content.
External fact details are retained unchanged in the private ledger, including
large/deep domain JSON and legitimate reserved-name fields. Fact audits carry a
concise ledger UUID reference and flow/context/recipient/tag/reason, rather than
copying the details into a bounded analytics envelope.
Each table's `pending_audit` array holds its own unhanded intents, with stable
PostHog `event_id` UUIDs. There is no third outbox table or extra analytics queue.
Helpers promptly relay touched event audits; completion relays its run audit.
The cron separately recovers pending intents with a 100-event/10-second budget,
regardless of evaluation cadence or paused sending. A relay outage does not prevent scheduling
independent evaluations. A saved Bento acceptance remains accepted when analytics
handoff fails, so audit-only recovery does not send that event again.

Each provider request has a ten-second timeout. Provider concurrency is five per
invocation, and the soft handler budget is forty seconds. Unfinished recipients
remain eligible on a subsequent scheduled evaluation. One pinned database client
serializes short transactions; provider and queue I/O happen outside them. An
indexed, shared rolling budget retains sixty send claims per minute, leaving
headroom below the account limit for other producers. Budget deferral consumes
no event attempt and records its reason. Logical event attempts, publication
attempts, execution attempts and total queue deliveries are each capped at five.

Bento acknowledgement is not inbox delivery. Remote acceptance followed by a
crash before the database marker can still duplicate an event. The transport
unique key is useful for inspection but correctness does not assume Bento
implements deduplication. Provider delay can also outlive an invitation change.

## Invitation lifecycle and timing

The existing Cloudflare initial sender and its shipped queue remain in place.
After initial-provider acceptance it records `flow:started` in the same
transaction as the exact saved `sent_at` timestamp. The context is that initial
request's generation UUID. Details identify the source invitation, variant,
organization and current token-generation timestamp, without the token itself.
A resend creates a new context; the previous context becomes `superseded`.
Already-sent invitations are not backfilled.

`org_invitation_email_requests` holds mutable delivery state, not permanent send
history. New-user acceptance calls `accept_tmp_user_invitation`, which deletes
the accepted `tmp_users` row. Its delivery-state row is removed by the
`tmp_user_id` foreign key's `ON DELETE CASCADE`. The independent
`bento_event_dispatches` start/acceptance history survives; counting surviving
delivery-state rows does not count all historical invitation emails.

A missing source is `removed` unless actual active organization membership proves
acceptance. Terminal reasons distinguish `accepted`, `cancelled`, `expired`,
`removed`, `superseded`, and `completed`. `endFlow` atomically closes the active
start fact and writes one local terminal event. Final-reminder acceptance closes
the flow as completed; it does not send an extra completion event to Bento.

| Event | Eligibility time |
| --- | --- |
| `org:invite_new_user_reminder_1` | Initial Cloudflare acknowledgement + 2 days |
| `org:invite_existing_user_reminder_1` | Initial Cloudflare acknowledgement + 2 days |
| `org:invite_existing_user_reminder_2` | First reminder Bento acknowledgement + 5 days |
| `org:invite_new_user_reminder_2` | First reminder accepted, then current seven-day token expiry − 1 hour; before expiry |

Each evaluation checks both sends and lifecycle termination. The four preserved
HTML files and `bento/flows.json` describe four independent event → email → exit
replacement flows. They are a manual recreation specification, not executable
runtime configuration or a native Bento import. Preserve transactional delivery,
the existing `5_minutes` throttle and each email node's distinct template ID.

Body names are HTML escaped. Subjects use the separate plain
`event.details.org_name_subject` value, with line breaks removed. Invitation URLs
use the configured HTTPS origin and current encoded invitation identity. An
origin with credentials, a path, query or hash is rejected.

## Deployment, activation and manual cutover

Apply the feature migrations before the API sender and evaluation
Worker. The existing shipped initial-email migration is unchanged. Both workers
import the shared fact/audit helper under `_backend/utils`, so deployment scope
includes both when that helper changes. Provision only the evaluation queue;
bind the existing `capgo-posthog-events-prod` queue for analytics.

The deployed Worker runs automatically; there is no activation flag or Vault
configuration lookup. `WEBAPP_URL` is explicit production configuration in
`wrangler.jsonc`. Supply `BENTO_PUBLISHABLE_KEY`, `BENTO_SECRET_KEY` and
`BENTO_SITE_UUID` as Cloudflare Worker secrets before deploying. Missing or invalid
configuration fails visibly before scheduling or claiming business work.
Keep credentials and site in the same Bento environment as the four replacement
flows.

Retention cleanup for `bento_event_dispatches` is deferred to future work, with
a one-month follow-up to revisit the policy. A 365-day retention window is a
candidate for that discussion, not an adopted policy. No automatic event-history
cleanup is currently implemented. Scheduling state in `bento_evaluation_runs` is
reused and does not accumulate per execution.

Any future purge must use approved flow-specific lifetimes and bounded, indexed
batches restricted to terminal, audit-drained history. It must preserve active
contexts, live claims, each flow's required deduplication/history, and current
evaluation state required for cadence. Deleting accepted events generically can weaken
future flow deduplication; this feature does not define a universal deletion
period. This follow-up does not block activation.

Live Bento editing/publication is separate from event dispatch. The Worker can
send reminder events before the four recreation flows are published; those
events do not send reminder emails until the matching Bento flow is live.
Verify controlled invitations and observe run summaries, accepted ledger events,
pending audit age, provider budget deferrals, exhausted attempts and queue
backlog. Publishing a flow does not replay reminders already acknowledged by
Bento; accepted ledger markers continue to prevent resends.

To pause evaluations operationally, pause the queue consumer and remove the cron
trigger in Cloudflare. Initial Cloudflare emails continue. Resume both to recheck
current state and overdue eligibility. Do not erase accepted markers or reset
exhausted attempt counts.

## Local plan evidence

A local benchmark with 100,000 closed ledger rows and 25 live source-backed
invitations of each variant used the active-start partial index and unique event
history lookups. The new/existing cohort plans each returned 25 rows in about
1.9 ms with cached buffers. A separate 100,000-row run-history benchmark used the
enqueue index for cadence in 0.035 ms. These checks prove exclusion of closed
history and bounded run-history lookups. Local source tables were small;
production-cardinality membership/source-table performance is not established by
this benchmark. No plugin endpoint or public PostgREST query uses these tables.

## Adding an evaluation

Add a hardcoded registry definition with a unique key, positive integer cadence,
a whole-cohort read-only finder and a handler using the shared helpers. Choose
stable flow/context/recipient/tag identities. Include safe decision metadata and
termination candidates, and supply a fresh-source resolver for each send or end.
No database enrollment trigger or recipient scheduling table is needed.
