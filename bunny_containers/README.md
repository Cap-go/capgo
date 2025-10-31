# Bunny Magic Containers

This directory contains Bunny Magic Container deployments for long-running services using Bun runtime.

## Containers

### 1. LibSQL Sync ([libsql_sync/](libsql_sync/))

Synchronizes data from PostgreSQL to LibSQL (BunnyDB) using PGMQ queue.

**Endpoints:**
- `POST /sync` - Process queue and sync to LibSQL
- `POST /nuke` - Delete all data and reinitialize schema
- `GET /health` - Health check
- `GET /ok` - Health check

**Environment Variables:**
- `LIBSQL_URL` - LibSQL database URL
- `LIBSQL_AUTH_TOKEN` - LibSQL auth token (write access)
- `PGMQ_URL` - PostgreSQL connection string with PGMQ
- `WEBHOOK_SIGNATURE` - Secret for webhook authentication
- `PORT` - Server port (default: 3000)

**Deployment:**
- Automatic via GitHub Actions on push to main
- Manual: Use GitHub workflow dispatch

### 2. Plugin ([plugin/](plugin/))

Serves plugin endpoints (updates, stats, channel_self) with LibSQL read access.

**Endpoints:**
- `POST /updates` - Update endpoint
- `POST /stats` - Stats endpoint
- `POST /channel_self` - Channel self endpoint
- `PUT /channel_self` - Update channel self
- `DELETE /channel_self` - Delete channel self override
- `GET /health` - Health check
- `GET /ok` - Health check

**Environment Variables:**
- `LIBSQL_URL` - LibSQL database URL
- `LIBSQL_AUTH_TOKEN` - LibSQL auth token (read-only)
- `PORT` - Server port (default: 3000)

**Deployment:**
- Automatic via GitHub Actions on push to main
- Manual: Use GitHub workflow dispatch

## Local Development

### LibSQL Sync

```bash
cd bunny_containers/libsql_sync
bun install
export LIBSQL_URL="libsql://your-db.bunny.net"
export LIBSQL_AUTH_TOKEN="your-token"
export PGMQ_URL="postgresql://..."
export WEBHOOK_SIGNATURE="your-secret"
bun run start
```

### Plugin

```bash
cd bunny_containers/plugin
bun install
export LIBSQL_URL="libsql://your-db.bunny.net"
export LIBSQL_AUTH_TOKEN="your-read-token"
bun run start
```

## Docker Build

### LibSQL Sync

```bash
docker build -t bunny-libsql-sync ./bunny_containers/libsql_sync
docker run -p 3000:3000 \
  -e LIBSQL_URL="..." \
  -e LIBSQL_AUTH_TOKEN="..." \
  -e PGMQ_URL="..." \
  -e WEBHOOK_SIGNATURE="..." \
  bunny-libsql-sync
```

### Plugin

```bash
docker build -f bunny_containers/plugin/Dockerfile -t bunny-plugin .
docker run -p 3000:3000 \
  -e LIBSQL_URL="..." \
  -e LIBSQL_AUTH_TOKEN="..." \
  bunny-plugin
```

## GitHub Actions Setup

Required secrets in GitHub repository:

- `BUNNY_ACCESS_KEY` - Bunny CDN access key
- `BUNNY_LIBSQL_SYNC_CONTAINER_ID` - Container ID for LibSQL sync
- `BUNNY_PLUGIN_CONTAINER_ID` - Container ID for plugin
- `LIBSQL_URL` - LibSQL database URL
- `LIBSQL_AUTH_TOKEN` - LibSQL auth token (write access for sync)
- `LIBSQL_AUTH_TOKEN_READ` - LibSQL auth token (read-only for plugin)
- `PGMQ_URL` - PostgreSQL connection string
- `LIBSQL_WEBHOOK_SIGNATURE` - Webhook signature for sync endpoint

## Migration from Edge Scripts

The old Bunny Edge Script deployments (`bunny/api`, `bunny/files`, `bunny/plugin`, `bunny/libsql_sync`) have been replaced with Magic Containers because:

1. Edge Scripts use a limited Deno runtime that doesn't support newer features
2. Magic Containers provide full Bun runtime with all modern JavaScript features
3. Better support for long-running connections (LibSQL, PostgreSQL)
4. Simplified deployment via GitHub Actions
5. Better performance and scalability

**Old files to remove:**
- `bunny/` directory (Edge Scripts)
- `scripts/deploy_bunny_env.mjs`
- Build scripts in package.json (already removed)

## Architecture

```
┌─────────────────┐
│   PostgreSQL    │
│   + PGMQ        │
└────────┬────────┘
         │ Queue: replicate_data_libsql
         ↓
┌─────────────────┐      ┌─────────────────┐
│  LibSQL Sync    │─────→│   LibSQL/       │
│  Container      │      │   BunnyDB       │
└─────────────────┘      └────────┬────────┘
                                  │ Read
                                  ↓
                         ┌─────────────────┐
                         │    Plugin       │
                         │   Container     │
                         └─────────────────┘
```

- PostgreSQL triggers queue changes to PGMQ
- LibSQL Sync container processes queue and writes to LibSQL
- Plugin container reads from LibSQL for edge updates
- Supabase cron calls LibSQL Sync `/sync` endpoint every 5 minutes
