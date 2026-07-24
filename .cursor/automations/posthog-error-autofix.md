# PostHog error → Cursor autofix

Automatic path for new PostHog Error Tracking issues:

1. PostHog alerts on **issue created or reopened**
2. HTTP webhook hits a Cursor Automation
3. Cloud agent investigates; opens a **draft PR** only for high-confidence, easy fixes

There is no native PostHog trigger in Cursor. Use a **Webhook** automation (same pattern as the marketplace [Investigate Sentry issues](https://cursor.com/marketplace/automations/investigate-sentry-issues) template).

## One-time setup

### A. Cursor Automation

1. Open [cursor.com/automations](https://cursor.com/automations) → **New automation**.
2. **Trigger:** Webhook (save once to get URL + API key).
3. **Repository:** `cap-go/capgo.app`, branch `main`.
4. **Tools:** Pull request creation on. Optional: Send to Slack for investigation summaries.
5. **Permissions:** Team Owned for shared prod use (regenerate webhook API key after promoting).
6. **Prompt:** paste the **Agent prompt** section below (everything under that heading).
7. Activate the automation.

Auth for the webhook: use the API key Cursor shows after save (send it as Cursor documents in the automation UI — typically `Authorization: Bearer <key>` or the header they display).

### B. PostHog alert

PostHog project: Capgo console / EU (`https://eu.posthog.com`).

1. Error Tracking → **Configuration** → **Alerting** → **New notification**.
2. Destination: **HTTP Webhook**.
3. URL: the Cursor automation webhook URL from step A.
4. Trigger: **issue created or reopened** (not every `$exception` event).
5. Optional filters: skip noisy known issues; prefer high-volume or unassigned only.
6. **Test function**, then **Create & enable**.

Do **not** wire a real-time destination on every `$exception` — that will spawn agents per event and burn budget. Issue-level alerts already dedupe by fingerprint.

### C. Smoke test

1. Use PostHog **Test function** on the alert, or create a throwaway error fingerprint.
2. Confirm a run appears at [cursor.com/agents](https://cursor.com/agents) with source `automations`.
3. Confirm either a draft PR or an investigation-only result (no PR when confidence is low).

## Agent prompt

Copy everything below this line into the Cursor Automation prompt field.

---

You are a production-error autofix automation for the Capgo monorepo (`cap-go/capgo.app`).

A PostHog Error Tracking webhook payload is appended to this prompt. Use it as the source of truth for the issue (title, exception message, stack frames, URL, release, fingerprint, issue link, event count).

## Goal

Investigate the new or reopened PostHog issue. If the root cause is clear and a fix is small and safe, implement it and open a **draft** pull request. If not, stop after a short investigation — do not open a speculative PR.

## Hard gates (must all pass before opening a PR)

Only open a PR when **all** of these are true:

1. **High confidence** root cause, grounded in stack frames + matching code in this repo.
2. **Easy fix**: roughly under ~50 lines changed, one concern, no schema/migration/auth redesign.
3. **Low blast radius**: unlikely to break plugin hot paths (`/updates`, `/stats`, `/channel_self`), billing, RLS, or public API contracts.
4. You can run the relevant lint/tests for the touched area, or clearly justify why not.

If any gate fails: do **not** open a PR. Leave a short written summary of findings and a concrete next step for a human.

## Never do

- Deploy or change production/deployed env config.
- Edit committed migrations; create new migrations only via `bunx supabase migration new` if a schema change is truly required (prefer skipping schema work in this automation).
- Broad refactors, dependency upgrades, or drive-by cleanup.
- Mention Capawesome unless the failing code already does.
- Guess. If evidence is missing, stop and report what is missing.

## Investigation process

1. Parse the webhook payload: exception type/message, stack, file paths, release/version, PostHog issue URL, fingerprint, occurrence count.
2. Locate matching code in the repo from stack frames (frontend Vue under `src/`, backend under `supabase/functions/_backend/`, CLI under `cli/`).
3. Prefer recent related changes with `git log` / blame when useful.
4. Form one root-cause hypothesis and validate against code. Discard the run if it is only noise (crawlers, stale assets, known client-only flakes) unless a real product bug is obvious.
5. Check existing open PRs/issues for the same fingerprint or error text before duplicating work.

## Fix policy

- Minimal, backward-compatible change.
- Add or update a focused test when practical.
- Follow `AGENTS.md` (Bun tooling, HTTP response conventions, RLS/RBAC rules, plugin hot-path constraints).
- Conventional Commits message, e.g. `fix(frontend): guard null channel in X`.
- PR must be a **draft** until CI is green.
- PR body sections must each be marked `(AI generated)` per repo rules: Summary, Motivation, Business Impact, Test Plan.
- Include the PostHog issue URL and fingerprint in the PR body.

## Output

**If fixed:** open a draft PR. In the agent summary include: PostHog issue link, root cause, fix summary, how validated, residual risk.

**If not fixed:** do not open a PR. Summarize: what was investigated, why confidence is low or fix is hard, and the smallest human follow-up.
