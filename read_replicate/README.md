# Read Replica Scripts

These scripts manage the Supabase -> Google Cloud SQL read-replica subscriber.
Google handles replication from that Cloud SQL instance to downstream regional
replicas, so these scripts intentionally target only one Google database.

## Required Env

Local credentials are normally loaded from `internal/cloudflare/.env.prod`.

| Variable                    | Description                                                   |
| --------------------------- | ------------------------------------------------------------- |
| `READ_REPLICATE_GOOGLE_EU1` | Direct Google Cloud SQL subscriber PostgreSQL URL             |
| `MAIN_SUPABASE_DB_URL`      | Optional direct primary URL for local/manual reconciliation   |

Production release CI requires the GitHub Actions secret
`READ_REPLICATE_GOOGLE_EU1` with the direct Cloud SQL URL. It reads the linked
Supabase primary through the existing `SUPABASE_TOKEN` Management API access,
then uses the direct Google URL only for subscriber DDL. The final verification
still uses the Hyperdrive bindings.

Optional overrides:

| Variable                                    | Description                                                      |
| ------------------------------------------- | ---------------------------------------------------------------- |
| `READ_REPLICA_TARGET_ENV`                   | Env key to use if more than one Google DB URL exists             |
| `READ_REPLICA_PUBLICATION_NAME`             | Publication name on Supabase                                     |
| `READ_REPLICA_SUBSCRIPTION_NAME`            | Subscription name on Google                                      |
| `READ_REPLICA_SLOT_NAME`                    | Slot name on Supabase                                            |
| `READ_REPLICA_FULL_RESET=1`                 | Allow full target reset in `replicate_to_replica.sh`             |
| `READ_REPLICA_SUBSCRIPTION_ONLY=1`          | Recreate only the subscription                                   |
| `READ_REPLICA_SCHEMA_SYNC_MAX_TIME`         | Direct schema-sync budget in seconds; defaults to `1800`         |
| `READ_REPLICA_SCHEMA_LOCK_WAIT_SECONDS`     | Direct subscriber advisory-lock wait; defaults to `120` seconds  |
| `READ_REPLICA_SCHEMA_CHECK_MAX_TIME`        | Whole Hyperdrive check budget; defaults to `300` seconds         |
| `READ_REPLICA_SCHEMA_CHECK_READY_ATTEMPTS`  | Authenticated Worker readiness attempts; defaults to `20`        |
| `READ_REPLICA_SCHEMA_CHECK_VERIFY_ATTEMPTS` | Hyperdrive verification attempts after readiness; defaults to `1`|

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

Reconcile the selected Google subscriber directly from the live Supabase primary.
This is the release write path and requires the direct subscriber URL:

```bash
bun run readreplicate:sync-schema
```

Verify the deployed Hyperdrive read path against the live primary. This command
never mutates the subscriber:

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

Legacy check that recreates missing indexes from the committed snapshot. Use the
release reconciler above for live-primary shape convergence:

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
  table on the Google subscriber, refreshes the publication with `copy_data = false`,
  then re-enables the subscription.
- `schema_replicate.catalog.json` is a checked-in local snapshot used by PR CI to
  keep migrations and the selected replica schema in sync. It is never used as a
  production DDL source.
- Production release CI applies primary migrations, reads the selected catalog from
  that live primary through the Supabase Management API, and reconciles the Google
  subscriber through its direct Cloud SQL connection. It then verifies the same
  selected schema through the deployed Hyperdrive read path.
- The reconciliation applies safe selected-schema changes: missing columns, column
  defaults/nullability, selected function definitions, structural sequence options,
  primary/unique/check constraints, enums and composites referenced by selected
  tables, and ordinary indexes. Primary/unique constraints are built through a
  concurrent unique index and attached afterward.
- The reconciliation removes only subscriber-only indexes proven not to back a
  constraint. It refuses destructive or ambiguous changes and returns structured
  residual drift instead of claiming success.
- Foreign keys, triggers, RLS policies, runtime sequence values, column reordering,
  and destructive type changes are outside this automatic read-only replica contract.
  Sequence definitions are aligned, but logical replication does not advance sequence
  values.
- Each Hyperdrive verification deploys a uniquely named Worker with its token in the
  initial deployment, waits for its authenticated lightweight readiness route, then
  verifies with bounded catalog queries that print the Worker response on failure.
  It has no DDL or session lock because Hyperdrive uses transaction pooling.
