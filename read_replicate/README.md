# Read Replica Scripts

These scripts manage the Supabase -> Google Cloud SQL read-replica subscriber.
Google handles replication from that Cloud SQL instance to downstream regional
replicas, so these scripts intentionally target only one Google database.

## Required Env

Credentials are loaded from `internal/cloudflare/.env.prod`.

| Variable | Description |
| --- | --- |
| `MAIN_SUPABASE_DB_URL` | Supabase source PostgreSQL URL |
| `READ_REPLICATE_GOOGLE_EU1` | Google Cloud SQL subscriber PostgreSQL URL |

Optional overrides:

| Variable | Description |
| --- | --- |
| `READ_REPLICA_TARGET_ENV` | Env key to use if more than one Google DB URL exists |
| `READ_REPLICA_PUBLICATION_NAME` | Publication name on Supabase |
| `READ_REPLICA_SUBSCRIPTION_NAME` | Subscription name on Google |
| `READ_REPLICA_SLOT_NAME` | Slot name on Supabase |
| `READ_REPLICA_FULL_RESET=1` | Allow full target reset in `replicate_to_replica.sh` |
| `READ_REPLICA_SUBSCRIPTION_ONLY=1` | Recreate only the subscription |
| `READ_REPLICA_SCHEMA_SYNC_MAX_TIME` | Max seconds for the Hyperdrive additive schema sync call |

If subscription name is not provided, scripts discover it from `pg_subscription`.
If exactly one subscription exists, it is used. If multiple subscriptions exist,
the script exits instead of guessing.

## Commands

Prepare or update the source publication without dropping subscriptions or slots:

```bash
bun run readreplicate:setup-source
```

Generate the replica schema SQL from Supabase:

```bash
bun run readreplicate:prepare
```

Check that the committed replica schema matches the current database schema:

```bash
bun run readreplicate:check-schema
```

Sync safe additive changes through Hyperdrive, then check that the live read
replica matches the committed replica schema catalog:

```bash
bun run readreplicate:check-hyperdrive-schema
```

Recreate the Google subscription:

```bash
bun run readreplicate:replica
```

Re-sync one table only:

```bash
bun run readreplicate:add-table channels
```

Check and recreate missing indexes on the Google subscriber:

```bash
bun run readreplicate:indexes
```

Inspect subscription, slot, lag, and per-table states:

```bash
bun run readreplicate:status
```

Update the source password used by the Google subscription:

```bash
READ_REPLICA_PASSWORD='new-password' bash read_replicate/update_readreplica_passwords.sh
```

## Notes

- `replicate_setup_source.sh` no longer drops publications or replication slots.
- `replicate_to_replica.sh` defaults to subscription-only mode unless you choose
  full reset interactively or set `READ_REPLICA_FULL_RESET=1`.
- `replicate_add_table.sh` disables the subscription, reloads only the requested
  table on the Google subscriber, refreshes the publication with `copy_data =
  false`, then re-enables the subscription.
- `schema_replicate.sql` is intentionally limited to tables replicated into the
  Google subscriber. It excludes foreign keys, triggers, and RLS policies.
- `schema_replicate.catalog.json` is the machine-readable catalog snapshot used
  by release CI to sync missing additive schema changes and compare the committed
  schema against the live read replica through Hyperdrive.
- Production Supabase deploys run `bun run readreplicate:check-hyperdrive-schema`
  before migrations, functions, or workers publish. The check first applies safe
  missing columns and indexes on the Google subscriber, reindexes invalid
  same-name indexes left by interrupted concurrent builds, then fails if any
  unsupported drift remains.
