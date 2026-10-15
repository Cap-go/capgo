# Invitation Bento Dispatch Implementation Plan

> **For agentic workers:** Use subagent-driven-development for the database task and independent spec/quality reviews. Keep repository changes public-safe.

**Goal:** Restore the four organization invitation reminder sends using a new Cloudflare Worker, one single-message Cloudflare Queue, and exactly one new shared dispatch table.

**Architecture:** The existing initial invitation email remains on Cloudflare. When its provider acknowledgement is saved, an internal trigger enrolls two reminder dispatch records. A minutely cron queues typed partition jobs; each queue invocation handles one job, claims a bounded batch of due records, rebuilds current invitation details, sends new Bento events, and persists acknowledgement. Source generations, atomic leases, persistent five-attempt ceilings, and current eligibility checks suppress ordinary duplicates and obsolete sends. Rare remote-acceptance/database-write ambiguity is accepted.

**Tech Stack:** Cloudflare Workers/Queues, PostgreSQL through pg/Hyperdrive, existing Bento tracking helper, Vitest and pgTAP.

## Task 1: One private generic dispatch table and invitation enrollment

- [ ] Create one migration with `bunx supabase migration new bento_invitation_dispatches`.
- [ ] Add `public.bento_event_dispatches`: UUID id; tag, recipient_key, context_key, email; due_at; partition; attempt_count (0..5); claim_token/claim_until; accepted_at; cancelled_at; last_error; created_at. Unique `(tag, recipient_key, context_key)`. Index pending jobs by `(tag, partition, due_at, id)`; service-role-only grants and explicit deny policies.
- [ ] Add one internal trigger on initial-email `sent_at` changing from null to nonnull. Resolve invitation and recipient through primary keys; enroll day-two and final reminder rows with new distinct event tags for new/existing recipients. Use the existing request generation as context. New-user final timing must precede token expiry; preserve seven days for existing users. Do not enroll legacy already-sent rows.
- [ ] Implement `cloudflare_workers/bento_dispatch/store.ts`: bounded atomic `SKIP LOCKED` claims, current-generation eligibility and URL inputs, token-fenced completion/failure/cancellation. Never reset attempt counts across cron jobs. Enforce both pending invitation variants and token expiration. Every SQL function uses empty search_path, explicit owner, and deny-by-default EXECUTE.
- [ ] Add pgTAP tests for enrollment, privileges, stable uniqueness, reissue generations, due claims, fencing, retry ceiling and cancellation. Verify query plans with production-like synthetic dispatch rows and parallel controls.

## Task 2: Dedicated Worker and queue

- [ ] Add typed operation registry containing four distinct invitation event types and five indexed partitions. Cron calls `Queue.send` once per job with a versioned envelope and current run identifier.
- [ ] Add queue handler with one message per invocation, bounded work, per-record acceptance persistence, current eligibility recheck, sanitized logs, existing `trackBentoEvent`, and finite provider timeout within the lease/runtime budget. Retry only unfinished work and acknowledge completed/invalid/exhausted jobs explicitly.
- [ ] Add Wrangler configuration: one queue per environment, `max_batch_size: 1`, `max_concurrency: 5`, `max_retries: 4`, minutely cron, primary Hyperdrive binding, no public fetch endpoint. Runtime activation remains off until replacement Bento flows are published.
- [ ] Add unit tests with fake store/provider/queue for producer fan-out, validation, independent failures, accepted-record suppression, retry/fencing and new event details. Run lint before tests, typecheck, and Wrangler dry-run.

## Task 3: Bento recreation and deployment integration

- [ ] Inspect live reference flow and four exact email templates through Bento Unofficial; retain the reference editor. Map each new event to its original reminder subject/body and transactional/throttle settings.
- [ ] Prepare four immediate event → send-email → exit flow specifications and a concrete cutover/rollback guide. Reuse unchanged email content. Eligible remote drafts must be user-created and publication remains manual under the plugin skill.
- [ ] Add queue provisioning and scoped alpha/production deployment after migrations, plus tests for deployment scope. Reuse existing secrets flow; never expose production credentials or recipient records.

## Task 4: Review and PR readiness

- [ ] Spec review then code-quality review; repair every actionable finding.
- [ ] Run relevant backend integration/SQL tests, unit tests, lint, typecheck, Worker build, and scale checks. Preserve unrelated `codedb.snapshot`; exclude Graphify output.
- [ ] Open draft PR with required AI-marked sections and attach it to this chat. Wait for checks, mark ready, address automatic review, and prove stable-green twice at least five minutes apart on unchanged head/base.
