# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with
code in this repository.

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

## Mobile Development

### Capacitor Configuration

- App ID: `ee.forgr.capacitor_go`
- Build command: `bun mobile` (builds and copies to platforms)
- iOS/Android projects in respective platform directories
- Uses Capacitor Updater plugin for OTA updates

## Pull Request Guidelines

### Required Sections

Every pull request MUST include the following sections:

1. **Summary** - Brief description of what changed
2. **Motivation** - Why this change is needed
3. **Business Impact** - How this affects Capgo's business, users, or revenue
4. **Test Plan** - Checklist for testing the changes

### AI-Generated Content Marking - MANDATORY

**CRITICAL: ALL sections in a PR created by Claude Code MUST be marked with
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

🤖 Generated with [Claude Code](https://claude.ai/code)
```

## Deployment

The Deployed happen automatically after github CI/CD on main branch.

You are not allowed to deploy on your own, unless if asked. Same for git you
never git push, add or commit unless asked.
