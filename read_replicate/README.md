# Read Replica Replication Scripts (PlanetScale + Google)

Scripts for replicating Supabase PostgreSQL data to read replicas using logical replication.
Historically this was PlanetScale; we now also support Google-hosted replicas via `GOOGLE_*` env vars.

## Prerequisites

- PostgreSQL client tools (`pg_dump`, `pg_restore`, `psql`)
- Access to `internal/cloudflare/.env.prod` (and optionally `.env.preprod`) with database credentials

## Scripts

### 1. `replicate_prepare.sh`

Prepares the schema for replica import by:
- Dumping schema from Supabase (tables: `apps`, `app_versions`, `manifest`, `channels`, `channel_devices`, `orgs`, `stripe_info`, `org_users`)
- Filtering out foreign keys, triggers, RLS policies
- Keeping indexes
- Adding required extensions (`uuid-ossp`)
- Cleaning up temporary files

**Output:** `schema_replicate.sql`

```bash
./replicate_prepare.sh
```

### 2. `replicate_copy.sh`

Dumps data from the `channel_devices` table for manual import.

**Output:** `data_replicate.sql`

```bash
./replicate_copy.sh
```

### 3. `replicate_to_replica.sh`

Sets up logical replication from Supabase to a read replica target (PlanetScale or Google):
- Fixes sequences on target database
- Creates a subscription to the Supabase publication

```bash
./replicate_to_replica.sh
```

Note: `replicate_to_planetscale.sh` still exists as a wrapper for backward compatibility, but it just forwards to `replicate_to_replica.sh`.

## Run Order (Recommended)

1. Setup the source publication (one-time, or whenever you change the table list):
   ```bash
   ./replicate_setup_source.sh
   ```
2. Generate the schema SQL to import on the target (re-run when schema changes):
   ```bash
   ./replicate_prepare.sh
   ```
3. Create the subscription and start streaming changes (first time: choose **Full reset** so the script imports `schema_replicate.sql` and backfills data):
   ```bash
   ./replicate_to_replica.sh
   ```

Optional:
- Validate / backfill missing indexes on the target:
  ```bash
  ./replicate_ensure_indexes.sh
  ```
- Add a new table after initial setup (exports data, creates table if missing, refreshes subscriptions):
  ```bash
  ./replicate_add_table.sh <table_name>
  ```

## Configuration

All credentials are loaded from `internal/cloudflare/.env.prod` (prepare/copy also accept `.env.preprod` if present):

| Variable | Description |
|----------|-------------|
| `MAIN_SUPABASE_DB_URL` | Supabase PostgreSQL connection string |
| `PLANETSCALE_NA` | PlanetScale North America |
| `PLANETSCALE_EU` | PlanetScale Europe |
| `PLANETSCALE_SA` | PlanetScale South America |
| `PLANETSCALE_OC` | PlanetScale Oceania |
| `PLANETSCALE_AS_INDIA` | PlanetScale Asia (India) |
| `PLANETSCALE_AS_JAPAN` | PlanetScale Asia (Japan) |
| `GOOGLE_HK` | Google replica (Hong Kong) |
| `GOOGLE_ME` | Google replica (Middle East) |
| `GOOGLE_AF` | Google replica (Africa) |

### Google SSL Notes

If your Google replicas are Cloud SQL and your `GOOGLE_*` URLs use an **IP address** as host, `sslmode=verify-full` usually fails because:
- Cloud SQL uses a **Google Cloud SQL Server CA** (not in your OS trust store).
- `verify-full` also enforces **hostname verification**, and an IP won't match the cert SAN.

Quick fix (encrypted, no cert verification):
- set `sslmode=require` in `GOOGLE_*` URLs.

Note: with Postgres 17+ clients, avoid setting `sslrootcert=system` alongside `sslmode=require` (libpq rejects that combination).

Stronger verification:
- use `sslmode=verify-ca` and provide the Cloud SQL server CA via `sslrootcert=...`.

## Workflow

1. Create publication on Supabase (one-time):
   ```bash
   ./replicate_setup_source.sh
   ```

2. Prepare the schema SQL:
   ```bash
   ./replicate_prepare.sh
   ```

3. Set up replication (first time: choose **Full reset**):
   ```bash
   ./replicate_to_replica.sh
   ```

## References

- [PlanetScale Postgres Migration Guide](https://planetscale.com/docs/postgres/imports/postgres-migrate-walstream)
