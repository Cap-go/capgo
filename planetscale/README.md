# PlanetScale Replication Scripts

Scripts for replicating Supabase PostgreSQL data to PlanetScale using logical replication.

## Prerequisites

- PostgreSQL client tools (`pg_dump`, `pg_restore`, `psql`)
- Access to `.env.preprod` file with database credentials

## Scripts

### 1. `replicate_prepare.sh`

Prepares the schema for PlanetScale import by:
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

### 3. `replicate_to_planetscale.sh`

Sets up logical replication from Supabase to PlanetScale:
- Fixes sequences on target database
- Creates a subscription to the Supabase publication

To switch regions, edit the `DB_T` variable in the script:
```bash
DB_T="$PLANETSCALE_US"  # or PLANETSCALE_EU, PLANETSCALE_AS, PLANETSCALE_SA, PLANETSCALE_OC
```

```bash
./replicate_to_planetscale.sh
```

## Configuration

All credentials are loaded from `internal/cloudflare/.env.preprod`:

| Variable | Description |
|----------|-------------|
| `MAIN_SUPABASE_DB_URL` | Supabase PostgreSQL connection string |
| `PLANETSCALE_US` | PlanetScale US region |
| `PLANETSCALE_EU` | PlanetScale EU region |
| `PLANETSCALE_AS` | PlanetScale Asia region |
| `PLANETSCALE_SA` | PlanetScale South America region |
| `PLANETSCALE_OC` | PlanetScale Oceania region |

## Workflow

1. Create publication on Supabase (one-time):
   ```sql
   CREATE PUBLICATION planetscale_replicate FOR TABLE
     apps, app_versions, manifest, channels, channel_devices, orgs, stripe_info, org_users;
   ```

2. Prepare and import schema:
   ```bash
   ./replicate_prepare.sh
   psql "$PLANETSCALE_URL" -f schema_replicate.sql
   ```

3. Set up replication:
   ```bash
   ./replicate_to_planetscale.sh
   ```

## References

- [PlanetScale Postgres Migration Guide](https://planetscale.com/docs/postgres/imports/postgres-migrate-walstream)
