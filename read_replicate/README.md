# Read Replica Scripts

These scripts manage the Supabase -> Google Cloud SQL read-replica subscriber.
Google handles replication from that Cloud SQL instance to downstream regional
replicas, so these scripts intentionally target only one Google database.

## Required Env

Credentials are loaded from `internal/cloudflare/.env.prod`.

| Variable                    | Description                                |
| --------------------------- | ------------------------------------------ |
| `MAIN_SUPABASE_DB_URL`      | Supabase source PostgreSQL URL             |
| `READ_REPLICATE_GOOGLE_EU1` | Google Cloud SQL subscriber PostgreSQL URL |

Optional overrides:

| Variable                                   | Description                                                                                                                    |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `READ_REPLICA_TARGET_ENV`                  | Env key to use if more than one Google DB URL exists                                                                           |
| `READ_REPLICA_PUBLICATION_NAME`            | Publication name on Supabase                                                                                                   |
| `READ_REPLICA_SUBSCRIPTION_NAME`           | Subscription name on Google                                                                                                    |
| `READ_REPLICA_SLOT_NAME`                   | Slot name on Supabase                                                                                                          |
| `READ_REPLICA_FULL_RESET=1`                | Allow full target reset in `replicate_to_replica.sh`                                                                           |
| `READ_REPLICA_SUBSCRIPTION_ONLY=1`         | Recreate only the subscription                                                                                                 |
| `READ_REPLICA_SCHEMA_CHECK_MAX_TIME`       | Whole checker budget in seconds, including readiness and cleanup; defaults to `750`                                           |
| `READ_REPLICA_SCHEMA_SYNC_MAX_TIME`        | Max seconds for one schema-sync request, capped by the whole checker budget; defaults to `600`                                |
| `READ_REPLICA_SCHEMA_CHECK_READY_ATTEMPTS` | Authenticated catalog readiness attempts before failure, capped by the whole checker budget; defaults to `20`                 |
| `READ_REPLICA_SCHEMA_SYNC_SOURCE=catalog`  | Internal release preflight mode: reconcile from the committed selected-table catalog before applying source migrations         |

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

Reconcile the selected tables from the live Supabase primary through Hyperdrive,
then verify that the Google subscriber matches that primary catalog:

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
Legacy check that recreates missing indexes from the committed snapshot. Use the
release reconciler above for live-primary shape convergence:

```bash
bun run readreplicate:indexes
```
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
- `schema_replicate.catalog.json` is the checked-in local snapshot used by PR CI to
  keep migrations and the selected replica schema in sync. Production release CI
  first preflights the Google subscriber from that catalog, then reads the selected
  catalog from the live Supabase primary through Hyperdrive after migrations.
- The reconciliation applies safe selected-schema changes: missing columns, column
  defaults/nullability, selected function definitions, structural sequence options,
  primary/unique/check constraints, and ordinary indexes. Primary/unique constraints
  are built through a concurrent unique index and attached afterward.
- The reconciliation removes only subscriber-only indexes proven not to back a
  constraint. It refuses destructive or ambiguous changes and returns structured
  residual drift instead of claiming success.
- Foreign keys, triggers, RLS policies, and sequence runtime values are outside this
  read-only replica contract. Sequence definitions are aligned, but logical
  replication does not advance sequence values.
- Production Supabase deploys preflight the subscriber, apply migrations, then verify
  against the live primary before functions or workers publish. Each check deploys a
  uniquely named Worker with its token in the initial deployment, holds a
  subscriber-side advisory lock around schema DDL, prints Worker and curl failures,
  and deletes the Worker before exiting.
  deployment, reads the primary catalog, reconciles the Google subscriber, verifies
  it, and deletes the Worker before exiting. Concurrent CI runs never share or
  replace a checker Worker.
