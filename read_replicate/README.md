# Read Replica Scripts

These scripts manage the Supabase to Google Cloud SQL read-replica subscriber.
Google handles replication from this subscriber to downstream regional replicas,
so every reconciliation targets only this database.

## Release reconciliation

Production reconciliation uses Cloud SQL Data API through GitHub OIDC. It never
accepts a direct subscriber PostgreSQL URL, never allowlists GitHub runner IPs,
and does not deploy a temporary Worker.

| GitHub repository variable          | Value                                   |
| ----------------------------------- | --------------------------------------- |
| `GOOGLE_CLOUD_PROJECT`              | Google Cloud project ID                 |
| `GOOGLE_READ_REPLICA_INSTANCE`      | Google Cloud SQL subscriber instance ID |
| `GOOGLE_READ_REPLICA_DATABASE`      | Subscriber database name                |
| `GOOGLE_WORKLOAD_IDENTITY_PROVIDER` | GitHub OIDC provider resource name      |
| `GOOGLE_SERVICE_ACCOUNT`            | Google service account email            |

The release workflow reads the committed
`schema_replicate.catalog.json`, applies its safe additive DDL through the Data
API, and verifies the subscriber before `supabase db push` starts. If the
subscriber cannot converge, the primary migration is not run.

```bash
bun scripts/sync-read-replica-schema.ts \
  --google-cloud-project <project> \
  --google-read-replica-instance <instance> \
  --google-read-replica-database <database>
```

The dedicated Google service account must be an IAM database user with the
subscriber DDL permissions. Cloud SQL Data API limits an individual statement
to 30 seconds; the reconciler fails rather than pretending a timed-out DDL ran.
