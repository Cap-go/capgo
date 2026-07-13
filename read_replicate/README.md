# Read Replica Scripts

These scripts manage the Supabase to Google Cloud SQL read-replica subscriber.
Google handles replication from this subscriber to downstream regional replicas,
so every reconciliation targets only this database.

## Release reconciliation

Production reconciliation uses Cloud SQL Data API through GitHub OIDC. It never
accepts a direct subscriber PostgreSQL URL, never allowlists GitHub runner IPs,
and does not deploy a temporary Worker.

| Variable                       | Value                                   |
| ------------------------------ | --------------------------------------- |
| `GOOGLE_CLOUD_PROJECT`         | Google Cloud project ID                 |
| `GOOGLE_READ_REPLICA_INSTANCE` | Google Cloud SQL subscriber instance ID |
| `GOOGLE_READ_REPLICA_DATABASE` | Subscriber database name                |

The workflow verifies Data API access before it applies primary migrations. It
then reads the selected catalog from the primary through the Supabase Management
API and applies reconciliation DDL with the Cloud SQL Data API.

```bash
bun run readreplicate:sync-schema
```

The dedicated Google service account must be an IAM database user with the
subscriber DDL permissions. Cloud SQL Data API limits an individual statement
to 30 seconds; the reconciler fails rather than pretending a timed-out DDL ran.
