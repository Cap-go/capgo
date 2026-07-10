# Cloudflare-embedded read replica (per-app Durable Objects)

Replaces the external Google Cloud SQL read replicas with per-app SQLite
replicas that live inside Cloudflare as Durable Objects. The `/updates` hot
path reads a region-local replica over RPC (~1ms in-colo) instead of
crossing to another cloud.

Why not one shared database (we tried D1 with `DB_STOREAPPS`): a single
database has a single throughput ceiling, and Capgo's read volume blows past
it. Sharding one DO per `${region}:${app_id}` spreads reads across as many
isolates as there are active apps — each app only ever competes with itself.

## Architecture

```
Supabase Postgres (main)
  │  AFTER INSERT/UPDATE/DELETE triggers on the 7 hot-path tables
  ▼
public.replicate_outbox              -- ordered change log + routing keys
  │  DELETE .. FOR UPDATE SKIP LOCKED (poll every EDGE_REPLICA_POLL_SECONDS)
  ▼
ReplicaRouter DO (this worker)       -- journal + registry, one per account
  │  push: app rows → that app's replicas, org rows → all replicas of org
  ▼
AppReplica DO per region:app_id      -- SQLite slice of one app (+ its org)
  ▲  lazy: seeds itself from Postgres on first read in a region
  │
capgo_plugin workers                 -- /updates_v2: 2 region-local RPCs
```

The readers live on a **parallel endpoint, `/updates_v2`** — `/updates` keeps
running on the old Cloud SQL path untouched. Load-balance device traffic
between the two in production (both return identical response shapes),
compare error rates and `X-Database-Source` headers, then decommission the
old system when the numbers hold.

- **Reads never touch Postgres.** The plugin worker asks the region-local
  `AppReplica` for app-owner/plan data and channel/version rows; both
  lookups run as local SQLite queries inside the DO.
- **Exactly-once feed.** The router moves outbox rows into its SQLite
  journal before committing the Postgres delete; per-target cursors only
  advance on a successful push, and replicas apply idempotent upserts, so a
  flaky replica is retried and, after 3 failures, invalidated (it reseeds on
  its next read).
- **Lazy + self-healing replicas.** First read of an app in a region creates
  the DO near that worker, which seeds its app slice from the read replica
  (small indexed queries), registers with the router, and buffers pushes
  that arrive mid-seed. Replicas idle for 7 days unregister and wipe.
- **Freshness = lease, and NO Postgres fallback.** Every push/heartbeat
  extends `lease_until` (`EDGE_REPLICA_LEASE_SECONDS`, default 15 min;
  typical data lag is the poll interval, ~5s, versus the 180s tolerated on
  Cloud SQL today). When a replica is not ready (warming up, lease expired,
  error) `/updates_v2` answers a plain "no update" (`edge_replica_not_ready`,
  kind `up_to_date`) — devices retry on their next check while the replica
  seeds in the background. The read path never touches Postgres, so it keeps
  working unchanged after the old replicas are destroyed; a dead router can
  only ever delay updates, never break devices or overload the main DB.
- **Load on main DB**: trigger appends on writes + one indexed poll query
  every few seconds. Per-app seeds hit the seed source (`HYPERDRIVE_SEED`,
  the existing read replica; later a single kept replica or the pooler).

Why an outbox instead of Supabase Realtime `postgres_changes`: Realtime is
fire-and-forget over WebSocket — a dropped connection silently loses rows,
there is no replay cursor, and it cannot seed. The outbox is consumed
transactionally and is resumable after any downtime.

## Deploy / bootstrap

1. Apply the migration (outbox + triggers):
   `supabase/migrations/20260707150000_edge_replica_outbox.sql`.
2. Deploy the replicator worker and set its secret:

   ```bash
   bunx wrangler secret put REPLICATOR_SECRET --config cloudflare_workers/replicator/wrangler.jsonc --env prod
   bun run deploy:cloudflare:replicator:prod
   curl https://replicator.capgo.app/status -H "Authorization: Bearer $REPLICATOR_SECRET"
   ```

3. Enable `/updates_v2` one region at a time: uncomment the `APP_REPLICA`
   `durable_objects` block in that plugin env
   (`cloudflare_workers/plugin/wrangler.jsonc`), add
   `"EDGE_REPLICA_MODE": "on"` to its vars, deploy. Without the flag the
   endpoint answers `edge_replica_not_ready` (a no-update), so deploying is
   always safe.
4. Load-balance: shift a share of device update traffic from `/updates` to
   `/updates_v2` (LB rule / plugin config), watch
   `X-Database-Source: edge_replica` vs `edge_replica_not_ready` rates and
   response parity. No pre-seeding is needed — replicas warm up from
   traffic (the very first checks per app/region get "no update" while the
   seed runs, then serve normally).

## Admin endpoints (Bearer `REPLICATOR_SECRET`)

- `GET /status` — journal head, outbox depth/oldest, targets, lagging count
- `POST /pause` / `POST /resume` — stop/start the stream loop
- `POST /invalidate-all` — force every replica to reseed (schema changes)

## Cost & latency vs Cloud SQL replicas

Sized for real traffic: **55M monthly devices, ~5M daily**, so
~150M checks/month at 1 check/device/day (225M at 1.5, 450M at 3).
Each check costs one RPC session to the region-local AppReplica DO.

The dominant cost is **DO duration**: every DO bills 128 MB x wall-clock
while in memory, and a request-driven DO stays in memory ~10s after its
last request. That makes duration ~= checks x 10s x 0.125 GB x $12.50/M GB-s,
minus the overlap savings on app-regions hot enough to stay resident
(>~0.1 req/s, cost cap ~$4/DO-month).

| checks/device/day | checks/mo | DO requests | DO duration (est.) | rows read | rows written | storage | total |
|---|---|---|---|---|---|---|---|
| 1.0 | 150M | ~$23 | $1,300-2,300 | $0 (in 25B free) | $70-200 | ~$10 | **~$1.4k-2.5k** |
| 1.5 | 225M | ~$34 | $2,000-3,500 | $0 | $70-200 | ~$10 | **~$2.1k-3.7k** |
| 3.0 | 450M | ~$68 | $4,000-7,000 | $0 | $100-300 | ~$15 | **~$4.2k-7.4k** |

Rows written scale with bundle-upload volume (outbox journal + fan-out),
not device traffic. The router itself (poll every 5s, alarms, journal) is
<$5/month. Worker requests on /updates_v2 replace the ones /updates
already pays for today - no delta.

For comparison, the current fleet is 1 Cloud SQL subscriber + 9 regional
replicas running 24/7 plus cross-cloud egress on every read. At list
prices that is typically $3k-5k/month, so the DO design is roughly
cost-neutral to cheaper at current volume while removing the external
hop (~1ms in-colo reads) and the fleet ops.

**Biggest lever if the bill needs to shrink**: cache the channel
resolution in the plugin worker (Cache API, 30-60s TTL, keyed by
app+platform+channel; only usable for devices without per-device
overrides). Most checks then never reach a DO, collapsing the duration
term - estimated 2x or more reduction. Worth adding before ramping to
100% if the observed duration bill matters.

Very hot single apps: one DO per app *per region* already splits the load
9 ways; if a single app-region ever saturates a DO (~1k req/s), shard its
name by a device-hash suffix - the reader and router both key by name, so
this is a localized change.

## Decommission (after full rollout)

- Drop the Supabase → Cloud SQL logical replication (`read_replicate/`
  scripts) and delete the Cloud SQL instances; keep one small replica (or
  the pooler) as `HYPERDRIVE_SEED` for per-app seeds.
- Remove the `HYPERDRIVE_CAPGO_READ_*` bindings and the lag-header code in
  `pg.ts` once no env uses them.
