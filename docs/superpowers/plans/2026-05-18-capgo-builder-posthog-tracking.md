# Capgo Builder onboarding + build PostHog tracking — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add PostHog (via existing `sendEventToTracking`) tracking for two event families in the Capgo Builder flow — per-step CLI onboarding events and server-side build lifecycle events — with closed-enum error categories and no PII leakage. The `capgo_builder` repo is **not** modified.

**Architecture:** CLI onboarding events route through the existing `/private/events` endpoint via the existing `sendEvent()` helper in `cli/src/utils.ts:1409`. Build lifecycle events fire entirely server-side from `public/build/request.ts` (Build Requested) and the existing `triggers/cron_reconcile_build_status.ts` (Build Started/Succeeded/Failed/Timed Out). All event emissions reuse the existing dual-writer (LogSnag + PostHog).

**Tech Stack:** TypeScript, Vitest, Hono (backend), Ink/React (CLI), `@logsnag/node` TrackOptions shape.

**Spec:** [docs/superpowers/specs/2026-05-18-capgo-builder-posthog-tracking-design.md](../specs/2026-05-18-capgo-builder-posthog-tracking-design.md)

**Worktree:** `capgo-builder-tracking-wt`, branch `feat/builder-tracking-posthog` (off `origin/main`).

---

## File map

| File | Action | Responsibility |
|---|---|---|
| `cli/src/build/onboarding/types.ts` | Modify | Export `OnboardingErrorCategory` union |
| `cli/src/build/onboarding/android/types.ts` | Modify | Export `AndroidOnboardingErrorCategory` union |
| `cli/src/build/onboarding/error-categories.ts` | Create | Pure mapper: caught error → category (iOS + Android) |
| `cli/src/build/onboarding/telemetry.ts` | Create | `trackBuilderOnboardingStep()` — wraps `sendEvent()` from utils, never throws |
| `cli/src/build/onboarding/ui/app.tsx` | Modify | Single `useEffect` on `[step]` to fire the event for iOS |
| `cli/src/build/onboarding/android/ui/app.tsx` | Modify | Same `useEffect` wiring for Android |
| `supabase/functions/_backend/utils/build_tracking.ts` | Create | Pure helpers: `classifyBuildTransition`, `mapBuildFailureCategory` |
| `supabase/functions/_backend/public/build/request.ts` | Modify | Fire `Build Requested` after insert |
| `supabase/functions/_backend/triggers/cron_reconcile_build_status.ts` | Modify | Capture previous status, fire transition events |
| `tests/onboarding-error-categories.unit.test.ts` | Create | Test the iOS + Android mappers |
| `tests/builder-onboarding-telemetry.unit.test.ts` | Create | Test the CLI helper's payload + opt-out behavior |
| `tests/build-tracking-helpers.unit.test.ts` | Create | Test `classifyBuildTransition` + `mapBuildFailureCategory` |

---

## Task 1: iOS error category union + mapper

**Files:**
- Modify: `cli/src/build/onboarding/types.ts`
- Create: `cli/src/build/onboarding/error-categories.ts`
- Create: `tests/onboarding-error-categories.unit.test.ts`

- [ ] **Step 1.1: Write the failing test for the iOS mapper**

Create `tests/onboarding-error-categories.unit.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { CertificateLimitError } from '../cli/src/build/onboarding/apple-api.ts'
import { mapIosOnboardingError } from '../cli/src/build/onboarding/error-categories.ts'

describe('mapIosOnboardingError', () => {
  it.concurrent('maps 401 from App Store Connect to apple_api_unauthorized', () => {
    const err = Object.assign(new Error('Unauthorized'), { status: 401 })
    expect(mapIosOnboardingError(err)).toBe('apple_api_unauthorized')
  })

  it.concurrent('maps 429 to apple_api_rate_limited', () => {
    const err = Object.assign(new Error('Too many'), { status: 429 })
    expect(mapIosOnboardingError(err)).toBe('apple_api_rate_limited')
  })

  it.concurrent('maps CertificateLimitError instances to cert_limit_reached', () => {
    expect(mapIosOnboardingError(new CertificateLimitError('limit'))).toBe('cert_limit_reached')
  })

  it.concurrent('maps profile creation failures to profile_creation_failed', () => {
    const err = Object.assign(new Error('Profile create failed'), { phase: 'profile' as const })
    expect(mapIosOnboardingError(err)).toBe('profile_creation_failed')
  })

  it.concurrent('maps P8 read errors to p8_invalid', () => {
    const err = Object.assign(new Error('Cannot parse P8'), { phase: 'p8' as const })
    expect(mapIosOnboardingError(err)).toBe('p8_invalid')
  })

  it.concurrent('returns unknown for anything else', () => {
    expect(mapIosOnboardingError(new Error('something else'))).toBe('unknown')
    expect(mapIosOnboardingError('a string')).toBe('unknown')
    expect(mapIosOnboardingError(undefined)).toBe('unknown')
  })
})
```

- [ ] **Step 1.2: Run the test, expect failure**

Run: `bun test tests/onboarding-error-categories.unit.test.ts`
Expected: FAIL — `Cannot find module '.../error-categories.ts'` or `mapIosOnboardingError is not a function`.

- [ ] **Step 1.3: Add the iOS error category union to `cli/src/build/onboarding/types.ts`**

Append to the existing file (after the `OnboardingStep` union):

```typescript
export type OnboardingErrorCategory
  = | 'apple_api_unauthorized'
    | 'apple_api_rate_limited'
    | 'cert_limit_reached'
    | 'profile_creation_failed'
    | 'p8_invalid'
    | 'unknown'
```

- [ ] **Step 1.4: Create the iOS mapper at `cli/src/build/onboarding/error-categories.ts`**

```typescript
import type { OnboardingErrorCategory } from './types.js'
import { CertificateLimitError } from './apple-api.js'

interface MaybeStatus {
  status?: unknown
}

interface MaybePhase {
  phase?: 'p8' | 'profile' | string
}

function getStatus(error: unknown): number | undefined {
  if (!error || typeof error !== 'object')
    return undefined
  const candidate = (error as MaybeStatus).status
  return typeof candidate === 'number' ? candidate : undefined
}

function getPhase(error: unknown): string | undefined {
  if (!error || typeof error !== 'object')
    return undefined
  const candidate = (error as MaybePhase).phase
  return typeof candidate === 'string' ? candidate : undefined
}

export function mapIosOnboardingError(error: unknown): OnboardingErrorCategory {
  if (error instanceof CertificateLimitError)
    return 'cert_limit_reached'

  const status = getStatus(error)
  if (status === 401)
    return 'apple_api_unauthorized'
  if (status === 429)
    return 'apple_api_rate_limited'

  const phase = getPhase(error)
  if (phase === 'profile')
    return 'profile_creation_failed'
  if (phase === 'p8')
    return 'p8_invalid'

  return 'unknown'
}
```

- [ ] **Step 1.5: Run the test, expect PASS**

Run: `bun test tests/onboarding-error-categories.unit.test.ts`
Expected: PASS, 6 iOS test cases green.

- [ ] **Step 1.6: Commit**

```bash
git add cli/src/build/onboarding/types.ts cli/src/build/onboarding/error-categories.ts tests/onboarding-error-categories.unit.test.ts
git commit -m "feat(cli): add iOS onboarding error category mapper"
```

---

## Task 2: Android error category union + mapper

**Files:**
- Modify: `cli/src/build/onboarding/android/types.ts`
- Modify: `cli/src/build/onboarding/error-categories.ts` (add Android mapper)
- Modify: `tests/onboarding-error-categories.unit.test.ts` (add Android cases)

- [ ] **Step 2.1: Add failing Android tests to the existing test file**

Append to `tests/onboarding-error-categories.unit.test.ts`:

```typescript
import { mapAndroidOnboardingError } from '../cli/src/build/onboarding/error-categories.ts'

describe('mapAndroidOnboardingError', () => {
  it.concurrent('maps MissingScopesError to google_oauth_failed', () => {
    class MissingScopesError extends Error {}
    expect(mapAndroidOnboardingError(new MissingScopesError('missing'))).toBe('google_oauth_failed')
  })

  it.concurrent('maps keystore parse failures to keystore_invalid', () => {
    const err = Object.assign(new Error('Bad keystore'), { phase: 'keystore' as const })
    expect(mapAndroidOnboardingError(err)).toBe('keystore_invalid')
  })

  it.concurrent('maps oauth token failures to google_oauth_failed', () => {
    const err = Object.assign(new Error('Token refresh failed'), { phase: 'oauth' as const })
    expect(mapAndroidOnboardingError(err)).toBe('google_oauth_failed')
  })

  it.concurrent('maps play account id failures to play_account_id_invalid', () => {
    const err = Object.assign(new Error('Bad ID'), { phase: 'play_account_id' as const })
    expect(mapAndroidOnboardingError(err)).toBe('play_account_id_invalid')
  })

  it.concurrent('returns unknown for everything else', () => {
    expect(mapAndroidOnboardingError(new Error('???'))).toBe('unknown')
    expect(mapAndroidOnboardingError(null)).toBe('unknown')
  })
})
```

- [ ] **Step 2.2: Run, expect failure**

Run: `bun test tests/onboarding-error-categories.unit.test.ts`
Expected: FAIL — `mapAndroidOnboardingError is not exported`.

- [ ] **Step 2.3: Add the Android union to `cli/src/build/onboarding/android/types.ts`**

Append (after `AndroidOnboardingStep`):

```typescript
export type AndroidOnboardingErrorCategory
  = | 'keystore_invalid'
    | 'google_oauth_failed'
    | 'play_account_id_invalid'
    | 'unknown'
```

- [ ] **Step 2.4: Append the Android mapper to `cli/src/build/onboarding/error-categories.ts`**

```typescript
import type { AndroidOnboardingErrorCategory } from './android/types.js'
import { MissingScopesError } from './android/google-oauth.js'

export function mapAndroidOnboardingError(error: unknown): AndroidOnboardingErrorCategory {
  if (error instanceof MissingScopesError)
    return 'google_oauth_failed'

  const phase = getPhase(error)
  if (phase === 'keystore')
    return 'keystore_invalid'
  if (phase === 'oauth')
    return 'google_oauth_failed'
  if (phase === 'play_account_id')
    return 'play_account_id_invalid'

  return 'unknown'
}
```

Note: confirm the actual import path of `MissingScopesError` by grepping the Android tree:

```bash
grep -rn "export class MissingScopesError\|export.*MissingScopesError" cli/src/build/onboarding/android/
```

If the path differs from `./android/google-oauth.js`, update the import to match. If `MissingScopesError` does not exist as an exported class, drop the `instanceof` branch — the `phase === 'oauth'` branch already covers it, and the test for `MissingScopesError` can be dropped or rewritten against the real export.

- [ ] **Step 2.5: Run all tests in the file, expect PASS**

Run: `bun test tests/onboarding-error-categories.unit.test.ts`
Expected: PASS, both iOS and Android suites green.

- [ ] **Step 2.6: Commit**

```bash
git add cli/src/build/onboarding/android/types.ts cli/src/build/onboarding/error-categories.ts tests/onboarding-error-categories.unit.test.ts
git commit -m "feat(cli): add Android onboarding error category mapper"
```

---

## Task 3: CLI telemetry helper

**Files:**
- Create: `cli/src/build/onboarding/telemetry.ts`
- Create: `tests/builder-onboarding-telemetry.unit.test.ts`

- [ ] **Step 3.1: Write the failing test for the telemetry helper**

Create `tests/builder-onboarding-telemetry.unit.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const sendEventMock = vi.hoisted(() => vi.fn())

vi.mock('../cli/src/utils.ts', () => ({
  sendEvent: sendEventMock,
}))

import { trackBuilderOnboardingStep } from '../cli/src/build/onboarding/telemetry.ts'

describe('trackBuilderOnboardingStep', () => {
  beforeEach(() => {
    sendEventMock.mockReset()
    sendEventMock.mockResolvedValue(undefined)
    delete process.env.CAPGO_DISABLE_TELEMETRY
    delete process.env.CAPGO_DISABLE_POSTHOG
  })

  afterEach(() => {
    delete process.env.CAPGO_DISABLE_TELEMETRY
    delete process.env.CAPGO_DISABLE_POSTHOG
  })

  it('builds the expected payload and calls sendEvent once', async () => {
    await trackBuilderOnboardingStep({
      apikey: 'cap_test_key',
      step: 'api-key-instructions',
      platform: 'ios',
      appId: 'com.example.app',
      orgId: 'org-uuid-1',
      durationMs: 1234,
    })

    expect(sendEventMock).toHaveBeenCalledTimes(1)
    const [calledKey, payload] = sendEventMock.mock.calls[0]
    expect(calledKey).toBe('cap_test_key')
    expect(payload).toMatchObject({
      event: 'Builder Onboarding Step',
      channel: 'builder-onboarding',
      icon: '🧭',
      notify: false,
      user_id: 'org-uuid-1',
      tags: {
        step: 'api-key-instructions',
        platform: 'ios',
        app_id: 'com.example.app',
        duration_ms: '1234',
      },
    })
    expect(payload.tags.error_category).toBeUndefined()
  })

  it('includes error_category only when an error is provided', async () => {
    await trackBuilderOnboardingStep({
      apikey: 'cap_test_key',
      step: 'error',
      platform: 'ios',
      appId: 'com.example.app',
      orgId: 'org-uuid-1',
      error: Object.assign(new Error('Unauthorized'), { status: 401 }),
    })

    const [, payload] = sendEventMock.mock.calls[0]
    expect(payload.tags.error_category).toBe('apple_api_unauthorized')
  })

  it('uses the Android mapper when platform is android', async () => {
    await trackBuilderOnboardingStep({
      apikey: 'cap_test_key',
      step: 'error',
      platform: 'android',
      appId: 'com.example.app',
      orgId: 'org-uuid-1',
      error: Object.assign(new Error('Bad keystore'), { phase: 'keystore' }),
    })

    const [, payload] = sendEventMock.mock.calls[0]
    expect(payload.tags.error_category).toBe('keystore_invalid')
  })

  it('skips when CAPGO_DISABLE_TELEMETRY is set', async () => {
    process.env.CAPGO_DISABLE_TELEMETRY = '1'
    await trackBuilderOnboardingStep({
      apikey: 'cap_test_key',
      step: 'welcome',
      platform: 'ios',
      appId: 'com.example.app',
      orgId: 'org-uuid-1',
    })
    expect(sendEventMock).not.toHaveBeenCalled()
  })

  it('skips when CAPGO_DISABLE_POSTHOG is set', async () => {
    process.env.CAPGO_DISABLE_POSTHOG = 'true'
    await trackBuilderOnboardingStep({
      apikey: 'cap_test_key',
      step: 'welcome',
      platform: 'ios',
      appId: 'com.example.app',
      orgId: 'org-uuid-1',
    })
    expect(sendEventMock).not.toHaveBeenCalled()
  })

  it('swallows errors thrown by sendEvent', async () => {
    sendEventMock.mockRejectedValueOnce(new Error('network down'))
    await expect(trackBuilderOnboardingStep({
      apikey: 'cap_test_key',
      step: 'welcome',
      platform: 'ios',
      appId: 'com.example.app',
      orgId: 'org-uuid-1',
    })).resolves.toBeUndefined()
  })

  it('does not include duration_ms when undefined', async () => {
    await trackBuilderOnboardingStep({
      apikey: 'cap_test_key',
      step: 'welcome',
      platform: 'ios',
      appId: 'com.example.app',
      orgId: 'org-uuid-1',
    })

    const [, payload] = sendEventMock.mock.calls[0]
    expect(payload.tags.duration_ms).toBeUndefined()
  })
})
```

- [ ] **Step 3.2: Run the test, expect failure**

Run: `bun test tests/builder-onboarding-telemetry.unit.test.ts`
Expected: FAIL — module not found / `trackBuilderOnboardingStep is not a function`.

- [ ] **Step 3.3: Create `cli/src/build/onboarding/telemetry.ts`**

```typescript
import type { AndroidOnboardingStep } from './android/types.js'
import type { OnboardingStep } from './types.js'
import process from 'node:process'
import { sendEvent } from '../../utils.js'
import { mapAndroidOnboardingError, mapIosOnboardingError } from './error-categories.js'

type BuilderPlatform = 'ios' | 'android'

export interface TrackBuilderOnboardingStepInput {
  apikey: string
  appId: string
  orgId: string
  platform: BuilderPlatform
  step: OnboardingStep | AndroidOnboardingStep
  durationMs?: number
  error?: unknown
}

function isTruthyEnv(value: string | undefined): boolean {
  return value === '1' || value?.toLowerCase() === 'true' || value?.toLowerCase() === 'yes'
}

function telemetryDisabled(): boolean {
  return isTruthyEnv(process.env.CAPGO_DISABLE_TELEMETRY)
    || isTruthyEnv(process.env.CAPGO_DISABLE_POSTHOG)
}

export async function trackBuilderOnboardingStep(input: TrackBuilderOnboardingStepInput): Promise<void> {
  if (telemetryDisabled())
    return

  const tags: Record<string, string> = {
    step: input.step,
    platform: input.platform,
    app_id: input.appId,
  }

  if (typeof input.durationMs === 'number' && Number.isFinite(input.durationMs))
    tags.duration_ms = String(Math.round(input.durationMs))

  if (input.error !== undefined) {
    tags.error_category = input.platform === 'ios'
      ? mapIosOnboardingError(input.error)
      : mapAndroidOnboardingError(input.error)
  }

  try {
    await sendEvent(input.apikey, {
      event: 'Builder Onboarding Step',
      channel: 'builder-onboarding',
      icon: '🧭',
      notify: false,
      user_id: input.orgId,
      tags,
    })
  }
  catch {
    // Telemetry must never break the wizard. sendEvent already swallows
    // fetch failures internally; this catch covers anything else.
  }
}
```

- [ ] **Step 3.4: Run the test, expect PASS**

Run: `bun test tests/builder-onboarding-telemetry.unit.test.ts`
Expected: PASS, 7 cases green.

- [ ] **Step 3.5: Commit**

```bash
git add cli/src/build/onboarding/telemetry.ts tests/builder-onboarding-telemetry.unit.test.ts
git commit -m "feat(cli): add builder onboarding telemetry helper"
```

---

## Task 4: Wire iOS useEffect

**Files:**
- Modify: `cli/src/build/onboarding/ui/app.tsx`

No new test — this is React glue. Integration is exercised indirectly by the helper test above and by typecheck.

- [ ] **Step 4.1: Resolve the org id source for iOS**

Read `cli/src/build/onboarding/ui/app.tsx` and check how `apikey` is resolved (look around line 87 for the `OnboardingApp` component signature). The org id is needed for the `user_id` field on the event.

Search the file for an existing call that uses the API key to get the org id:

```bash
grep -nE "isAllowedAppOrg|owner_org|getOrgIdFor|verifyApiKey" cli/src/build/onboarding/ui/app.tsx cli/src/build/credentials*.ts
```

If `isAllowedAppOrg` (from `cli/src/utils.ts`) is already invoked in the onboarding flow, reuse the org id from that call. If not, call it once during a `useEffect(() => { ... }, [])` initialization and store the resolved org id in state.

- [ ] **Step 4.2: Add telemetry imports and a step-tracking useEffect to `cli/src/build/onboarding/ui/app.tsx`**

Add the import (next to the existing onboarding imports):

```typescript
import { trackBuilderOnboardingStep } from '../telemetry.js'
```

Inside the `OnboardingApp` component, just after the `step` useState declaration (around line 91), add:

```tsx
const stepTimingRef = useRef<{ step: OnboardingStep, startedAt: number }>({
  step,
  startedAt: Date.now(),
})

const [resolvedOrgId, setResolvedOrgId] = useState<string | null>(null)
const resolvedApiKeyRef = useRef<string | null>(apikey ?? null)

useEffect(() => {
  if (resolvedApiKeyRef.current)
    return
  void (async () => {
    const saved = await findSavedKeySilent().catch(() => null)
    if (saved)
      resolvedApiKeyRef.current = saved
  })()
}, [])

useEffect(() => {
  void (async () => {
    if (!resolvedApiKeyRef.current || resolvedOrgId)
      return
    const supabase = await createSupabaseClient(resolvedApiKeyRef.current, undefined, undefined, true)
      .catch(() => null)
    if (!supabase)
      return
    const perm = await isAllowedAppOrg(supabase, resolvedApiKeyRef.current, appId)
    if (perm.okay)
      setResolvedOrgId(perm.data.org_id)
  })()
}, [appId, resolvedOrgId])

useEffect(() => {
  if (!resolvedApiKeyRef.current || !resolvedOrgId)
    return

  const previous = stepTimingRef.current
  const now = Date.now()
  const durationMs = previous.step === step ? undefined : now - previous.startedAt

  void trackBuilderOnboardingStep({
    apikey: resolvedApiKeyRef.current,
    appId,
    orgId: resolvedOrgId,
    platform: 'ios',
    step,
    durationMs,
    errorCategory: step === 'error' ? errorCategoryRef.current : undefined,
  })

  stepTimingRef.current = { step, startedAt: now }
}, [step, appId, resolvedOrgId, error])
```

> The wizard stores only `err.message` (string) in React state, which loses `.status` / `.phase` / `instanceof` discriminators that `mapIosOnboardingError` needs. Capture the mapped category at `handleError` time via a `errorCategoryRef = useRef<OnboardingErrorCategory>()`, set it to `mapIosOnboardingError(err)` before the existing `setError(message)`, clear it on `setError(null)` retry sites, and read it here. The telemetry helper takes the pre-computed `errorCategory` field directly — no `new Error(string)` reconstruction.

If `createSupabaseClient` and `isAllowedAppOrg` aren't already imported in this file, add them:

```typescript
import { createSupabaseClient, findSavedKeySilent, isAllowedAppOrg } from '../../../utils.js'
```

(Check `findSavedKeySilent` import line at the top of the existing file; it may already be imported as `findSavedKeySilent` — keep one import.)

- [ ] **Step 4.3: Run the CLI typecheck**

Run: `bun run cli:check`
Expected: typecheck passes. If `error` from `mapIosOnboardingError` expects a richer object than a plain `Error`, adjust the wrapper to pass the original caught error from the wizard state instead of `new Error(error)`. Look for the existing `setError(...)` call sites in `app.tsx` — if any pass an `Error` instance via a separate state field (e.g., `lastError`), use that instead.

- [ ] **Step 4.4: Smoke-run the wizard once**

Run (from a project with `ios/` directory):

```bash
bun run cli:build
node dist/index.js build init --platform=ios
```

Walk through one step (welcome → api-key-instructions), then Ctrl+C. Verify in the LogSnag / PostHog dashboard that at least two `Builder Onboarding Step` events arrived.

If the dashboards aren't accessible during dev, instead set `DEBUG=1` and add a one-line `console.error(JSON.stringify(payload))` inside `sendEvent` temporarily (revert before commit) to confirm the payload shape.

- [ ] **Step 4.5: Commit**

```bash
git add cli/src/build/onboarding/ui/app.tsx
git commit -m "feat(cli): emit per-step telemetry from iOS onboarding wizard"
```

---

## Task 5: Wire Android useEffect

**Files:**
- Modify: `cli/src/build/onboarding/android/ui/app.tsx`

- [ ] **Step 5.1: Add telemetry imports**

Open `cli/src/build/onboarding/android/ui/app.tsx`. Add the telemetry import next to the existing onboarding imports:

```typescript
import { trackBuilderOnboardingStep } from '../../telemetry.js'
```

The Android file currently imports `findSavedKey` (not `findSavedKeySilent`). Add `createSupabaseClient` and `isAllowedAppOrg` to that import line (or add a separate import) — the path is `../../../../utils.js` (one extra `..` versus the iOS file because of the deeper Android subdirectory):

```typescript
import { createSupabaseClient, findSavedKey, isAllowedAppOrg } from '../../../../utils.js'
```

- [ ] **Step 5.2: Add the step-tracking useEffect block to `AndroidOnboardingApp`**

Inside the `AndroidOnboardingApp` component, just after the `step` useState declaration (around line 117 — the file has `const [step, setStep] = useState<AndroidOnboardingStep>(...)`), insert:

```tsx
const stepTimingRef = useRef<{ step: AndroidOnboardingStep, startedAt: number }>({
  step,
  startedAt: Date.now(),
})

const [resolvedOrgId, setResolvedOrgId] = useState<string | null>(null)
const resolvedApiKeyRef = useRef<string | null>(apikey ?? null)

useEffect(() => {
  if (resolvedApiKeyRef.current)
    return
  void (async () => {
    const saved = await findSavedKey().catch(() => null)
    if (saved)
      resolvedApiKeyRef.current = saved
  })()
}, [])

useEffect(() => {
  void (async () => {
    if (!resolvedApiKeyRef.current || resolvedOrgId)
      return
    const supabase = await createSupabaseClient(resolvedApiKeyRef.current, undefined, undefined, true)
      .catch(() => null)
    if (!supabase)
      return
    const perm = await isAllowedAppOrg(supabase, resolvedApiKeyRef.current, appId)
    if (perm.okay)
      setResolvedOrgId(perm.data.org_id)
  })()
}, [appId, resolvedOrgId])

useEffect(() => {
  if (!resolvedApiKeyRef.current || !resolvedOrgId)
    return

  const previous = stepTimingRef.current
  const now = Date.now()
  const durationMs = previous.step === step ? undefined : now - previous.startedAt

  void trackBuilderOnboardingStep({
    apikey: resolvedApiKeyRef.current,
    appId,
    orgId: resolvedOrgId,
    platform: 'android',
    step,
    durationMs,
    errorCategory: step === 'error' ? errorCategoryRef.current : undefined,
  })

  stepTimingRef.current = { step, startedAt: now }
}, [step, appId, resolvedOrgId, error])
```

The structural difference from the iOS wiring (Task 4) is exactly two things:
1. `stepTimingRef` is typed `useRef<{ step: AndroidOnboardingStep, startedAt: number }>` (vs `OnboardingStep` for iOS).
2. `platform: 'android'` (vs `'ios'`).

If the Android app exposes the last caught error via a state variable named something other than `error`, swap the variable name in the `error: step === 'error' && error ? ...` expression. Confirm via:

```bash
grep -nE "useState.*null.*error|setError\(" cli/src/build/onboarding/android/ui/app.tsx | head -5
```

- [ ] **Step 5.3: Run the CLI typecheck**

Run: `bun run cli:check`
Expected: typecheck passes for both platforms.

- [ ] **Step 5.4: Commit**

```bash
git add cli/src/build/onboarding/android/ui/app.tsx
git commit -m "feat(cli): emit per-step telemetry from Android onboarding wizard"
```

---

## Task 6: Build transition + failure-category helpers

**Files:**
- Create: `supabase/functions/_backend/utils/build_tracking.ts`
- Create: `tests/build-tracking-helpers.unit.test.ts`

- [ ] **Step 6.1: Write the failing test**

Create `tests/build-tracking-helpers.unit.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { classifyBuildTransition, mapBuildFailureCategory } from '../supabase/functions/_backend/utils/build_tracking.ts'

describe('classifyBuildTransition', () => {
  it.concurrent('returns "started" when pending becomes running', () => {
    expect(classifyBuildTransition({ previous: 'pending', next: 'running', timeoutApplied: false })).toBe('started')
  })

  it.concurrent('returns "started" when queued becomes running', () => {
    expect(classifyBuildTransition({ previous: 'queued', next: 'running', timeoutApplied: false })).toBe('started')
  })

  it.concurrent('returns "succeeded" when any non-terminal becomes success', () => {
    expect(classifyBuildTransition({ previous: 'running', next: 'success', timeoutApplied: false })).toBe('succeeded')
    expect(classifyBuildTransition({ previous: 'pending', next: 'success', timeoutApplied: false })).toBe('succeeded')
  })

  it.concurrent('returns "failed" when any non-terminal becomes failed', () => {
    expect(classifyBuildTransition({ previous: 'running', next: 'failed', timeoutApplied: false })).toBe('failed')
  })

  it.concurrent('returns "timed_out" when timeoutApplied is true', () => {
    expect(classifyBuildTransition({ previous: 'running', next: 'failed', timeoutApplied: true })).toBe('timed_out')
    expect(classifyBuildTransition({ previous: 'running', next: 'success', timeoutApplied: true })).toBe('timed_out')
  })

  it.concurrent('returns null when previous status is already terminal (idempotency)', () => {
    expect(classifyBuildTransition({ previous: 'success', next: 'success', timeoutApplied: false })).toBeNull()
    expect(classifyBuildTransition({ previous: 'failed', next: 'failed', timeoutApplied: false })).toBeNull()
  })

  it.concurrent('returns null when no state change happened (no transition)', () => {
    expect(classifyBuildTransition({ previous: 'pending', next: 'pending', timeoutApplied: false })).toBeNull()
    expect(classifyBuildTransition({ previous: 'running', next: 'running', timeoutApplied: false })).toBeNull()
  })
})

describe('mapBuildFailureCategory', () => {
  it.concurrent('returns timeout when the timeout flag is set', () => {
    expect(mapBuildFailureCategory({ timeoutApplied: true, errorMessage: null })).toBe('timeout')
  })

  it.concurrent('returns validation_error for validation-style messages', () => {
    expect(mapBuildFailureCategory({ timeoutApplied: false, errorMessage: 'Invalid build_mode value' })).toBe('validation_error')
    expect(mapBuildFailureCategory({ timeoutApplied: false, errorMessage: 'missing credentials' })).toBe('validation_error')
  })

  it.concurrent('returns builder_error when there is any other non-empty error', () => {
    expect(mapBuildFailureCategory({ timeoutApplied: false, errorMessage: 'gradle compile failed' })).toBe('builder_error')
  })

  it.concurrent('returns unknown when timeoutApplied is false and error is empty', () => {
    expect(mapBuildFailureCategory({ timeoutApplied: false, errorMessage: null })).toBe('unknown')
    expect(mapBuildFailureCategory({ timeoutApplied: false, errorMessage: '' })).toBe('unknown')
  })
})
```

- [ ] **Step 6.2: Run, expect failure**

Run: `bun test tests/build-tracking-helpers.unit.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 6.3: Create `supabase/functions/_backend/utils/build_tracking.ts`**

```typescript
export type BuildTransition = 'started' | 'succeeded' | 'failed' | 'timed_out'
export type BuildFailureCategory = 'timeout' | 'builder_error' | 'validation_error' | 'unknown'

const TERMINAL_STATUSES = new Set(['success', 'failed', 'timed_out', 'cancelled', 'expired'])

const VALIDATION_HINTS = ['invalid build_mode', 'missing credential', 'validation']

interface ClassifyInput {
  previous: string
  next: string
  timeoutApplied: boolean
}

export function classifyBuildTransition(input: ClassifyInput): BuildTransition | null {
  if (TERMINAL_STATUSES.has(input.previous))
    return null

  if (input.previous === input.next)
    return null

  if (input.timeoutApplied)
    return 'timed_out'

  if (input.next === 'running')
    return 'started'

  if (input.next === 'success')
    return 'succeeded'

  if (input.next === 'failed')
    return 'failed'

  return null
}

interface FailureInput {
  timeoutApplied: boolean
  errorMessage: string | null | undefined
}

export function mapBuildFailureCategory(input: FailureInput): BuildFailureCategory {
  if (input.timeoutApplied)
    return 'timeout'

  const message = (input.errorMessage ?? '').toLowerCase()
  if (!message)
    return 'unknown'

  for (const hint of VALIDATION_HINTS) {
    if (message.includes(hint))
      return 'validation_error'
  }

  return 'builder_error'
}
```

- [ ] **Step 6.4: Run, expect PASS**

Run: `bun test tests/build-tracking-helpers.unit.test.ts`
Expected: PASS, all cases green.

- [ ] **Step 6.5: Commit**

```bash
git add supabase/functions/_backend/utils/build_tracking.ts tests/build-tracking-helpers.unit.test.ts
git commit -m "feat(backend): add build transition + failure category helpers"
```

---

## Task 7: Emit Build Requested

**Files:**
- Modify: `supabase/functions/_backend/public/build/request.ts`

- [ ] **Step 7.1: Read the surrounding context in `request.ts`**

Open `supabase/functions/_backend/public/build/request.ts` and re-confirm lines 286–325. The `Build job created` cloudlog is at line 307; the success `c.json` return is at line 316.

- [ ] **Step 7.2: Add the import**

At the top of the file, in the same import group as the existing tracking-related imports:

```typescript
import { sendEventToTracking } from '../../utils/tracking.ts'
import { backgroundTask } from '../../utils/utils.ts'
```

(Skip whichever is already imported. Grep first: `grep -n "sendEventToTracking\|backgroundTask" supabase/functions/_backend/public/build/request.ts`.)

- [ ] **Step 7.3: Emit `Build Requested` between the cloudlog and the response**

Insert after line 314 (after the existing `cloudlog` block, before `return c.json(...)`):

```typescript
await backgroundTask(c, sendEventToTracking(c, {
  event: 'Build Requested',
  channel: 'build-lifecycle',
  icon: '🛠️',
  notify: false,
  user_id: org_id,
  groups: { organization: org_id },
  tags: {
    app_id,
    platform,
    build_mode,
  },
}))
```

The local variables `org_id`, `app_id`, `platform`, and `build_mode` are already in scope in this handler — verify by grepping the surrounding ~50 lines.

- [ ] **Step 7.4: Typecheck**

Run: `bun run cli:check` (this typechecks the whole monorepo TS surface) — or for just the backend: `bun test:backend tests/builder-payload.unit.test.ts` to confirm the request.ts module still imports cleanly.

- [ ] **Step 7.5: Commit**

```bash
git add supabase/functions/_backend/public/build/request.ts
git commit -m "feat(backend): emit Build Requested event after build row insert"
```

---

## Task 8: Emit transition events from the reconciliation cron

**Files:**
- Modify: `supabase/functions/_backend/triggers/cron_reconcile_build_status.ts`

- [ ] **Step 8.1: Find the precise update site**

Open the file and look at lines 200–247 (the block that calculates `effectiveStatus`, `effectiveBuildTimeSeconds`, then calls `supabase.from('build_requests').update(...)`).

- [ ] **Step 8.2: Add imports**

Add at the top:

```typescript
import { sendEventToTracking } from '../utils/tracking.ts'
import { classifyBuildTransition, mapBuildFailureCategory } from '../utils/build_tracking.ts'
```

`backgroundTask` is likely already imported — check first.

- [ ] **Step 8.3: Capture the previous status and fire the transition event**

Inside the per-build loop, after `effectiveStatus` is computed (around line 200) and BEFORE the `.update(...)` call (line 212), capture:

```typescript
const previousStatus = build.status
```

After the existing update succeeds (line 222, just past `throw new Error(updateError.message)` guard), and after the existing `recordBuildTime` block (line 246), add:

```typescript
const transition = classifyBuildTransition({
  previous: previousStatus,
  next: effectiveStatus,
  timeoutApplied,
})

if (transition) {
  const eventNameByTransition: Record<typeof transition, string> = {
    started: 'Build Started',
    succeeded: 'Build Succeeded',
    failed: 'Build Failed',
    timed_out: 'Build Timed Out',
  }
  const iconByTransition: Record<typeof transition, string> = {
    started: '⏳',
    succeeded: '✅',
    failed: '❌',
    timed_out: '⏰',
  }

  const tags: Record<string, string> = {
    app_id: build.app_id,
    platform: build.platform,
    build_mode: build.build_mode,
  }
  if (effectiveBuildTimeSeconds !== null && (transition === 'succeeded' || transition === 'failed' || transition === 'timed_out'))
    tags.duration_seconds = String(effectiveBuildTimeSeconds)
  if (transition === 'failed' || transition === 'timed_out')
    tags.failure_category = mapBuildFailureCategory({ timeoutApplied, errorMessage: effectiveError })

  await backgroundTask(c, sendEventToTracking(c, {
    event: eventNameByTransition[transition],
    channel: 'build-lifecycle',
    icon: iconByTransition[transition],
    notify: false,
    user_id: build.owner_org,
    groups: { organization: build.owner_org },
    tags,
  }))
}
```

The `eventNameByTransition` / `iconByTransition` literal-typed records take the union type and exhaustively cover it — if a new transition is added later, TypeScript will flag the missing key.

Note: the local variables `build.app_id`, `build.platform`, `build.build_mode`, `build.owner_org` come from the `build_requests` row — confirm via the schema or the existing `.update(...)` call site that all four columns are selected by the outer query. If `build_mode` is not in the SELECT, add it (look for the `select(...)` call earlier in this file).

- [ ] **Step 8.4: Typecheck**

Run: `bun run cli:check`
Expected: passes.

- [ ] **Step 8.5: Smoke-run the unit helper test again**

Run: `bun test tests/build-tracking-helpers.unit.test.ts`
Expected: still green (no regression).

- [ ] **Step 8.6: Commit**

```bash
git add supabase/functions/_backend/triggers/cron_reconcile_build_status.ts
git commit -m "feat(backend): emit build lifecycle events on status transitions"
```

---

## Task 9: Final verification

- [ ] **Step 9.1: Run the CLI workspace check (lint + typecheck + build + test)**

Run: `bun run cli:check`
Expected: all green. If lint fails, fix style issues. If typecheck fails, fix the type errors before continuing.

- [ ] **Step 9.2: Run the full backend test suite**

Run: `bun test:backend`
Expected: no regressions. Existing tests for `events.ts`, `tracking`, `request.ts`, and `cron_reconcile_build_status` should all still pass.

- [ ] **Step 9.3: Run the full test:all to be safe**

Run: `bun test:all`
Expected: no regressions across the monorepo.

- [ ] **Step 9.4: Smoke-fire one of each event end-to-end (manual)**

If a staging environment is available:
1. Trigger `npx @capgo/cli build init --platform=ios` against staging and walk through the first 2–3 steps.
2. Trigger a real build via `npx @capgo/cli build request` against staging.
3. Watch PostHog for events with `event = 'Builder Onboarding Step'`, `'Build Requested'`, and (after build completes) `'Build Succeeded'` or `'Build Failed'`.

If no staging is available, mark this step as deferred and note the verification will happen post-merge via production traffic.

---

## Task 10: Open the PR

- [ ] **Step 10.1: Push the branch**

Run:

```bash
git push -u origin feat/builder-tracking-posthog
```

- [ ] **Step 10.2: Verify git log is clean**

Run: `git log --oneline origin/main..HEAD`
Expected: 7 commits (one per implementation task) plus the 2 spec commits = 9 total. If commits look messy, rebase interactively to consolidate.

- [ ] **Step 10.3: Open the PR with `gh`**

```bash
gh pr create --title "feat: PostHog tracking for Capgo Builder onboarding + build lifecycle" --body "$(cat <<'EOF'
## Summary
- Adds per-step PostHog tracking for the iOS/Android Builder onboarding wizard (routed through the existing `/private/events` endpoint via `sendEvent()`).
- Adds server-side `Build Requested` / `Build Started` / `Build Succeeded` / `Build Failed` / `Build Timed Out` events on the existing build pipeline.
- Closed-enum `error_category` / `failure_category` — no raw error strings leak to PostHog.
- Does NOT touch the `capgo_builder` repo; `Build Started` is derived from the existing reconciliation cron diff.

## Test plan
- [ ] `bun run cli:check` passes
- [ ] `bun test:all` passes
- [ ] Manual: walk through `build init --platform=ios` two steps; confirm `Builder Onboarding Step` events appear in PostHog
- [ ] Manual: trigger one cloud build; confirm `Build Requested` → `Build Started` → `Build Succeeded`/`Build Failed` arrive in PostHog
- [ ] Confirm no events contain raw error strings, file paths, or credential fragments
EOF
)"
```

Print the PR URL.

---

## Self-review notes (already addressed during plan authoring)

- **Spec coverage**: every event family in the spec maps to a task. Onboarding events → Tasks 1–5. Build Requested → Task 7. Build Started/Succeeded/Failed/Timed Out → Tasks 6, 8.
- **No new endpoint**: removed (spec patched in commit `d205a126c`); the CLI uses the existing `/private/events`. Tasks reflect this.
- **Privacy**: error categories are closed enums, mapped before payload assembly. Raw error messages never reach `sendEvent`.
- **Idempotency**: `classifyBuildTransition` returns `null` when previous status is terminal, preventing duplicate emission across cron re-runs.
- **No capgo_builder changes**: confirmed — all modified files are in `cli/` or `supabase/functions/`.
