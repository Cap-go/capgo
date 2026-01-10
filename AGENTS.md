# AGENTS.md

This file provides guidance to AI agents (Claude Code, Cursor, Copilot, etc.)
when working with code in this repository.

## Essential Development Commands

### Building and Development

- `bun serve:dev` - Start local development server with local environment
- `bun serve` - Start development server with default configuration
- `bun build` - Build production version of the web app
- `bun mobile` - Build for mobile and copy to Capacitor platforms
- `bun dev-build` - Build with development branch configuration

### Testing

#### Supabase Edge Functions (Default)

- `bun test:all` - Run all backend tests
- `bun test:backend` - Run backend tests excluding CLI tests
- `bun test:cli` - Run CLI-specific tests
- `bun test:local` - Run tests with local CLI path
- `bun test:front` - Run Playwright frontend tests
- `LOCAL_CLI_PATH=true bun test:all:local` - Run all tests with local CLI
  configuration

#### Cloudflare Workers Testing

- `bun test:cloudflare:all` - Run all tests against Cloudflare Workers
- `bun test:cloudflare:backend` - Run backend tests against Cloudflare Workers
- `bun test:cloudflare:updates` - Run update tests against Cloudflare Workers
- `./scripts/start-cloudflare-workers.sh` - Start local Cloudflare Workers for
  testing

See [CLOUDFLARE_TESTING.md](CLOUDFLARE_TESTING.md) for detailed information on
testing against Cloudflare Workers.

### Code Quality

- `bun lint` - Lint Vue, TypeScript, and JavaScript files
- `bun lint:fix` - Auto-fix linting issues
- `bun lint:backend` - Lint Supabase backend files
- `bun typecheck` - Run TypeScript type checking with vue-tsc
- `bun types` - Generate TypeScript types from Supabase

### Database and Backend

- `supabase start` - Start local Supabase instance
- `supabase db reset` - Reset and seed local database
- `bun backend` - Start Supabase functions locally
- `bun reset` - Reset Supabase database

## Architecture Overview

### Frontend Architecture

- **Framework**: Vue 3 with Composition API and `<script setup>` syntax
- **Build Tool**: Vite with custom Rolldown integration
- **Routing**: File-based routing with unplugin-vue-router
- **State Management**: Pinia stores
- **Styling**: TailwindCSS with DaisyUI components
- **Mobile**: Capacitor for native mobile functionality

### Backend Architecture

- **Database**: PostgreSQL via Supabase
- **Edge Functions**: Supabase Edge Functions (Deno runtime)
- **API Deployment**: Multi-platform deployment:
  - Cloudflare Workers (primary, handles 99% of traffic)
  - Supabase Functions (internal tasks, CRON jobs)

### Key Backend Components

- **`supabase/functions/_backend/`** - Core backend logic
  - `plugins/` - Public plugin endpoints (updates, stats, channel_self)
  - `private/` - Internal API endpoints (auth required)
  - `public/` - Public API endpoints (app, bundle, device management)
  - `triggers/` - Database triggers and CRON functions
  - `utils/` - Shared utilities and database schemas

### Key Frontend Directories

- **`src/components/`** - Reusable Vue components
- **`src/pages/`** - File-based route pages
- **`src/services/`** - API clients and external service integrations
- **`src/stores/`** - Pinia state management stores
- **`src/layouts/`** - Page layout components

## Development Environment

### Required Tools

- **Bun** - Package manager and JavaScript runtime
- **Docker** - Required for Supabase local development
- **Supabase CLI** - Database and functions management

### Environment Setup

1. Install dependencies: `bun install`
2. Start Supabase: `supabase start`
3. Reset database with seed data: `supabase db reset`
4. Start frontend: `bun serve:dev`

### Test Accounts (Local Development)

- Demo User: `test@capgo.app` / `testtest`
- Admin User: `admin@capgo.app` / `adminadmin`

## Testing Strategy

### Backend Tests

- Located in `tests/` directory
- Use Vitest test runner with custom configuration
- Require running Supabase instance
- Tests modify local database state
- CLI tests require `LOCAL_CLI_PATH=true` environment variable

### Test Categories

- API endpoint tests (CRUD operations)
- CLI functionality tests
- Database trigger tests
- Integration tests with external services

### CRITICAL: Test Isolation for Parallel Execution

**ALL TEST FILES RUN IN PARALLEL.** Tests within the same file run sequentially (unless explicitly configured otherwise), but different test files execute simultaneously. You MUST design tests accordingly.

**Maximize parallelism:** Use `it.concurrent()` instead of `it()` to run tests in parallel within the same file. More parallel tests = faster CI/CD.

When creating tests that interact with shared resources (users, apps, orgs, devices, channels, bundles, etc.), follow these rules:

**You CAN reuse existing seed data IF:**
- You only READ the data, not modify it
- You create your OWN child resources under it (e.g., reuse a user but create your own app/org for that user)
- The parent resource is not modified by your test or other tests

**You MUST create dedicated seed data IF:**
- Your test MODIFIES the resource (update, delete, change settings)
- Other tests also modify that same resource
- The resource state matters for your test assertions

**Guidelines:**
1. **Create dedicated seed data when needed** - Add new test-specific entries in `supabase/seed.sql` with unique identifiers
2. **Use unique naming conventions** - Prefix test data with the test file name or feature being tested (e.g., `test_my_feature_user@capgo.app`, `com.test.myfeature.app`)
3. **Clean up is NOT enough** - Even with cleanup, parallel test files might try to use the data simultaneously

**Examples of what breaks parallel test files:**
- Modifying the default `test@capgo.app` user's settings
- Deleting or updating the default app `com.demo.app`
- Changing org settings on the shared test org
- Using hardcoded IDs that other test files also modify

**Examples of safe reuse:**
- Using `test@capgo.app` to create a NEW app specific to your test (user is not modified)
- Reading from shared orgs without modifying them
- Creating new channels/bundles under your own dedicated app

**When you need isolation, create dedicated seed data:**
```sql
-- In seed.sql, add dedicated test data for your test file:
INSERT INTO auth.users (id, email, ...) VALUES
  ('unique-uuid-for-my-test', 'my_feature_test@capgo.app', ...);
INSERT INTO public.apps (app_id, owner_org, ...) VALUES
  ('com.test.myfeature.app', 'my-test-org-id', ...);
```

Then in your test file, use ONLY these dedicated resources for modifications.

**If your test breaks other tests in CI/CD, it is YOUR responsibility to fix it by creating isolated seed data.**

## Code Style and Conventions

### ESLint Configuration

- Uses `@antfu/eslint-config` with custom rules
- Single quotes, no semicolons
- Vue 3 Composition API preferred
- Ignores: dist, scripts, public, supabase generated files

### TypeScript

- Strict mode enabled
- Path aliases: `~/` maps to `src/`
- Auto-generated types for Vue components and routes
- Supabase types auto-generated via CLI

## Supabase Best Practices

- Always cover database changes with Postgres-level tests and complement them
  with end-to-end tests for affected user flows.
- Use the Supabase CLI for every migration and operational task whenever
  possible; avoid manual changes through the dashboard or direct SQL.
- When a feature requires schema changes, create a single migration file with
  the Supabase CLI (`supabase migration new <feature_slug>`) and keep editing
  that file until the feature ships; never edit previously committed migrations.
- Updating `supabase/seed.sql` to back new or evolved tests is expected; keep
  fixtures focused on current behavior while leaving committed migrations
  unchanged.
- A migration that introduces a new table may include seed inserts for that
  table, but treat that seeding as part of the current feature and do not modify
  previously committed migrations.
- Investigate failing Supabase tests by reviewing the Docker container logs and
  any other relevant service logs before retrying.
- Before validating any backend or frontend task, run the project lint/format
  command to ensure consistent formatting.
- Leave `CHANGELOG.md` entries and the `version` field in `package.json` to the
  release automation; CI/CD updates them during tagged releases.
- Do not create new cron jobs it's bad pattern instead update
  process_all_cron_tasks function in a new migration file to add your job if
  needed.
- Never use the Supabase admin SDK (with service key) for user-facing APIs.
  Always use the client SDK with user authentication so RLS policies are
  enforced. The admin SDK should only be used when accessing data that is not
  user-accessible or for internal operations (triggers, CRON jobs, etc.). When
  admin access is unavoidable for a user-facing endpoint, sanitize all user
  inputs carefully—the SDK is susceptible to PostgREST query injection (not SQL
  injection, but filter/modifier injection via crafted parameters).

## Database RLS Policies

### Identity Functions for RLS - CRITICAL RULES

**NEVER use `get_identity()` directly in RLS policies.**

**ALWAYS use `get_identity_org_appid()` when app_id exists on the table.**

```sql
public.get_identity_org_appid(
    '{read,upload,write,all}'::public.key_mode[],
    owner_org,  -- or org_id
    app_id
)
```

**`get_identity_org_allowed()` is an ABSOLUTE LAST RESORT.** Only use it when:

- The table genuinely has NO app_id column
- There is NO way to join to get an app_id
- You have exhausted all other options

If you find yourself reaching for `get_identity_org_allowed()`, STOP and ask:
"Is there ANY way to get an app_id here?" If yes, use `get_identity_org_appid()`.

### RLS Pattern Examples

```sql
-- CORRECT: Table has app_id - use get_identity_org_appid
CREATE POLICY "Allow org members to select build_requests"
ON public.build_requests
FOR SELECT
TO authenticated, anon
USING (
    public.check_min_rights(
        'read'::public.user_min_right,
        public.get_identity_org_appid(
            '{read,upload,write,all}'::public.key_mode[],
            owner_org,
            app_id
        ),
        owner_org,
        app_id,
        NULL::BIGINT
    )
);

-- CORRECT: Table has no app_id but can JOIN to get it
CREATE POLICY "Allow org members to select daily_build_time"
ON public.daily_build_time
FOR SELECT
TO authenticated, anon
USING (
    EXISTS (
        SELECT 1 FROM public.apps
        WHERE apps.app_id = daily_build_time.app_id
        AND public.check_min_rights(
            'read'::public.user_min_right,
            public.get_identity_org_appid(
                '{read,upload,write,all}'::public.key_mode[],
                apps.owner_org,
                apps.app_id
            ),
            apps.owner_org,
            apps.app_id,
            NULL::BIGINT
        )
    )
);

-- LAST RESORT: Table has NO app_id and NO way to get one (e.g., build_logs)
CREATE POLICY "Allow org members to select build_logs"
ON public.build_logs
FOR SELECT
TO authenticated, anon
USING (
    public.check_min_rights(
        'read'::public.user_min_right,
        public.get_identity_org_allowed(
            '{read,upload,write,all}'::public.key_mode[],
            org_id
        ),
        org_id,
        NULL::CHARACTER VARYING,
        NULL::BIGINT
    )
);
```

Key points:

- Use both `authenticated` and `anon` roles (anon enables API key auth)
- Pass app_id to BOTH `get_identity_org_appid()` AND `check_min_rights()`
- Reference apps, channels, app_versions tables for more examples

## Frontend Style

- The web client is built with Vue.js and Tailwind CSS; lean on utility classes
  and composition-friendly patterns rather than bespoke CSS.
- Use DaisyUI (`d-` prefixed classes) for buttons, inputs, and other interactive
  primitives to keep behavior and spacing consistent.
- Konsta components are reserved for the safe area helpers. Avoid importing
  `konsta` anywhere else in the app.
- Capgo's look centers on deep slate bases with the "Extract" azure highlight
  (`--color-azure-500: #119eff`) and soft radii; mirror the palette from
  `src/styles/style.css` (e.g., `--color-primary-500: #515271`) when introducing
  new UI.

## Frontend Testing

- Cover customer-facing flows with the Playwright MCP suite. Add scenarios under
  `playwright/e2e` and run them locally with `bun run test:front` before
  shipping UI changes.

## Mobile Development

### Capacitor Configuration

- App ID: `ee.forgr.capacitor_go`
- Build command: `bun mobile` (builds and copies to platforms)
- iOS/Android projects in respective platform directories
- Uses Capacitor Updater plugin for OTA updates

## Database Replication

Our main database is hosted on Supabase. We use custom replica hosted in
Planetscale.

We have 5 read replicas for our main database to ensure high availability and
low latency for read operations. These replicas are synchronized with the
primary database using logical replication. We have one replica by continent:

- North America (Ohio)
- Europe (Frankfurt)
- Asia (Seoul)
- Australia (Sydney)
- South America (Sao Paulo)

Applications are configured to read from the nearest replica based on the user's
location. This repartition is done by Cloudflare snippets at
`cloudflare_workers/snippet/index.js`.

## Pull Request Guidelines

### Required Sections

Every pull request MUST include the following sections:

1. **Summary** - Brief description of what changed
2. **Motivation** - Why this change is needed
3. **Business Impact** - How this affects Capgo's business, users, or revenue
4. **Test Plan** - Checklist for testing the changes

### AI-Generated Content Marking - MANDATORY

**CRITICAL: ALL sections in a PR created by AI agents MUST be marked with
"(AI generated)".**

Example:

```markdown
## Summary (AI generated)

- Fixed the build system RLS policies

## Motivation (AI generated)

The native build system needed consistent RLS patterns...

## Business Impact (AI generated)

This enables revenue growth by providing a working build system...

## Test Plan (AI generated)

- [ ] Verify authenticated users can access build requests
- [ ] Verify API key authentication works
```

**WARNING: Failure to mark AI-generated sections is a violation of transparency
requirements. If you do not mark sections as "(AI generated)", you are doing it
wrong and this is unacceptable behavior. You will be punished for not being
transparent about AI-generated content. ALWAYS mark every section with
"(AI generated)".**

### PR Template

```markdown
## Summary (AI generated)

- [Bullet points of changes]

## Motivation (AI generated)

[Why this change is needed]

## Business Impact (AI generated)

[How this affects Capgo - revenue, users, experience, etc.]

## Test Plan (AI generated)

- [ ] [Testing checklist]

Generated with AI
```

## Deployment

The deployment happens automatically after GitHub CI/CD on main branch.

You are not allowed to deploy on your own, unless if asked. Same for git you
never git push, add or commit unless asked.
