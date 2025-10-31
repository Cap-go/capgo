# LibSQL Sync Worker for Bunny Edge Scripting

This worker synchronizes data from PostgreSQL to LibSQL (BunnyDB) using a queue-based replication system.

## Overview

- **Source**: PostgreSQL database with PGMQ queue (`replicate_data_libsql`)
- **Target**: LibSQL (BunnyDB) database
- **Sync Method**: Batch processing triggered by webhook
- **Operations**: INSERT, UPDATE, DELETE
- **Tables**: app_versions, channels, channel_devices, apps, orgs, stripe_info, manifest

## Architecture

1. **Triggers**: PostgreSQL triggers queue changes to `replicate_data_libsql` PGMQ queue
2. **Worker**: Bunny Edge Script reads from queue, converts PG types to SQLite, executes batch operations
3. **Cron**: Supabase cron job calls `/sync` endpoint every 5 minutes

## Environment Variables

Required environment variables:

- `LIBSQL_URL` - LibSQL database URL (e.g., `libsql://your-db.bunny.net`)
- `LIBSQL_AUTH_TOKEN` - LibSQL authentication token (write access)
- `PGMQ_URL` - PostgreSQL connection string with PGMQ access
- `WEBHOOK_SIGNATURE` - Secret for webhook authentication

## Endpoints

### `POST /sync`

Processes messages from the PGMQ queue and syncs to LibSQL.

**Headers:**
- `x-webhook-signature`: Must match `WEBHOOK_SIGNATURE` env var

**Response:**
```json
{
  "success": true,
  "processed": 123,
  "queued": 456
}
```

### `POST /nuke`

Deletes all data from LibSQL and reinitializes the schema.

**Headers:**
- `x-webhook-signature`: Must match `WEBHOOK_SIGNATURE` env var

**Response:**
```json
{
  "success": true,
  "message": "Data nuked and schema reinitialized"
}
```

### `GET /health` or `GET /ok`

Health check endpoint.

**Response:**
```
OK
```

## Building

Build the worker bundle:

```bash
bun run build:bunny:libsql_sync
```

This creates `bunny/libsql_sync/dist.js` using Deno bundler with minification.

## Deployment

This worker is deployed manually to Bunny Edge Scripting (no auto-deploy in CI/CD).

1. Build the bundle: `bun run build:bunny:libsql_sync`
2. Upload `bunny/libsql_sync/dist.js` to Bunny Edge Scripting
3. Set environment variables in Bunny dashboard

## Database Setup

The Supabase migration `20251031173352_libsql_replication_setup.sql` creates:

1. `get_libsql_sync_url()` - Function to retrieve sync endpoint URL from vault
2. `get_libsql_webhook_signature()` - Function to retrieve webhook secret from vault
3. `trigger_http_queue_post_to_function_libsql()` - Trigger function to queue changes
4. `process_libsql_replication_batch()` - Function to call sync endpoint
5. `replicate_data_libsql` - PGMQ queue
6. Triggers on all relevant tables
7. Cron job to process queue every 5 minutes

### Required Vault Secrets

Store these secrets in Supabase Vault:

- `libsql_sync_url` - LibSQL sync endpoint URL (e.g., `https://your-bunny-worker.b-cdn.net/sync`)
- `libsql_webhook_signature` - Secret for webhook authentication (must match `WEBHOOK_SIGNATURE` env var in Bunny worker)

## Schema

The schema is defined in `schema.json` and matches the tables in the PostgreSQL database.

Tables synced:
- `app_versions`
- `channels`
- `channel_devices`
- `apps`
- `orgs`
- `stripe_info`
- `manifest`

## Type Conversion

PostgreSQL to SQLite type mapping:

- `INTEGER` → `INTEGER`
- `TEXT` → `TEXT`
- `BOOLEAN` → `BOOLEAN`
- `JSON` → `TEXT` (stored as JSON string)
- All other types → `TEXT`

## Security

- Webhook signature validation using constant-time comparison to prevent timing attacks
- Read-only PGMQ access for queue operations
- Write access to LibSQL required for data sync

## Monitoring

The worker logs:
- Messages read from queue
- Batch execution status
- Errors during processing
- Number of messages processed and remaining in queue
