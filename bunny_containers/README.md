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
- Docker image published to GitHub Container Registry (ghcr.io)
- Bunny Magic Container pulls image from GHCR

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
- Docker image published to GitHub Container Registry (ghcr.io)
- Bunny Magic Container pulls image from GHCR

## Deployment Process

Both containers follow the same deployment workflow:

1. **Build**: GitHub Actions builds Docker image
2. **Publish**: Image pushed to GitHub Container Registry (ghcr.io)
3. **Deploy**: Bunny Magic Container pulls latest image from GHCR
4. **Environment**: Configure environment variables in Bunny dashboard

**Image URLs:**
- LibSQL Sync: `ghcr.io/[owner]/capgo-1/libsql-sync:latest`
- Plugin: `ghcr.io/[owner]/capgo-1/plugin:latest`

**Required GitHub Permissions:**
- `contents: read` - Read repository code
- `packages: write` - Push to GitHub Container Registry

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

### Required GitHub Secrets

Only 3 secrets needed for deployment:

- `BUNNY_ACCESS_KEY` - Bunny CDN access key
- `BUNNY_LIBSQL_SYNC_CONTAINER_ID` - Container ID for LibSQL sync
- `BUNNY_PLUGIN_CONTAINER_ID` - Container ID for plugin

Note: `GITHUB_TOKEN` is automatically provided by GitHub Actions for publishing Docker images.

## Environment Variables Configuration

**IMPORTANT**: Environment variables must be configured in the Bunny dashboard for each Magic Container, NOT in GitHub Actions or GitHub Secrets.

### LibSQL Sync Container Environment Variables

Configure these in Bunny dashboard → Container Settings → Environment Variables:

- `PORT` - Server port (default: 3000)
- `LIBSQL_URL` - LibSQL database URL
- `LIBSQL_AUTH_TOKEN` - LibSQL auth token (write access)
- `PGMQ_URL` - PostgreSQL connection string with PGMQ
- `WEBHOOK_SIGNATURE` - Webhook signature for sync endpoint

### Plugin Container Environment Variables

Configure these in Bunny dashboard → Container Settings → Environment Variables:

- `LIBSQL_URL` - LibSQL database URL
- `LIBSQL_AUTH_TOKEN_READ` - LibSQL auth token (read-only)
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_ANON_KEY` - Supabase anonymous key
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key
- `SUPABASE_DB_URL` - Supabase database URL
- `MAIN_SUPABASE_DB_URL` - Main Supabase database URL
- `API_SECRET` - API authentication secret
- `STRIPE_SECRET_KEY` - Stripe secret key
- `STRIPE_WEBHOOK_SECRET` - Stripe webhook secret
- `S3_ACCESS_KEY_ID` - S3 access key
- `S3_SECRET_ACCESS_KEY` - S3 secret key
- `S3_ENDPOINT` - S3 endpoint URL
- `S3_REGION` - S3 region
- `S3_SSL` - S3 SSL enabled (true/false)
- `S3_BUCKET` - S3 bucket name
- `DISCORD_ALERT` - Discord webhook URL for alerts
- `LOGSNAG_TOKEN` - LogSnag API token
- `LOGSNAG_PROJECT` - LogSnag project name
- `BENTO_PUBLISHABLE_KEY` - Bento publishable key (optional)
- `BENTO_SECRET_KEY` - Bento secret key (optional)
- `BENTO_SITE_UUID` - Bento site UUID (optional)
- `CF_ANALYTICS_TOKEN` - Cloudflare Analytics token (optional)
- `CF_ACCOUNT_ANALYTICS_ID` - Cloudflare Account ID (optional)
- `SB_REGION` - Supabase region
- `LIMITED_APPS` - Comma-separated list of rate-limited app IDs (optional)
- `CAPGO_PREVENT_BACKGROUND_FUNCTIONS` - Prevent background functions (optional)
- `ENVIRONMENT` - Environment name (production/staging/etc)

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
