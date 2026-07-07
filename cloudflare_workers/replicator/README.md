# Cloudflare-embedded read replica

Replaces the external Google Cloud SQL read replicas with a D1 database that
lives inside Cloudflare. The `/updates` hot path reads it through the D1
Sessions API, which automatically serves each request from the closest D1
read replica — the regional fan-out we used to pay Cloud SQL instances for
is now a checkbox.

## Architecture

```
Supabase Postgres (main)
  │  AFTER INSERT/UPDATE/DELETE triggers on the 10 replicated tables
  ▼
public.replicate_outbox            -- ordered, transactional change log
  │  DELETE .. FOR UPDATE SKIP LOCKED (poll every EDGE_REPLICA_POLL_SECONDS)
  ▼
capgo_replicator (this worker)     -- single Durable Object, alarm loop
  │  D1 batch (upserts/deletes in outbox order + heartbeat)
  ▼
D1 capgo_edge_replica (primary)
  │  D1 read replication (automatic, all regions, no extra cost)
  ▼
capgo_plugin workers               -- db.withSession('first-unconstrained')
```

Why an outbox instead of Supabase Realtime `postgres_changes`:

- **No lost updates.** Realtime is fire-and-forget over WebSocket; a dropped
  connection silently loses rows. The outbox is consumed transactionally:
  rows are deleted only after the D1 batch commits, so delivery is
  exactly-once and resumable after any downtime.
- **Ordering.** Outbox ids give a strict total order; `SKIP LOCKED` skips
  rows from still-open transactions instead of jumping over them.
- **No extra load on main.** Triggers append tiny rows on writes (low volume
  compared to device reads) and the poll is one indexed query every few
  seconds. Device read traffic (millions/day) never touches Postgres.

Replica freshness is a heartbeat: the replicator bumps
`replication_state.last_applied_at` on every poll, even when idle. Readers
reject the replica when the heartbeat is older than
`EDGE_REPLICA_MAX_LAG_SECONDS` (default 300s; typical lag is
`EDGE_REPLICA_POLL_SECONDS` ≈ 5s, versus the 180s tolerated on the Cloud SQL
replicas today) and fall back to the existing Hyperdrive → Postgres path,
per request. Turning the mode on can never be worse than today.

## Deploy / bootstrap

1. Apply the migration (creates `public.replicate_outbox` + triggers):
   `supabase/migrations/20260707150000_edge_replica_outbox.sql`.
2. Create the D1 database and enable read replication:

   ```bash
   bunx wrangler d1 create capgo_edge_replica
   curl -X PUT "https://api.cloudflare.com/client/v4/accounts/<account>/d1/database/<uuid>" \
     -H "Authorization: Bearer <token>" \
     -H "Content-Type: application/json" \
     -d '{"read_replication": {"mode": "auto"}}'
   ```

   Paste the database id into `cloudflare_workers/replicator/wrangler.jsonc`
   and into the commented `DB_REPLICA` block of
   `cloudflare_workers/plugin/wrangler.jsonc`.
3. Set the secret and deploy the replicator:

   ```bash
   bunx wrangler secret put REPLICATOR_SECRET --config cloudflare_workers/replicator/wrangler.jsonc --env prod
   bun run deploy:cloudflare:replicator:prod
   ```

4. Seed (reads from the EU read replica via `HYPERDRIVE_SEED`, never main):

   ```bash
   curl -X POST https://replicator.capgo.app/seed -H "Authorization: Bearer $REPLICATOR_SECRET"
   curl https://replicator.capgo.app/status -H "Authorization: Bearer $REPLICATOR_SECRET"
   ```

   The seed is resumable (keyset pagination driven by the DO alarm) and
   switches to outbox streaming automatically when done. Outbox rows written
   during the seed replay afterwards; upserts are idempotent so the replica
   converges.

5. Roll out the readers one region at a time: uncomment `DB_REPLICA` in a
   plugin env, add `"EDGE_REPLICA_MODE": "on"` to its vars, deploy that env,
   watch `X-Database-Source: edge_replica` + error rates, continue.

## Endpoints (Bearer `REPLICATOR_SECRET`)

- `POST /init` — create/upgrade the D1 schema (idempotent)
- `POST /seed` — full reseed, then stream
- `POST /pause` / `POST /resume` — stop/start the apply loop
- `GET /status` — mode, outbox depth/oldest row, D1 row counts, heartbeat

## Cost & latency vs Cloud SQL replicas

- Cloud SQL: 1 subscriber + 9 regional replicas running 24/7, plus
  cross-cloud egress, plus Hyperdrive round trips out of Cloudflare.
- D1: storage ($0.75/GB-mo, hot tables are a few GB), $0.001 per million
  rows read, read replication included. The replicator is one DO with
  ~17k alarms/day. Total is dollars per month, and reads are served in-colo
  (~1ms) instead of crossing to another cloud.

## Sharding (future)

A single D1 database is capped at 10 GB. If the replicated set outgrows it,
split by `app_id`: N `DB_REPLICA_<n>` bindings, route with
`hash(app_id) % N`, replicate org-level tables (`orgs`, `stripe_info`,
`org_users`, `notifications`) to every shard (they are small) and app-level
tables (`apps`, `app_versions`, `channels`, `channel_devices`, `manifest`,
`onboarding_demo_data`) to their shard only. The outbox already carries
`app_id`/`owner_org` in `row_data`, so the replicator can fan out without a
schema change. Not needed while the hot tables fit comfortably.

## Decommission (after full rollout)

- Drop the Supabase → Cloud SQL logical replication (`read_replicate/`
  scripts) and delete the Cloud SQL instances.
- Remove the `HYPERDRIVE_CAPGO_READ_*` bindings and the lag-header code in
  `pg.ts` once no env uses them.
