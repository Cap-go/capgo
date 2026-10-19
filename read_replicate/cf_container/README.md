# Read replicas on Cloudflare Containers (experiment)

Alternative to the Google Cloud SQL subscriber + regional replicas. Test in
preprod first; every script defaults to `--env preprod`.

```
Supabase ──logical──▶ primary container ──WAL-G──▶ R2 (base backups + WAL)
                                                     │
                       replica containers ◀──────────┘  (restore + replay forever)
each node: cloudflared ─▶ Workers VPC service ─▶ Hyperdrive ─▶ plugin worker
```

- `worker.ts` – control Worker. One `PgNode` Durable Object per node owns one
  container. Node list lives in R2 (`<cluster>/registry.json`); a 1-minute
  cron restarts any stopped node.
- `container/entrypoint.sh` – same image for both roles. Primary: restore from
  R2 if a backup exists, else initdb + schema + Supabase subscription
  (`copy_data = true`) + first base backup; archives WAL every
  `ARCHIVE_TIMEOUT` (30s) and pushes a base backup every 24h. Replica: waits
  for a base backup, restores it, hot standby with
  `restore_command = wal-g wal-fetch`.
- R2 is the only durable storage: container disks are ephemeral.

## Local smoke test

```bash
bun run pgcf:smoke
```

Docker only (S3 mock instead of R2, postgres:17 instead of Supabase). Checks
fresh bootstrap, replica restore, live change flowing primary -> R2 -> replica,
and primary SIGTERM + restart restoring from the bucket without losing rows.
A restored primary replays as a standby and promotes only after replay stops
advancing for 60s, so a failed WAL fetch is retried and never truncates
history.

## Preprod run

Needs Docker running locally (wrangler builds the image), a wrangler login
(used when `CLOUDFLARE_API_TOKEN` is unset; account id falls back to the
`S3_ENDPOINT` host) and, in `internal/cloudflare/.env.preprod`:
`MAIN_SUPABASE_DB_URL`, `PG_CF_R2_ACCESS_KEY_ID`, `PG_CF_R2_SECRET_ACCESS_KEY`
(R2 token with Object Read & Write on `capgo-pg-wal-preprod`; init checks it
before deploying).

```bash
bun run pgcf:init                                   # primary in weur
bun run pgcf:add-region us-east --location enam     # attach a replica
bun run pgcf:status
bun run pgcf:add-region us-east --remove            # detach
```

Generated secrets and resource ids go to `.cluster-state.<env>.json`
(gitignored, mode 600). Init creates `capgo_cf_preprod_pub` on the preprod
source if it is missing. Each node gets a Hyperdrive config
(`capgo-pg-<env>-<name>`, max-age 60s, swr 15s) to bind in the plugin worker.

## Limits to check in preprod

- **Disk: 20 GB max** (standard-4). Data + WAL must fit; init refuses above
  14 GB of replicated tables. The `manifest` table is the risk.
- **Restart = full restore.** Deploys and host maintenance restart containers;
  every restart downloads the latest base backup from R2 and replays WAL.
  Measure restore time for the real data size.
- **Primary crash window.** The subscription confirms LSNs to Supabase once
  they are on local disk, not in R2. A hard kill (not SIGTERM) can lose up to
  `ARCHIVE_TIMEOUT` of changes with no error. SIGTERM switches WAL and archives
  before exit. If it happens, the fix is a fresh init (empty the R2 prefix).
- **Replica lag** = archive_timeout + WAL-G fetch poll (~30-60s), versus
  streaming on Cloud SQL. The edge cache purge path already tolerates 60s.
- **Supabase direct host** `db.<ref>.supabase.co` must be reachable from the
  container (IPv4 add-on or container IPv6 egress).
- A second logical slot on Supabase also blocks Postgres upgrades; tear it
  down like `readreplicate:upgrade:teardown` does for Google.

## Cost (24/7, Workers Paid rates, Oct 2026)

| Instance | Memory | Disk | CPU (avg 1 vCPU busy) | Per node | 9 nodes |
| --- | --- | --- | --- | --- | --- |
| standard-4 (4 vCPU, 12 GiB, 20 GB) | ~$78 | ~$4 | ~$52 | ~$134 | ~$1,200 |
| standard-2 (1 vCPU, 6 GiB, 12 GB) | ~$39 | ~$2 | ~$16 (30% busy) | ~$57 | ~$510 |

Today: Cloud SQL fleet ≈ $700/mo. Only standard-2 is cheaper (~$190/mo
saved), and only if the data fits ~8 GB and 6 GiB RAM handles the read load.
