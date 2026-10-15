# R2 cleanup producer

The existing production inventory Worker has a minute cron. Retirement is **off**:
`CLEANUP_ACTIVATED` is false, the deletion queue binding is absent, and this PR
provisions no queue. Deploying this version only logs `r2_cleanup_disabled` and
preserves notification and repair consumers. It does not touch R2 or replace old
manifest cleanup. It is distinct from the API Worker's expired upload placeholders.

## Activation requires a separate reviewed change

1. Deploy and validate upload reservations/finalization protections from #3689,
   including the standalone lease schema, uncached production inventory binding,
   and the controlled API-before-files receipt rollout. A merge alone is insufficient.
2. Establish and validate late legacy finalization and manifest replication safety.
   Inventory retirement and the primary manifest write are separate transactions.
   A legacy caller can pass a retirement check before a delayed primary write;
   replicated absence alone cannot exclude that write. Queue health, an hour of age,
   and a 30-second delivery delay do not close this race. Activation requires a
   separately reviewed safety solution and evidence that it is deployed. This PR
   intentionally does not invent an absence-authority protocol.
3. Deploy a compatible deletion consumer and dedicated queue/DLQ before adding a
   `CLEANUP_QUEUE` producer binding. Future consumer settings: batch 100,
   concurrency 1, two retries (three deliveries), individual ack/retry. This PR
   does not implement the consumer or create an unconsumed production queue.
4. Verify inventory coverage and live replication into standalone PlanetScale
   `capgo/capgo-r2-inventory/main`, database `postgres`, including exact
   `manifest.s3_path` references. Verify Hyperdrive query caching remains disabled.
   Read-only inspection on 2026-10-14 confirmed the C-collated keys, inventory PK,
   lease column/partial index, `manifest_s3_path_idx`, and enabled subscription;
   those observations do not establish authoritative absence. The producer uses
   `row_security = off` so Postgres throws if a runtime read would be policy-filtered;
   this setting does not bypass RLS or permit hidden references to appear absent.
5. Review/apply `cloudflare_workers/r2_inventory/sql/20261014_cleanup_manifest_read.sql`
   separately on that standalone database. The runtime role currently lacks
   manifest SELECT. The script grants only column SELECT on `s3_path`, sufficient
   for exact probes, with no additional metadata/write/delete/schema grants. No
   Supabase migration or production permission change is made by this PR.
6. Install a separately reviewed trusted health monitor that writes the evidence
   contract below. Verify it against provider backlog/DLQ/processing evidence and
   replication heartbeat/lag/apply errors, including idle periods. No monitor is
   installed by this PR; never seed synthetic healthy evidence in production.
7. Complete the independent legacy deletion transition (#3690 where applicable),
   validate the whole workflow, measure throughput/runtime/DB contention, and
   review activation with those results. Only then change `CLEANUP_ACTIVATED` to
   true in code. Numeric settings stay in `CLEANUP_CONFIG`, not Vault/config tables.

## Health evidence and backpressure

The monitor must atomically replace the checkpoint for `(bucket, cleanup_health, '')`
with `schemaVersion: 1`, database-compatible `observedAt`, booleans
`notificationsHealthy`, `repairsHealthy`, `manifestReplicationHealthy`,
`deletionConsumerHealthy`, and integer `deletionBacklog`. These are observations,
not enablement or configuration. Fresh means at most 120 seconds old and not in
the future. All attestations must be true and backlog at most 10,000. Missing,
malformed, stale, negative or failed evidence stops the producer; there are no
healthy defaults. Check at run start and inside every retirement/progress
transaction. Low traffic is not a failure: the monitor must use source/consumer
health evidence during idle periods, rather than the last object-event timestamp.
This operational checkpoint does not prove absence and cannot override activation.

## Bounded progress and transaction model

One connection is reused for an entire producer invocation and closed in `finally`.
A dedicated `(bucket, cleanup_producer, '')` checkpoint holds a last fully handled
key, random invocation owner, monotonically increasing fence and 45-second lease.
The PK serializes acquisition. Crashes expire; overlapping runs cannot acquire an
unexpired lease. Admission checkpoints/floors are unchanged. Each transaction
locks/checks the fence before touching inventory and holds that checkpoint lock
through publication and commit. It checks lease expiry again when saving progress.
An old owner cannot overwrite/release a successor's lease. Database statement,
lock and idle-in-transaction limits bound stalls while the checkpoint is locked.

Discovery is outside retirement transactions. A materialized PK keyset page
examines at most 10,000 rows in the bucket's C-collated `orgs/` namespace; the
delta-path predicate and indexed exact manifest probes run only within that page.
Non-delta org rows are examined/ineligible, so sparse namespaces cannot cause an
unbounded scan seeking 10,000 candidates. Candidates must be present, never retired,
in `orgs/{org}/apps/{app}/delta/`, outside trash/ZIP/dot-segment paths, first seen
at least an hour ago, with known modified/event evidence no newer than an hour,
no current manifest lease, and no exact replicated reference. Unknown age is denied.

Each range contains at most 100 discovery candidates plus fully examined gaps.
Lock inventory keys in C order, then recheck every predicate using a new READ
COMMITTED snapshot. Concurrent reservations use those same row locks. Update to
`to_be_deleted`, take the database trigger's exact microsecond retirement timestamp,
publish the messages with Cloudflare `delaySeconds: 30`, then commit the retirement
and examined cursor together. The trigger makes retirement permanent, including
after `deleted`. There is no `deleting` state or reset to present.

The work budget is 20 seconds; stop starting work with fewer than five seconds
left, reserving time for publication/commit/rollback. Discovery statements have a
five-second timeout; transaction statements two seconds, locks 500ms, and idle
transactions five seconds. These starting bounds are not latency guarantees.
Publication has one two-second deadline for the whole transaction, even if split
by bytes. Several pages/ranges may complete in a run. Empty-candidate pages advance
their examined key too. At exhaustion persist an empty cursor and end the run;
the next run revisits behind-cursor inserts and previously leased rows. Budget
interruptions leave unfinished ranges for the next invocation.

A later failure does not undo earlier committed ranges. Any ambiguous commit
terminates the invocation; the next run reloads database progress. Never advance
an in-memory cursor on a failed commit. No scan republishes existing retired rows:
they may be in flight, blocked, or in DLQ. Cron must not reset delivery budgets.

## Queue boundary contract

Messages contain only `schemaVersion: 1`, `bucket`, exact `key`, and
`cleanupRequestedAt`, the permanent identity of this particular retirement.
Revision is mutable and is not a job id. The encoder splits at 100 messages and
256,000 encoded bytes, counting JSON escaping/wrappers conservatively and enforcing
the individual 128,000-byte bound. Current [Cloudflare limits](https://developers.cloudflare.com/queues/platform/limits/)
use decimal KB. [sendBatch](https://developers.cloudflare.com/queues/configuration/javascript-apis/)
resolution confirms durable publication, not consumption. Delay is in Cloudflare,
not a sleep inside the transaction.

Drizzle does not make Cloudflare part of a Postgres atomic transaction. Rejection,
deadline, lease expiry or DB commit failure rolls retirement/progress back, but
cannot revoke messages accepted by Cloudflare. The binding has no AbortSignal.
A timed-out call may resolve later; it must not start additional split-batch sends.

The future consumer **must** load current committed inventory before any R2 action
and require an exact matching retirement identity and expected retired state.
Uncommitted/non-visible retirement retries only that message with a 30-second
delay, within its delivery budget. Old/mismatched/extraneous messages never authorize
R2 work. Recheck reference/reservation safety according to the separately reviewed
consumer contract. A newly found reference preserves R2, retains retirement,
logs/optionally alerts, and acknowledges that message without blocking peers.
No R2 COPY, DELETE, trashing, consumer, Discord notification or local runner is
included here. Tests observe visibility from another connection during publication,
rollback and a later retirement with a different identity.

## Validation and capacity evidence

Unit tests cover disabled scheduling, health fail-closed behavior, encoded limits,
examined cursor partitioning and late publication. Postgres tests cover actual
Drizzle commits/rollback, reference/lease rechecks, reservation races, ownership
fencing, microsecond identity, partial progress, lost commit responses, page bounds,
zero-result progress/wrap and no redispatch.

Read-only `EXPLAIN (ANALYZE, BUFFERS)` of this PR's exact discovery query on
2026-10-14 examined 10,000 rows through `r2_objects_pkey` and performed 5,612
`manifest_s3_path_idx` index-only probes. Execution took 124.853ms with shared
buffer hits (warm-cache observation); there was no large-table sequential scan.
This does not measure retirement transactions, provider publication or cold-cache
performance and does not prove an overall drain rate.

An earlier bounded discovery measurement examined one 10,000-row page, performed
5,801 indexed manifest probes and returned 820 candidates in 1.505 seconds. This
is one-page evidence, not a dataset benchmark or a throughput guarantee. No large
index is added. The enabled workflow needs fresh plan/capacity validation and a
backlog drain calculation including queue/provider/DB limits before activation.
