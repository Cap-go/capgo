# deepsec

This directory holds the [deepsec](https://www.npmjs.com/package/deepsec)
config for the parent repo. Checked into git so teammates inherit
project context (auth shape, threat model, custom matchers); generated
scan output is gitignored.

Currently configured project: `capgo` (target: `..`).

## Setup

1. `bun install` — installs deepsec.
2. For CI, configure the repository secret `OPENAI_API_TOKEN`. The
   workflow brokers it through a local OpenAI proxy so the real token is
   not exposed to the DeepSec agent process. For local direct runs, set
   `OPENAI_API_KEY` in `.env.local`, or use an existing `codex` CLI
   login.
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

## PR checks

`.github/workflows/deepsec.yml` runs on `pull_request_target` so the
same required check can scan same-repo PRs and fork PRs. The workflow
does not check out a PR working tree; it installs deepsec from the
trusted base checkout, lists changed files through GitHub's PR files API,
fetches the PR head commit by SHA, copies changed PR files into a
sanitized `scan-target`, and passes that copy to deepsec as scan input.
The copy is built from regular git blobs, so symlinks are skipped instead
of dereferenced. Oversized individual blobs and oversized cumulative scan
targets are skipped before copying to keep the privileged check bounded.
Repository instruction files such as `AGENTS.md` and `CLAUDE.md` are
excluded from the agent root so fork-controlled instructions cannot
steer the privileged scan. DeepSec runs in a Docker container with only
the scanner workspace, `scan-target`, and `scan-files.txt` mounted. The
OpenAI token stays in a minimal local proxy; DeepSec receives only a
per-run local token and a scrubbed environment. The proxy only allows
`gpt-5.5` OpenAI requests and enforces per-run request, output-token,
request-byte, and response-byte budgets.

For fork PRs to be on-demand but mandatory, configure the
`deepsec-fork-pr` GitHub Environment with required reviewers, then mark
the `Scan PR changes` job as a required branch protection check. Fork
PRs will stay pending until a maintainer approves that environment run.
Same-repo PRs use the `deepsec-pr` environment.

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
