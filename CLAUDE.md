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

- `bun test:all` - Run all backend tests
- `bun test:backend` - Run backend tests excluding CLI tests
- `bun test:cli` - Run CLI-specific tests
- `bun test:local` - Run tests with local CLI path
- `bun test:front` - Run Playwright frontend tests
- `LOCAL_CLI_PATH=true bun test:all:local` - Run all tests with local CLI
  configuration

### Code Quality

- `bun lint` - Lint Vue, TypeScript, and JavaScript files
- `bun lint-fix` - Auto-fix linting issues
- `bun lint-backend` - Lint Supabase backend files
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
  - Netlify Edge Functions (backup)
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

## Mobile Development

### Capacitor Configuration

- App ID: `ee.forgr.capacitor_go`
- Build command: `bun mobile` (builds and copies to platforms)
- iOS/Android projects in respective platform directories
- Uses Capacitor Updater plugin for OTA updates

## Deployment

The Deployed happen automatically after github CI/CD on main branch.

You are not allowed to deploy on your own, unless if asked. Same for git you
never git push, add or commit unless asked.
