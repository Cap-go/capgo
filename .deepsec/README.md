# deepsec

This directory holds the [deepsec](https://www.npmjs.com/package/deepsec)
config for the parent repo. Checked into git so teammates inherit
project context (auth shape, threat model, custom matchers); generated
scan output is gitignored.

Currently configured project: `capgo` (target: `..`).

## Setup

1. `bun install` — installs deepsec.
2. Add an AI Gateway / Anthropic / OpenAI token to `.env.local`. If
   you already have `claude` or `codex` CLI logged in on this
   machine, you can skip the token for non-sandbox runs (`process` /
   `revalidate` / `triage`); deepsec auto-detects and reuses the
   subscription. See
   `node_modules/deepsec/dist/docs/vercel-setup.md` after install.
3. Keep `data/capgo/INFO.md` short and project-specific. Refresh it
   when auth, API-key, storage, or plugin endpoint architecture changes.

## Daily commands

```bash
bun deepsec scan
bun deepsec process     --concurrency 5
bun deepsec revalidate  --concurrency 5                  # cuts FP rate
bun deepsec export      --format md-dir --out ./findings
```

`--project-id` is auto-resolved while there's only one project in
`deepsec.config.ts`. Once you've added a second project, pass
`--project-id capgo` (or whichever id you want) explicitly.

`scan` is free (regex only). `process` is the AI stage; cost depends on
the selected agent/model and the number of files investigated. Run
state goes to `data/capgo/`.

## Adding another project

To scan another codebase from this same `.deepsec/`:

```bash
bun deepsec init-project ../some-other-package   # path relative to .deepsec/
```

Appends an entry to `deepsec.config.ts` and writes
`data/<id>/{INFO.md,SETUP.md,project.json}`. Open the new SETUP.md
in your agent to fill in INFO.md.

## Layout

```text
deepsec.config.ts        Project list (one entry per scanned repo)
data/capgo/
  INFO.md                Repo context — checked into git, hand-curated
  config.json            Project-specific scanner settings
  project.json           Generated (gitignored)
  files/                 One JSON per scanned source file (gitignored)
  runs/                  Run metadata (gitignored)
  reports/               Generated markdown reports (gitignored)
AGENTS.md                Pointer for coding agents
.env.local               Tokens (gitignored)
```

## Docs

After `bun install`:

- Skill: `node_modules/deepsec/SKILL.md`
- Full docs: `node_modules/deepsec/dist/docs/{getting-started,configuration,models,writing-matchers,plugins,architecture,data-layout,vercel-setup,faq}.md`

Or browse on
[GitHub](https://github.com/vercel-labs/deepsec/tree/main/docs).
