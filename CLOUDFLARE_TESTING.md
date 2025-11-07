# Cloudflare Workers Testing Guide

This guide explains how to run tests against Cloudflare Workers instead of
Supabase Edge Functions.

## Overview

By default, tests run against Supabase Edge Functions
(`supabase functions serve`). However, since production primarily uses
Cloudflare Workers, you can now run tests directly against local Cloudflare
Workers to ensure compatibility.

## Architecture

The application has three Cloudflare Workers:

1. **API Worker** (port 8787): Handles most API endpoints
   - `/bundle`, `/app`, `/device`, `/channel`, `/apikey`, `/organization`,
     `/statistics`
   - Private endpoints: `/private/*`
   - Trigger endpoints for cron jobs and database triggers

2. **Plugin Worker** (port 8788): Handles plugin-specific endpoints
   - `/updates`, `/channel_self`, `/stats`, `/ok`, `/latency`

3. **Files Worker** (port 8789): Handles file operations
   - File upload and download

## Prerequisites

1. Supabase must be running: `supabase start`
2. Database must be seeded: `supabase db reset`
3. Environment variables must be configured in `internal/cloudflare/.env.local`
4. (Optional) For V2/D1 testing: Local D1 database must be synced (see V2/D1
   Testing section)

## Testing Modes

The workers support two testing modes:

### V1 Mode (PostgreSQL only)

- Tests the traditional PostgreSQL code path
- No D1 setup required
- Simpler and faster for basic testing

### V2 Mode (D1 + PostgreSQL)

- Tests the production D1 (edge database) code path
- Requires D1 setup and sync
- **Recommended for comprehensive testing** since production uses D1

The workers automatically use V2 mode when `IS_V2=1` is set in the local
environment.

## Running Tests

### Option 1: Manual Setup (Recommended for Development)

1. Start the Cloudflare Workers:

   ```bash
   ./scripts/start-cloudflare-workers.sh
   ```

   This will start all three workers in the background. Press Ctrl+C to stop
   them.

2. In another terminal, run the tests:
   ```bash
   bun test:cloudflare:all
   ```

### Option 2: Individual Test Suites

You can run specific test suites:

```bash
# Run all Cloudflare tests (excluding CLI tests)
bun test:cloudflare:backend

# Run only update-related tests
bun test:cloudflare:updates
```

### Option 3: Quick Test (Single Command)

For a quick test run without keeping workers alive:

```bash
# Start workers in background, run tests, then stop workers
./scripts/start-cloudflare-workers.sh &
WORKERS_PID=$!
sleep 5
bun test:cloudflare:all
kill $WORKERS_PID
```

## Environment Variables

The Cloudflare Worker tests use the following environment variables (set
automatically by `vitest.config.cloudflare.ts`):

- `USE_CLOUDFLARE_WORKERS=true` - Enables Cloudflare Worker mode
- `CLOUDFLARE_API_URL=http://127.0.0.1:8787` - API Worker URL
- `CLOUDFLARE_PLUGIN_URL=http://127.0.0.1:8788` - Plugin Worker URL
- `CLOUDFLARE_FILES_URL=http://127.0.0.1:8789` - Files Worker URL

## How It Works

The test utilities (`tests/test-utils.ts`) automatically route requests to the
correct worker:

- Plugin endpoints (`/updates`, `/channel_self`, `/stats`) → Plugin Worker
  (8788)
- All other endpoints → API Worker (8787)

This is done via the `getEndpointUrl()` helper function which determines the
correct worker based on the endpoint path.

## Differences from Supabase Edge Functions

1. **Port Configuration**: Cloudflare Workers run on different ports (8787,
   8788, 8789)
2. **Environment Loading**: Uses `internal/cloudflare/.env.local` instead of
   Supabase secrets
3. **Runtime**: Uses Cloudflare Workers runtime instead of Deno
4. **Worker Separation**: API and Plugin endpoints are handled by separate
   workers

## Troubleshooting

### Workers won't start

```bash
# Check if ports are already in use
lsof -i :8787
lsof -i :8788
lsof -i :8789

# Kill any existing wrangler processes
pkill -f "wrangler dev"
```

### Tests timeout

- Ensure Supabase is running: `supabase status`
- Check workers are responding:
  ```bash
  curl http://127.0.0.1:8787/ok
  curl http://127.0.0.1:8788/ok
  ```

### Database connection issues

- Verify `internal/cloudflare/.env.local` has correct database credentials
- Reset database: `supabase db reset`

## CI/CD Integration

To run Cloudflare Worker tests in CI:

```yaml
- name: Start Supabase
  run: supabase start

- name: Start Cloudflare Workers
  run: ./scripts/start-cloudflare-workers.sh &

- name: Wait for workers
  run: sleep 5

- name: Run tests
  run: bun test:cloudflare:all

- name: Stop workers
  run: pkill -f "wrangler dev"
```

## Development Tips

1. **Keep workers running**: Start workers once and run tests multiple times for
   faster iteration
2. **Watch mode**: Wrangler supports hot reload, changes to backend code will
   automatically restart workers
3. **Debug mode**: Add `--log-level debug` to wrangler commands in the start
   script for verbose logging
4. **Separate terminal**: Run workers in a dedicated terminal to see logs in
   real-time

## V2/D1 Testing

### Overview

V2 testing mode tests the production D1 (Cloudflare's edge database) code path.
In production, a percentage of traffic (controlled by `IS_V2`) uses D1 instead
of PostgreSQL for faster reads at the edge.

### Why Test V2?

- **Production parity**: 90% of production traffic uses D1 (`IS_V2=0.9`)
- **Catch D1-specific bugs**: D1 uses SQLite syntax which differs from
  PostgreSQL
- **Validate data sync**: Ensures the Postgres→D1 sync system works correctly

### Setup V2 Testing

1. **Create local D1 database** (one-time setup):

   ```bash
   # D1 database is already created as part of the project setup
   # Database ID: 3fca2d80-4ca0-4118-b0ce-a36068f43f15
   ```

2. **Sync data from Postgres to D1**:

   ```bash
   # Make sure Supabase is running and seeded
   supabase db reset

   # Sync all data to local D1
   bun run scripts/sync-postgres-to-d1.ts
   ```

3. **Start workers with V2 enabled**:

   ```bash
   # The workers now start with --env=local which enables V2 automatically
   ./scripts/start-cloudflare-workers.sh
   ```

4. **Run tests**:
   ```bash
   bun test:cloudflare:backend
   ```

### Syncing Data

The sync script (`scripts/sync-postgres-to-d1.ts`) copies data from PostgreSQL
to D1:

- **What it syncs**: All tables defined in
  `cloudflare_workers/d1_sync/schema.json`
- **When to run**: After `supabase db reset` or when testing D1-specific
  features
- **How it works**: Reads from Postgres, writes to local D1 database

```bash
# Re-sync data if you've made database changes
bun run scripts/sync-postgres-to-d1.ts
```

### Verifying V2 is Active

Check the worker startup logs for:

```
env.IS_V2 ("1")                                            Environment Variable      local
env.DB_REPLICATE_EU (capgo_local_replicate)                   D1 Database               local
```

### V2 Testing Workflow

```bash
# 1. Start Supabase
supabase start
supabase db reset

# 2. Sync to D1
bun run scripts/sync-postgres-to-d1.ts

# 3. Start workers (V2 enabled automatically)
./scripts/start-cloudflare-workers.sh

# 4. Run tests
bun test:cloudflare:backend
```

### Troubleshooting V2

**D1 database not found**:

- Ensure `cloudflare_workers/d1_sync/wrangler.jsonc` has the correct database
  configuration
- The local environment should have
  `database_id: 3fca2d80-4ca0-4118-b0ce-a36068f43f15`

**Data sync failures**:

- Verify Postgres is running: `supabase status`
- Check the schema matches: `cloudflare_workers/d1_sync/schema.json`

**Tests failing with D1 but passing with Postgres**:

- This indicates a D1-specific bug (SQLite vs PostgreSQL differences)
- Common issues: Date formatting, JSON handling, boolean values (0/1 vs
  true/false)

## Future Enhancements

- Add continuous sync during development (watch mode)
- Add support for testing against remote Cloudflare Workers (dev/preprod
  environments)
- Add performance benchmarking between Supabase and Cloudflare deployments
