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
- do not create new cron jobs it's bad pattern instead update
  process_all_cron_tasks function in a new migration file to add your job if
  needed.

## Frontend Style

- The web client is built with Vue.js and Tailwind CSS; lean on utility classes
  and composition-friendly patterns rather than bespoke CSS.
- Use DaisyUI (`d-` prefixed classes) for buttons, inputs, and other interactive
  primitives to keep behavior and spacing consistent.
- Konsta components are reserved for the safe area helpers. Avoid importing
  `konsta` anywhere else in the app.
- Capgo’s look centers on deep slate bases with the “Extract” azure highlight
  (`--color-azure-500: #119eff`) and soft radii; mirror the palette from
  `src/styles/style.css` (e.g., `--color-primary-500: #515271`) when introducing
  new UI.

## Frontend Testing

- Cover customer-facing flows with the Playwright MCP suite. Add scenarios under
  `playwright/e2e` and run them locally with `bun run test:front` before
  shipping UI changes.
