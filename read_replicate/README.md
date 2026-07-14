# Read Replica Scripts

These scripts manage the Supabase to Google Cloud SQL read-replica subscriber.
Google handles replication from this subscriber to downstream regional replicas,
so every reconciliation targets only this database.

## Release reconciliation

Production reconciliation uses Cloud SQL Data API with a dedicated Google
service-account key stored as a base64 GitHub repository secret. It never accepts
a direct subscriber PostgreSQL URL, allowlists GitHub runner IPs, or deploys a
temporary Worker.

| GitHub repository secret | Value                              |
| ------------------------ | ---------------------------------- |
| `GOOGLE_SERVICE_ACCOUNT` | Base64-encoded service-account JSON |

The Cloud project, instance, and database are fixed literals in the sync script,
not GitHub variables.

The key only authenticates the release workload. Its IAM database user must be a
member of `capgo_read_replica_schema_executor`, with no `cloudsqlsuperuser`
membership and no direct selected-table privileges. The postgres-owned
`capgo_internal.add_read_replica_column` function installed from
`cloud_sql_owner_executor.sql` is the only DDL capability available to it.

Install or update that owner bootstrap through an authenticated Google CLI admin
before releasing it; do not grant the CI database user table ownership or broad
DDL roles.

The release workflow first uses Tinbase/PGlite to apply the tag's local migrations
in memory and build a fresh selected-schema catalog. Only then does it apply safe
additive DDL through the Data API and verify the subscriber before primary
migrations start. A migration or local catalog failure therefore makes no Google
SQL request.

`schema_replicate.catalog.json` is not a release input; it can remain only as a
PR regression artifact.

```bash
bun scripts/sync-read-replica-schema.ts
```

The dedicated Google service account must be an IAM database user with the
subscriber DDL permissions. Cloud SQL Data API limits an individual statement to
30 seconds; the reconciler fails rather than pretending a timed-out DDL ran.
