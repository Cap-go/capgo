# Builder Onboarding Recovery Emails — Backend Phase Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Emit `builder_onboarding_started` / `builder_onboarding_completed` signal events into Bento (keyed to the org's eligible members, opt-out-aware, deduped) so a later Bento automation can send a recovery email to people who start `capgo build init` but never finish.

**Architecture:** Option B (Bento-native + light personalization). The `capgo build init` wizard already POSTs each step to `/private/events` as a `Builder Onboarding Step` event. We add a sibling of the existing `onboarding-step-done` → Bento block in `events.ts`: on the `welcome` and `build-complete` milestone steps, build a `BentoTrackingPayload` and pass it through the **existing** `sendEventToTracking` → `sendNotifToOrgMembers` Bento path (which already resolves recipients, honors an email preference, and dedupes via `uniqId`). Recovery uses its **own dedicated `builder_onboarding` email preference** — deliberately separate from the existing `onboarding` key, which belongs to Capgo's OTA onboarding, so the two never get conflated. The decision logic lives in a pure, unit-tested helper. **No Bento automation, fields, or email template are built in this phase** — until the automation exists, these events trigger nothing (no emails go out), so this phase is safe to ship on its own.

**Tech Stack:** Deno/Hono backend (`supabase/functions/_backend`), TypeScript, Vitest (`from 'vitest'`), Drizzle schema, Bento (already integrated via `utils/bento.ts` + `utils/tracking.ts`).

---

## Chosen approach (decided in brainstorming)

- **Option B**, minimal personalization for now: email context = `app_name` + `platform` only (no stall-step/reason yet).
- **Dedicated `builder_onboarding` preference key** — NOT the existing `onboarding` key (which is Capgo OTA onboarding). Keeps Builder recovery opt-out independent.
- **Do not touch Bento** in this phase. Backend only.
- Phasing: (1) this plan, (2) build + land the backend, (3) only then design the Bento workflow + email template (+ the user-facing opt-out toggles).

## Scope

**In scope (this plan):**
- A new `builder_onboarding` email-preference key wired through the backend enumerations.
- A pure helper mapping a `Builder Onboarding Step` event → a `BentoTrackingPayload | undefined`.
- Wiring that helper into `private/events.ts` next to the existing onboarding→Bento block.
- Unit tests for the helper.

**Out of scope (deferred to the Bento phase, NOT built now):**
- The Bento workflow (trigger on `started` → wait 24h → suppress if `completed` → send).
- The email template / copy.
- The user-facing opt-out toggles in the two `Notifications.vue` settings pages (the preference works without them — Bento honors the disabled tag + unsubscribe; the toggle is only meaningful once emails send, so it ships with the Bento phase).
- Richer personalization (stall step, failure reason) — needs per-step field updates; revisit later.

## Data flow (recap)

```text
capgo build init ──POST /private/events (event:"Builder Onboarding Step",
                   tracking_version:2, org_id, tags:{step,platform,app_id})
   │
   ▼
private/events.ts route
   │  step === 'welcome'        → builder_onboarding_started
   │  step === 'build-complete' → builder_onboarding_completed
   ▼
sendEventToTracking({ ...trackedBody, bento: payload, sentToBento: true, groups:{organization:orgId} })
   ▼
executeBentoTracking → sendNotifToOrgMembers(event, preferenceKey:'builder_onboarding', data, orgId, uniqId, cron)
   ▼
Bento batch/events  (per eligible org member email; honors builder_onboarding opt-out; deduped by uniqId)
   ▼
[LATER PHASE] Bento automation reacts to these events
```

## File structure

- **Modify** `supabase/functions/_backend/utils/org_email_notifications.ts` — add `builder_onboarding` to the `EmailPreferenceKey` union + `EmailPreferences` interface.
- **Modify** `supabase/functions/_backend/utils/user_preferences.ts` — add the `builder_onboarding` → `builder_onboarding_disabled` Bento exclusion tag.
- **Create** `supabase/migrations/<UTC-timestamp>_add_builder_onboarding_pref.sql` — backfill existing users + update the column `DEFAULT` (the convention every prior key followed). Functionally optional (missing JSONB keys already read as enabled) but recommended to avoid schema drift.
- **Modify** `supabase/functions/_backend/utils/postgres_schema.ts` — mirror the new key in the Drizzle `users.email_preferences` default (this file *mirrors* the DB; it does not generate migrations).
- **Create** `supabase/functions/_backend/utils/builder_onboarding_recovery.ts` — pure logic: the milestone set + `buildBuilderOnboardingBentoEvent()`. No I/O.
- **Modify** `supabase/functions/_backend/private/events.ts` — call the helper on `Builder Onboarding Step` milestone steps (fetching org/app names), pass the result as the `bento` payload to the single existing `sendEventToTracking` call.
- **Create** `tests/builder-onboarding-recovery.unit.test.ts` — pure unit tests of the helper (Vitest).

---

### Task 1: Add the dedicated `builder_onboarding` email preference key

**Files:**
- Modify: `supabase/functions/_backend/utils/org_email_notifications.ts:65-94`
- Modify: `supabase/functions/_backend/utils/user_preferences.ts:13-27`
- Create: `supabase/migrations/<UTC-timestamp>_add_builder_onboarding_pref.sql`
- Modify: `supabase/functions/_backend/utils/postgres_schema.ts:139-151`

- [ ] **Step 1: Add the key to the union and interface**

In `org_email_notifications.ts`, add `builder_onboarding` right after `onboarding` in BOTH the `EmailPreferenceKey` union (~lines 65-78) and the `EmailPreferences` interface (~lines 80-94):

```ts
export type EmailPreferenceKey
  = | 'usage_limit'
    | 'credit_usage'
    | 'onboarding'
    | 'builder_onboarding'
    | 'weekly_stats'
    | 'monthly_stats'
    | 'billing_period_stats'
    | 'deploy_stats_24h'
    | 'bundle_created'
    | 'bundle_deployed'
    | 'device_error'
    | 'channel_self_rejected'
    | 'daily_fail_ratio'
    | 'cli_realtime_feed'

export interface EmailPreferences {
  usage_limit?: boolean
  credit_usage?: boolean
  onboarding?: boolean
  builder_onboarding?: boolean
  weekly_stats?: boolean
  monthly_stats?: boolean
  billing_period_stats?: boolean
  deploy_stats_24h?: boolean
  bundle_created?: boolean
  bundle_deployed?: boolean
  device_error?: boolean
  channel_self_rejected?: boolean
  daily_fail_ratio?: boolean
  cli_realtime_feed?: boolean
}
```

- [ ] **Step 2: Add the Bento exclusion tag**

In `user_preferences.ts`, add the entry to `EMAIL_PREF_DISABLED_TAGS` (~lines 13-27), after the `onboarding` line:

```ts
const EMAIL_PREF_DISABLED_TAGS: Record<EmailPreferenceKey, string> = {
  usage_limit: 'usage_limit_disabled',
  credit_usage: 'credit_usage_disabled',
  onboarding: 'onboarding_disabled',
  builder_onboarding: 'builder_onboarding_disabled',
  weekly_stats: 'weekly_stats_disabled',
  monthly_stats: 'monthly_stats_disabled',
  billing_period_stats: 'billing_period_stats_disabled',
  deploy_stats_24h: 'deploy_stats_24h_disabled',
  bundle_created: 'bundle_created_disabled',
  bundle_deployed: 'bundle_deployed_disabled',
  device_error: 'device_error_disabled',
  channel_self_rejected: 'channel_self_rejected_disabled',
  daily_fail_ratio: 'daily_fail_ratio_disabled',
  cli_realtime_feed: 'cli_realtime_feed_disabled',
}
```

(`EMAIL_PREF_DISABLED_TAGS` is typed `Record<EmailPreferenceKey, string>`, so omitting the new key would be a type error — this keeps it exhaustive.)

- [ ] **Step 3: Add the migration, then mirror the Drizzle default**

This repo manages the DB with hand-written SQL migrations — there is no drizzle-kit generation, and `postgres_schema.ts` only *mirrors* the DB for queries, so editing it alone does NOT change the database. Every prior preference key shipped a small migration (see `supabase/migrations/20260202090000_add_cli_realtime_feed_pref.sql`); follow that pattern.

Create `supabase/migrations/<UTC-timestamp>_add_builder_onboarding_pref.sql` (generate the timestamped name with `bunx supabase migration new add_builder_onboarding_pref`, or name it `YYYYMMDDHHMMSS_...` *after* the latest existing migration):

```sql
-- Add builder_onboarding preference for users and set default to true
-- (Builder native-build onboarding recovery — separate from the OTA 'onboarding' key)

-- Backfill existing users who already have email_preferences set
UPDATE public.users
SET email_preferences = email_preferences || '{"builder_onboarding": true}'::jsonb
WHERE email_preferences IS NOT NULL
  AND NOT (email_preferences ? 'builder_onboarding');

-- Update the column default to include the new key
ALTER TABLE public.users
ALTER COLUMN email_preferences SET DEFAULT '{
  "usage_limit": true,
  "credit_usage": true,
  "onboarding": true,
  "builder_onboarding": true,
  "weekly_stats": true,
  "monthly_stats": true,
  "billing_period_stats": true,
  "deploy_stats_24h": true,
  "bundle_created": true,
  "bundle_deployed": true,
  "device_error": true,
  "channel_self_rejected": true,
  "cli_realtime_feed": true
}'::jsonb;

COMMENT ON COLUMN public.users.email_preferences IS 'Per-user email notification preferences. Keys: usage_limit, credit_usage, onboarding, builder_onboarding, weekly_stats, monthly_stats, billing_period_stats, deploy_stats_24h, bundle_created, bundle_deployed, device_error, channel_self_rejected, cli_realtime_feed. Values are booleans.';
```

Then mirror it in `postgres_schema.ts` — add `builder_onboarding: true,` after `onboarding: true,` in the `users.email_preferences` `.default({...})` (~lines 139-151) so the Drizzle schema matches the DB.

> Notes: This migration is functionally **optional** — a missing JSONB key already reads as enabled (`prefValue === undefined ? true` in `getEligibleOrgMemberEmails` / `isOrgPreferenceEnabled`). It's included to match repo convention and keep the column default + comment current. The `orgs.email_preferences` column needs no change — org-level reads also treat a missing key as enabled (mirrors the `cli_realtime_feed` migration, which touched users only).

- [ ] **Step 4: Typecheck**

Run: `bun typecheck`
Expected: PASS. (Confirms the `Record<EmailPreferenceKey, string>` is still exhaustive and nothing else references the union exhaustively without the new key.)

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_backend/utils/org_email_notifications.ts \
        supabase/functions/_backend/utils/user_preferences.ts \
        supabase/migrations/*_add_builder_onboarding_pref.sql \
        supabase/functions/_backend/utils/postgres_schema.ts
git commit -m "feat(builder): add dedicated builder_onboarding email preference key"
```

---

### Task 2: Pure helper — decide the Bento payload

**Depends on:** Task 1 (uses `preferenceKey: 'builder_onboarding'`, which must exist in the `EmailPreferenceKey` union to typecheck).

**Files:**
- Create: `supabase/functions/_backend/utils/builder_onboarding_recovery.ts`
- Test: `tests/builder-onboarding-recovery.unit.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/builder-onboarding-recovery.unit.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { buildBuilderOnboardingBentoEvent, BUILDER_RECOVERY_MILESTONES } from '../supabase/functions/_backend/utils/builder_onboarding_recovery.ts'

const base = { orgId: 'org-1', appId: 'com.demo.app', platform: 'ios', orgName: 'Demo Org', appName: 'Demo' }

describe('buildBuilderOnboardingBentoEvent', () => {
  it('exposes the milestone steps that trigger a fetch', () => {
    expect(BUILDER_RECOVERY_MILESTONES.has('welcome')).toBe(true)
    expect(BUILDER_RECOVERY_MILESTONES.has('build-complete')).toBe(true)
    expect(BUILDER_RECOVERY_MILESTONES.has('verifying-key')).toBe(false)
  })

  it('returns a started payload on the welcome step', () => {
    const r = buildBuilderOnboardingBentoEvent({ event: 'Builder Onboarding Step', step: 'welcome', ...base })
    expect(r).toBeDefined()
    expect(r!.event).toBe('builder_onboarding_started')
    expect(r!.preferenceKey).toBe('builder_onboarding')
    expect(r!.cron).toBe('* * * * *')
    expect(r!.uniqId).toBe('builder_onboarding_started:com.demo.app:ios')
    expect(r!.data).toMatchObject({
      org_id: 'org-1', org_name: 'Demo Org', app_id: 'com.demo.app', app_name: 'Demo', platform: 'ios', step: 'welcome',
    })
  })

  it('returns a completed payload on build-complete', () => {
    const r = buildBuilderOnboardingBentoEvent({ event: 'Builder Onboarding Step', step: 'build-complete', ...base })
    expect(r!.event).toBe('builder_onboarding_completed')
    expect(r!.uniqId).toBe('builder_onboarding_completed:com.demo.app:ios')
  })

  it('returns undefined for non-milestone steps', () => {
    expect(buildBuilderOnboardingBentoEvent({ event: 'Builder Onboarding Step', step: 'verifying-key', ...base })).toBeUndefined()
  })

  it('returns undefined for other event names', () => {
    expect(buildBuilderOnboardingBentoEvent({ event: 'onboarding-step-done', step: 'welcome', ...base })).toBeUndefined()
  })

  it('returns undefined when org or app id is missing', () => {
    expect(buildBuilderOnboardingBentoEvent({ ...base, event: 'Builder Onboarding Step', step: 'welcome', orgId: undefined })).toBeUndefined()
    expect(buildBuilderOnboardingBentoEvent({ ...base, event: 'Builder Onboarding Step', step: 'welcome', appId: undefined })).toBeUndefined()
  })

  it('defaults platform to "unknown" when absent', () => {
    const r = buildBuilderOnboardingBentoEvent({ ...base, event: 'Builder Onboarding Step', step: 'welcome', platform: undefined })
    expect(r!.uniqId).toBe('builder_onboarding_started:com.demo.app:unknown')
    expect(r!.data.platform).toBe('unknown')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bunx vitest run tests/builder-onboarding-recovery.unit.test.ts`
Expected: FAIL — cannot resolve `../supabase/functions/_backend/utils/builder_onboarding_recovery.ts` (module does not exist yet).

- [ ] **Step 3: Write the minimal implementation**

Create `supabase/functions/_backend/utils/builder_onboarding_recovery.ts`:

```ts
import type { BentoTrackingPayload } from './tracking.ts'

/**
 * `capgo build init` wizard steps that mark the start / successful end of the
 * native-build credential setup. We emit a Bento signal event on each so a
 * later Bento automation can send a recovery email to people who started
 * (`welcome`) but never finished (`build-complete` suppresses the recovery).
 */
const MILESTONE_TO_BENTO_EVENT: Record<string, string> = {
  'welcome': 'builder_onboarding_started',
  'build-complete': 'builder_onboarding_completed',
}

/** Steps that should trigger the org/app lookup + Bento emit in the route. */
export const BUILDER_RECOVERY_MILESTONES: ReadonlySet<string> = new Set(Object.keys(MILESTONE_TO_BENTO_EVENT))

export interface BuilderOnboardingBentoInput {
  /** The incoming tracking event name (must be 'Builder Onboarding Step'). */
  event: string
  /** tags.step from the wizard. */
  step: string | undefined
  orgId: string | undefined
  appId: string | undefined
  /** tags.platform ('ios' | 'android'); defaults to 'unknown' when absent. */
  platform: string | undefined
  orgName: string | undefined
  appName: string | undefined
}

/**
 * Pure: decide whether this onboarding step should emit a Bento signal event,
 * and build its payload. Returns undefined when nothing should be emitted.
 * Personalization is intentionally minimal for now: app_name + platform.
 */
export function buildBuilderOnboardingBentoEvent(input: BuilderOnboardingBentoInput): BentoTrackingPayload | undefined {
  if (input.event !== 'Builder Onboarding Step')
    return undefined
  if (!input.step || !input.orgId || !input.appId)
    return undefined

  const bentoEvent = MILESTONE_TO_BENTO_EVENT[input.step]
  if (!bentoEvent)
    return undefined

  const platform = input.platform ?? 'unknown'

  return {
    // Mirrors the existing onboarding-step-done block: '* * * * *' lets the
    // notifications table + uniqId dedupe the signal without hard-blocking it.
    cron: '* * * * *',
    event: bentoEvent,
    // Dedicated key — independent from the OTA 'onboarding' preference.
    preferenceKey: 'builder_onboarding',
    // One signal per app+platform+phase, so repeated `welcome` hits within a
    // window collapse to a single "started" signal.
    uniqId: `${bentoEvent}:${input.appId}:${platform}`,
    data: {
      org_id: input.orgId,
      org_name: input.orgName ?? '',
      app_id: input.appId,
      app_name: input.appName ?? '',
      platform,
      step: input.step,
    },
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bunx vitest run tests/builder-onboarding-recovery.unit.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_backend/utils/builder_onboarding_recovery.ts tests/builder-onboarding-recovery.unit.test.ts
git commit -m "feat(builder): add onboarding recovery Bento payload helper"
```

---

### Task 3: Wire the helper into the events route

**Depends on:** Task 2.

**Files:**
- Modify: `supabase/functions/_backend/private/events.ts` (imports near top; the onboarding block at lines ~187–226)

- [ ] **Step 1: Add the import**

At the top of `events.ts`, alongside the other `../utils/*` imports (e.g., after the `sendEventToTracking` import on line 12), add:

```ts
import { buildBuilderOnboardingBentoEvent, BUILDER_RECOVERY_MILESTONES } from '../utils/builder_onboarding_recovery.ts'
```

(`BentoTrackingPayload` is already imported as a type on line 4 — no change needed.)

- [ ] **Step 2: Add the builder block and update the single sendEventToTracking call**

The current tail of the route handler (lines ~187–226) ends with the `onboardingBentoEvent` block followed by one `await sendEventToTracking(...)` and `return c.json(BRES)`. Insert the builder block **after** the `onboardingBentoEvent` block and **replace** the final `sendEventToTracking` call so it uses whichever payload applies:

```ts
  // Builder native-build onboarding (capgo build init): emit start/finish signal
  // events to Bento so a later automation can recover users who started but never
  // finished. Mirrors the onboarding-step-done block above. Only the milestone
  // steps trigger the org/app lookup.
  const builderStep = typeof body.tags?.step === 'string' ? body.tags.step : undefined
  const builderPlatform = typeof body.tags?.platform === 'string' ? body.tags.platform : undefined
  let builderBentoEvent: BentoTrackingPayload | undefined
  if (
    onboardingOrgId && appId
    && trackedBody.event === 'Builder Onboarding Step'
    && builderStep && BUILDER_RECOVERY_MILESTONES.has(builderStep)
  ) {
    const [orgResult, appResult] = await Promise.all([
      supabase.from('orgs').select('id, name').eq('id', onboardingOrgId).single(),
      supabase.from('apps').select('name').eq('app_id', appId).single(),
    ])
    if (orgResult.error || appResult.error) {
      // Best-effort recovery signal: never fail the wizard's request, and don't
      // emit a Bento event with empty org/app names. Log and skip instead.
      cloudlog({ requestId: c.get('requestId'), message: 'builder onboarding bento lookup failed; skipping signal', org: orgResult.error, app: appResult.error })
    }
    else {
      builderBentoEvent = buildBuilderOnboardingBentoEvent({
        event: trackedBody.event,
        step: builderStep,
        orgId: onboardingOrgId,
        appId,
        platform: builderPlatform,
        orgName: orgResult.data?.name ?? undefined,
        appName: appResult.data?.name ?? undefined,
      })
    }
  }

  const bentoEvent = onboardingBentoEvent ?? builderBentoEvent
  await sendEventToTracking(c, {
    ...trackedBody,
    bento: bentoEvent,
    sentToBento: Boolean(bentoEvent),
    groups: verifiedOrgId ? { organization: verifiedOrgId } : undefined,
  })

  return c.json(BRES)
```

Notes:
- `onboarding-step-done` and `Builder Onboarding Step` are different event names, so only one of the two payloads is ever set — `??` just picks the active one.
- Builder uses narrow `select`s and checks for lookup errors: if either fails it logs and skips emitting (best-effort signal — never throws); on success the helper defaults any missing name to `''`.
- The lookup only runs on the two milestone steps (the `BUILDER_RECOVERY_MILESTONES` guard), so non-milestone steps add no DB cost.

- [ ] **Step 3: Typecheck**

Run: `bun typecheck`
Expected: PASS (no type errors).

- [ ] **Step 4: Lint the backend**

Run: `bun lint:backend`
Expected: PASS (no new lint errors in `events.ts` / the new util).

- [ ] **Step 5: Run the helper tests + the existing tracking tests (regression)**

Run: `bunx vitest run tests/builder-onboarding-recovery.unit.test.ts tests/tracking.unit.test.ts`
Expected: PASS. The route glue is intentionally thin; its decision logic is fully covered by Task 2's pure tests, and the tracking-path regression confirms the `bento` payload still flows unchanged.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/_backend/private/events.ts
git commit -m "feat(builder): emit onboarding start/finish events to Bento from /private/events"
```

---

## Deferred: Bento automation + opt-out UI (NEXT phase — do NOT build now)

Once the backend above is live and the two events are confirmed arriving in Bento:

1. **Bento automation (Bento UI, no repo code):**
   - **Trigger:** subscriber fires `builder_onboarding_started`.
   - **Wait:** ~24h (tunable; chosen so users who merely paused — we've seen 3-day gaps — aren't pinged mid-setup).
   - **Branch / exit:** if the subscriber has since fired `builder_onboarding_completed`, exit (no email). Otherwise continue.
   - **Send:** one recovery email. Template can use the event `data`: `{{ app_name }}`, `{{ platform }}` ("Finish setting up native builds for {{ app_name }} on {{ platform }}"). Keep it short, helpful, with an unsubscribe.
   - **Guardrails:** single email; the `builder_onboarding` opt-out tag + Bento unsubscribe both suppress it; `uniqId` dedupes the signal.

2. **User-facing opt-out toggle (frontend):** add a `builder_onboarding` row to the two settings pages so users can toggle it in-app. Each page has its own local `EmailPreferences` interface + toggle rows:
   - `src/pages/settings/account/Notifications.vue` — add `builder_onboarding?: boolean` to the local interface and a toggle row mirroring the existing `weekly_stats` row (plus an i18n label key).
   - `src/pages/settings/organization/Notifications.vue` — same.
   The opt-out already *functions* without this (Bento honors `builder_onboarding_disabled` + unsubscribe); the toggle just makes it visible, so it ships alongside the emails.

Richer personalization (the exact stall step / failure reason) is a later enhancement — it needs per-step Bento field updates from the backend and is deliberately excluded from the minimal phase.

## Privacy & rollout safety

- **Payload is minimal & safe:** `org_id`, `org_name`, `app_id`, `app_name`, `platform`, `step` — no credentials, no raw error strings, no new PII. Consistent with the existing tracking posture.
- **Safe to ship before Bento work:** with no automation attached to `builder_onboarding_started` / `builder_onboarding_completed`, these events trigger nothing — zero emails until the deferred phase is intentionally built.
- **Guarded:** `isBentoConfigured(c)` already short-circuits the whole Bento path in CI/local, so tests and dev runs make no outbound calls.

## Self-review

- **Spec coverage:** dedicated `builder_onboarding` key → Task 1; Option B backend signal helper (opt-out-aware, deduped, minimal personalization) → Tasks 2–3; Bento automation + email + opt-out UI → explicitly deferred. ✓
- **Placeholders:** none — all code, tests, and commands are concrete. ✓
- **Type/name consistency:** `buildBuilderOnboardingBentoEvent` + `BUILDER_RECOVERY_MILESTONES` are defined in Task 2 and used identically in Task 3 and the tests; `preferenceKey: 'builder_onboarding'` matches the union added in Task 1; `BentoTrackingPayload` matches `utils/tracking.ts` (`cron`, `data`, `event`, `preferenceKey`, `uniqId`); `EMAIL_PREF_DISABLED_TAGS` stays exhaustive over `EmailPreferenceKey`. ✓
- **Scope:** single subsystem (one backend behavior + its preference key), shippable on its own. ✓
