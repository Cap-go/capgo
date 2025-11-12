# Bunny Migration: Edge Scripts → Magic Containers

## Overview

Migrated from Bunny Edge Scripts (Deno-based) to Bunny Magic Containers (Bun-based) for better runtime support, modern JavaScript features, and long-running server capabilities.

## What Changed

### Old Architecture (Edge Scripts)
- **Runtime**: Limited Deno runtime (outdated)
- **Deployment**: Individual script files bundled with `deno bundle`
- **Endpoints**: api, files, plugin, libsql_sync
- **Issues**:
  - Deno version too old, missing features
  - Cannot use modern dependencies
  - Limited connection pooling
  - Complex build process

### New Architecture (Magic Containers)
- **Runtime**: Full Bun 1.x runtime
- **Deployment**: Docker containers via GitHub Actions
- **Containers**:
  1. **LibSQL Sync** - Manages PostgreSQL → LibSQL replication
  2. **Plugin** - Serves plugin endpoints (updates, stats, channel_self)
- **Benefits**:
  - Modern JavaScript/TypeScript support
  - Better performance with Bun
  - Long-running connections to LibSQL and PostgreSQL
  - Simplified deployment with Docker

## New File Structure

```
bunny_containers/
├── README.md                              # Main documentation
├── libsql_sync/
│   ├── src/
│   │   ├── server.ts                      # Bun HTTP server
│   │   └── schema.ts                      # Table schemas
│   ├── schema.json                        # Schema definitions
│   ├── package.json                       # Dependencies
│   └── Dockerfile                         # Container build
└── plugin/
    ├── src/
    │   └── server.ts                      # Bun HTTP server with Hono
    ├── package.json                       # Dependencies
    └── Dockerfile                         # Container build

.github/workflows/
├── deploy_bunny_libsql_sync.yml          # Auto-deploy LibSQL sync
└── deploy_bunny_plugin.yml               # Auto-deploy plugin
```

## Removed Files

The following old Edge Script files are no longer needed:

```
bunny/                                     # All Edge Script code
├── api/
├── files/
├── plugin/
└── libsql_sync/

scripts/deploy_bunny_env.mjs              # Old env deployment script
```

These are now ignored in `.gitignore`.

## Deployment

### Deployment Process

Both containers use a two-step deployment process:

1. **Build & Publish**: GitHub Actions builds Docker image and publishes to GitHub Container Registry (ghcr.io)
2. **Deploy**: Bunny Magic Container pulls the published image from GHCR

The workflow automatically:
- Builds Docker image using Dockerfile
- Pushes to `ghcr.io/[owner]/capgo-1/[container]:latest`
- Notifies Bunny to pull and deploy the new image

**Note**: Environment variables are configured in the Bunny dashboard, not in GitHub Actions.

### Automatic Deployment

Both containers auto-deploy via GitHub Actions when:
- Push to `main` branch
- Changes detected in relevant paths

### Manual Deployment

Use GitHub workflow dispatch in Actions tab:
- "Deploy Bunny LibSQL Sync Container"
- "Deploy Bunny Plugin Container"

### Docker Images

Published to GitHub Container Registry:
- LibSQL Sync: `ghcr.io/[owner]/capgo-1/libsql-sync:latest`
- Plugin: `ghcr.io/[owner]/capgo-1/plugin:latest`

Images are public and pulled by Bunny Magic Container.

### Required GitHub Secrets

Only 3 secrets needed:

```
BUNNY_ACCESS_KEY                # Bunny CDN access key
BUNNY_LIBSQL_SYNC_CONTAINER_ID  # Container ID for sync
BUNNY_PLUGIN_CONTAINER_ID       # Container ID for plugin
```

**Note**: `GITHUB_TOKEN` is automatically provided by GitHub Actions for publishing Docker images to ghcr.io.

## Migration Steps

### 1. Create Bunny Magic Containers

In Bunny dashboard:
1. Create "LibSQL Sync" Magic Container
2. Create "Plugin" Magic Container
3. Note container IDs for GitHub secrets

### 2. Configure GitHub Secrets

Add the 3 required secrets to GitHub repository settings:
- `BUNNY_ACCESS_KEY`
- `BUNNY_LIBSQL_SYNC_CONTAINER_ID`
- `BUNNY_PLUGIN_CONTAINER_ID`

### 3. Configure Environment Variables in Bunny Dashboard

For each container in Bunny dashboard, configure environment variables:

**LibSQL Sync Container:**
- `PORT=3000`
- `LIBSQL_URL`
- `LIBSQL_AUTH_TOKEN`
- `PGMQ_URL`
- `WEBHOOK_SIGNATURE`

**Plugin Container:**
- `PORT=3000`
- All the environment variables listed in `bunny_containers/README.md` (39 total)

### 4. Deploy Containers

Push to main or trigger manual deployment via GitHub Actions.

### 5. Update Supabase Vault

Set `libsql_sync_url` to point to the new LibSQL Sync container URL:
```
https://your-libsql-sync-container.b-cdn.net/sync
```

### 6. Verify Deployment

Test endpoints:
```bash
# LibSQL Sync health check
curl https://your-libsql-sync-container.b-cdn.net/health

# Plugin health check
curl https://your-plugin-container.b-cdn.net/health

# Plugin endpoints
curl https://your-plugin-container.b-cdn.net/updates
curl https://your-plugin-container.b-cdn.net/stats
curl https://your-plugin-container.b-cdn.net/channel_self
```

### 7. Clean Up Old Edge Scripts (Optional)

Once verified, remove old `bunny/` directory:
```bash
rm -rf bunny/
git add bunny/
git commit -m "Remove old Bunny Edge Scripts"
```

## Technical Details

### LibSQL Sync Container

**Technology:**
- Bun runtime
- `@libsql/client` for LibSQL connection
- `postgres` package for PGMQ queue
- Direct HTTP server (no framework)

**Workflow:**
1. Receives POST request to `/sync` with webhook signature
2. Reads messages from `replicate_data_libsql` PGMQ queue
3. Converts PostgreSQL types to SQLite types
4. Batches SQL statements (998 per batch)
5. Executes batch on LibSQL
6. Archives processed messages
7. Returns processed count and remaining queue size

### Plugin Container

**Technology:**
- Bun runtime
- Hono web framework
- `@libsql/client` for LibSQL read access
- Imports existing plugin code from `supabase/functions/_backend/plugins/`

**Endpoints:**
- `/updates` - Handle app update checks
- `/stats` - Record statistics
- `/channel_self` - Device channel management

**Connection:**
- Uses LibSQL for read-only database access
- All writes still go through main API (PostgreSQL)
- Maintains read/write separation pattern

## Performance Benefits

1. **Faster cold starts** - Bun starts significantly faster than Deno
2. **Better throughput** - Bun HTTP server is highly optimized
3. **Persistent connections** - Long-running containers maintain database connections
4. **Native module support** - Can use any npm package without compatibility issues

## Monitoring

Check container logs in Bunny dashboard:
- Container logs show all HTTP requests
- Error logs for debugging
- Queue processing metrics

## Rollback Plan

If issues occur:

1. Keep old Edge Scripts in git history
2. Can redeploy Edge Scripts if needed
3. Update vault URL back to old endpoint
4. Old migration `20251031173352_libsql_replication_setup.sql` is compatible with both

## Next Steps

1. Monitor container performance for 1-2 weeks
2. Remove old Edge Script code from repository
3. Document container scaling if needed
4. Consider adding more containers for api/files endpoints
