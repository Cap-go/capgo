# Builder CTA on Incompatible Upload — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When `capgo bundle upload` detects an incompatible bundle (native build required), nudge the user toward Capgo Builder — onboarding if they have no credentials, a native build if they do — interactively when on a TTY, or as a non-blocking ad on CI.

**Architecture:** A new client-side module `builder-cta.ts` owns the decision + prompt flow and returns an action (`continue` / `launch-onboarding` / `launch-build`). `upload.ts` calls it right after the compatibility verdict and, on a launch action, runs the relevant `build` command and returns a "skipped" upload result. Snooze state lives in a dedicated `~/.capgo-builder-prompt.json` (same pattern as `promptPreferences`). Funnel events go through the existing `trackEvent` → PostHog pipeline.

**Tech Stack:** TypeScript (Bun CLI), `@clack/prompts` for prompts, `@std/semver` (already used), Vitest for tests. Reuses `loadSavedCredentials` (build credentials), `canPromptInteractively`, `onboardingBuilderCommand`, `requestBuildCommand`, `trackEvent`, `summarizeUploadCompatibility`, `readSafeFile`/`writeFileAtomic`.

**Spec:** `docs/superpowers/specs/2026-05-30-builder-cta-on-incompatible-upload-design.md`

---

## File Structure

- Create `cli/src/bundle/builder-snooze.ts` — per-app, time-based snooze state (`~/.capgo-builder-prompt.json`). Pure-ish; time + path injectable for tests.
- Create `cli/src/bundle/builder-cta.ts` — `decideBuilderCtaSurface` (pure), `maybePromptBuilderCta` (orchestrator: env/snooze/cred checks, prompts, tracking), `printBuilderCiAd`. Owns the `BuilderCtaAction` type.
- Modify `cli/src/bundle/upload.ts` — `verifyCompatibility` returns `incompatible`/`incompatibleCount`; `uploadBundleInternal` calls the CTA after the verdict and launches + returns a skip result on accept.
- Create `tests/builder-snooze.unit.test.ts` — snooze set/honor/expire/corrupt/per-app.
- Create `tests/builder-cta.unit.test.ts` — `decideBuilderCtaSurface` matrix + `maybePromptBuilderCta` branches (mocked prompts/deps).

---

## Task 1: Snooze state module

**Files:**
- Create: `cli/src/bundle/builder-snooze.ts`
- Test: `tests/builder-snooze.unit.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/builder-snooze.unit.test.ts
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { isBuilderPromptSnoozed, snoozeBuilderPrompt } from '../cli/src/bundle/builder-snooze.ts'

let dir: string
let statePath: string
const now = new Date('2026-05-30T00:00:00.000Z')

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'capgo-snooze-'))
  statePath = join(dir, 'builder-prompt.json')
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('builder snooze', () => {
  it.concurrent('reports not snoozed when no state file exists', async () => {
    expect(await isBuilderPromptSnoozed('com.app', now, join(dir, 'missing.json'))).toBe(false)
  })

  it('honors a snooze within the window and expires it after', async () => {
    await snoozeBuilderPrompt('com.app', 3, now, statePath)
    const twoDaysLater = new Date(now.getTime() + 2 * 86400_000)
    const fourDaysLater = new Date(now.getTime() + 4 * 86400_000)
    expect(await isBuilderPromptSnoozed('com.app', twoDaysLater, statePath)).toBe(true)
    expect(await isBuilderPromptSnoozed('com.app', fourDaysLater, statePath)).toBe(false)
  })

  it('is per-app (snoozing one app does not snooze another)', async () => {
    await snoozeBuilderPrompt('com.app.a', 3, now, statePath)
    expect(await isBuilderPromptSnoozed('com.app.a', now, statePath)).toBe(true)
    expect(await isBuilderPromptSnoozed('com.app.b', now, statePath)).toBe(false)
  })

  it.concurrent('treats a corrupt state file as not snoozed', async () => {
    const { writeFileSync } = await import('node:fs')
    const p = join(dir, 'corrupt.json')
    writeFileSync(p, '{ not json')
    expect(await isBuilderPromptSnoozed('com.app', now, p)).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run tests/builder-snooze.unit.test.ts`
Expected: FAIL — cannot resolve `../cli/src/bundle/builder-snooze.ts`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// cli/src/bundle/builder-snooze.ts
import { homedir } from 'node:os'
import { join } from 'node:path'
import { readSafeFile, writeFileAtomic } from '../utils/safeWrites'

export const builderPromptStatePath: string = join(homedir(), '.capgo-builder-prompt.json')

interface SnoozeEntry {
  snoozedUntil: string
}
type BuilderPromptState = Record<string, SnoozeEntry>

const DAY_MS = 24 * 60 * 60 * 1000

async function readState(path: string): Promise<BuilderPromptState> {
  try {
    const parsed = JSON.parse(await readSafeFile(path)) as unknown
    if (parsed && typeof parsed === 'object')
      return parsed as BuilderPromptState
    return {}
  }
  catch {
    return {}
  }
}

export async function isBuilderPromptSnoozed(appId: string, now: Date, path: string = builderPromptStatePath): Promise<boolean> {
  const entry = (await readState(path))[appId]
  if (!entry?.snoozedUntil)
    return false
  const until = Date.parse(entry.snoozedUntil)
  return Number.isFinite(until) && now.getTime() < until
}

export async function snoozeBuilderPrompt(appId: string, days: number, now: Date, path: string = builderPromptStatePath): Promise<void> {
  const state = await readState(path)
  const snoozedUntil = new Date(now.getTime() + days * DAY_MS).toISOString()
  const next: BuilderPromptState = { ...state, [appId]: { snoozedUntil } }
  await writeFileAtomic(path, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run tests/builder-snooze.unit.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add cli/src/bundle/builder-snooze.ts tests/builder-snooze.unit.test.ts
git commit -m "feat(cli): add per-app Builder prompt snooze state"
```

---

## Task 2: Pure CTA surface decision

**Files:**
- Create: `cli/src/bundle/builder-cta.ts` (decision function + types only in this task)
- Test: `tests/builder-cta.unit.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/builder-cta.unit.test.ts
import { describe, expect, it } from 'vitest'
import { decideBuilderCtaSurface } from '../cli/src/bundle/builder-cta.ts'

const base = { incompatible: true, interactive: true, envDisabled: false, snoozed: false, hasCredentials: false }

describe('decideBuilderCtaSurface', () => {
  it.concurrent('skips when compatible', () => {
    expect(decideBuilderCtaSurface({ ...base, incompatible: false })).toBe('skip')
  })
  it.concurrent('skips when disabled via env (even on CI)', () => {
    expect(decideBuilderCtaSurface({ ...base, envDisabled: true, interactive: false })).toBe('skip')
  })
  it.concurrent('shows the CI ad when non-interactive', () => {
    expect(decideBuilderCtaSurface({ ...base, interactive: false })).toBe('ci-ad')
  })
  it.concurrent('skips interactive prompt when snoozed', () => {
    expect(decideBuilderCtaSurface({ ...base, snoozed: true })).toBe('skip')
  })
  it.concurrent('prompts onboarding when interactive and no credentials', () => {
    expect(decideBuilderCtaSurface(base)).toBe('prompt-onboarding')
  })
  it.concurrent('prompts build when interactive and credentials exist', () => {
    expect(decideBuilderCtaSurface({ ...base, hasCredentials: true })).toBe('prompt-build')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run tests/builder-cta.unit.test.ts`
Expected: FAIL — `decideBuilderCtaSurface` not exported.

- [ ] **Step 3: Write minimal implementation**

```typescript
// cli/src/bundle/builder-cta.ts
export type BuilderCtaSurface = 'skip' | 'ci-ad' | 'prompt-onboarding' | 'prompt-build'
export type BuilderCtaAction = 'continue' | 'launch-onboarding' | 'launch-build'

export interface BuilderCtaContext {
  incompatible: boolean
  interactive: boolean
  envDisabled: boolean
  snoozed: boolean
  hasCredentials: boolean
}

export function decideBuilderCtaSurface(ctx: BuilderCtaContext): BuilderCtaSurface {
  if (!ctx.incompatible || ctx.envDisabled)
    return 'skip'
  if (!ctx.interactive)
    return 'ci-ad'
  if (ctx.snoozed)
    return 'skip'
  return ctx.hasCredentials ? 'prompt-build' : 'prompt-onboarding'
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run tests/builder-cta.unit.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add cli/src/bundle/builder-cta.ts tests/builder-cta.unit.test.ts
git commit -m "feat(cli): add Builder CTA surface decision logic"
```

---

## Task 3: CI ad printer + orchestrator (`maybePromptBuilderCta`)

**Files:**
- Modify: `cli/src/bundle/builder-cta.ts`
- Test: `tests/builder-cta.unit.test.ts`

- [ ] **Step 1: Write the failing test** (append to the existing file)

```typescript
// tests/builder-cta.unit.test.ts — append
import { beforeEach, vi } from 'vitest'

// Mock the collaborators the orchestrator depends on.
vi.mock('../cli/src/build/credentials.ts', () => ({ loadSavedCredentials: vi.fn() }))
vi.mock('../cli/src/bundle/builder-snooze.ts', () => ({ isBuilderPromptSnoozed: vi.fn(), snoozeBuilderPrompt: vi.fn() }))
vi.mock('../cli/src/analytics/track.ts', () => ({ trackEvent: vi.fn() }))
vi.mock('../cli/src/utils.ts', async (orig) => ({ ...(await orig()), canPromptInteractively: vi.fn() }))
vi.mock('@clack/prompts', async (orig) => ({ ...(await orig() as object), confirm: vi.fn(), isCancel: () => false, log: { warn: vi.fn(), info: vi.fn() } }))

const { loadSavedCredentials } = await import('../cli/src/build/credentials.ts')
const { isBuilderPromptSnoozed, snoozeBuilderPrompt } = await import('../cli/src/bundle/builder-snooze.ts')
const { canPromptInteractively } = await import('../cli/src/utils.ts')
const { confirm } = await import('@clack/prompts')
const { maybePromptBuilderCta } = await import('../cli/src/bundle/builder-cta.ts')

const params = { incompatible: true, appId: 'com.app', orgId: 'org1', apikey: 'k', incompatibleCount: 2, now: new Date('2026-05-30T00:00:00Z') }

describe('maybePromptBuilderCta', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(canPromptInteractively as any).mockReturnValue(true)
    ;(isBuilderPromptSnoozed as any).mockResolvedValue(false)
    ;(loadSavedCredentials as any).mockResolvedValue(null)
  })

  it('returns continue when compatible', async () => {
    expect(await maybePromptBuilderCta({ ...params, incompatible: false })).toBe('continue')
  })

  it('launches onboarding on accept (no credentials)', async () => {
    ;(confirm as any).mockResolvedValueOnce(true)
    expect(await maybePromptBuilderCta(params)).toBe('launch-onboarding')
  })

  it('launches build on accept (credentials present)', async () => {
    ;(loadSavedCredentials as any).mockResolvedValue({ ios: {} })
    ;(confirm as any).mockResolvedValueOnce(true)
    expect(await maybePromptBuilderCta(params)).toBe('launch-build')
  })

  it('snoozes and continues on a confirmed decline', async () => {
    ;(confirm as any).mockResolvedValueOnce(false).mockResolvedValueOnce(true) // decline, then "yes skip"
    expect(await maybePromptBuilderCta(params)).toBe('continue')
    expect(snoozeBuilderPrompt).toHaveBeenCalledWith('com.app', 3, params.now)
  })

  it('continues without snooze on an unsure decline', async () => {
    ;(confirm as any).mockResolvedValueOnce(false).mockResolvedValueOnce(false) // decline, then "no don't skip"
    expect(await maybePromptBuilderCta(params)).toBe('continue')
    expect(snoozeBuilderPrompt).not.toHaveBeenCalled()
  })

  it('shows the CI ad and continues when non-interactive', async () => {
    ;(canPromptInteractively as any).mockReturnValue(false)
    expect(await maybePromptBuilderCta(params)).toBe('continue')
    expect(confirm).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run tests/builder-cta.unit.test.ts`
Expected: FAIL — `maybePromptBuilderCta` not exported.

- [ ] **Step 3: Write minimal implementation** (append to `cli/src/bundle/builder-cta.ts`)

```typescript
import { env } from 'node:process'
import { confirm as pConfirm, isCancel as pIsCancel, log } from '@clack/prompts'
import { trackEvent } from '../analytics/track'
import { loadSavedCredentials } from '../build/credentials'
import { isTruthyEnvValue } from '../posthog'
import { canPromptInteractively } from '../utils'
import { isBuilderPromptSnoozed, snoozeBuilderPrompt } from './builder-snooze'

const DOCS_URL = 'https://capgo.app/docs/cli/cloud-build/'
const SNOOZE_DAYS = 3

export function printBuilderCiAd(hasCredentials: boolean): void {
  log.warn('This update changes native code, so it needs a native build to reach users on current app-store binaries.')
  log.info(hasCredentials
    ? '→ Run a native build:  npx @capgo/cli build request --platform <ios|android>'
    : '→ Set up Capgo Builder: npx @capgo/cli build onboarding')
  log.info(`  Docs: ${DOCS_URL}`)
}

export interface MaybePromptBuilderCtaParams {
  incompatible: boolean
  appId: string
  orgId: string
  apikey: string
  incompatibleCount: number
  now?: Date
}

export async function maybePromptBuilderCta(params: MaybePromptBuilderCtaParams): Promise<BuilderCtaAction> {
  const now = params.now ?? new Date()
  const envDisabled = isTruthyEnvValue(env.CAPGO_NO_BUILDER_PROMPT)
  const interactive = canPromptInteractively()
  const hasCredentials = (await loadSavedCredentials(params.appId)) !== null
  const snoozed = await isBuilderPromptSnoozed(params.appId, now)

  const surface = decideBuilderCtaSurface({ incompatible: params.incompatible, interactive, envDisabled, snoozed, hasCredentials })
  if (surface === 'skip')
    return 'continue'

  const mode = hasCredentials ? 'build' : 'onboarding'
  const shownTags = { surface: surface === 'ci-ad' ? 'ci' : 'interactive', mode, incompatible_count: params.incompatibleCount }
  void trackEvent({ channel: 'bundle', event: 'Builder CTA Shown', icon: '📣', apikey: params.apikey, appId: params.appId, orgId: params.orgId, tags: shownTags })

  if (surface === 'ci-ad') {
    printBuilderCiAd(hasCredentials)
    return 'continue'
  }

  const accepted = await pConfirm({
    message: mode === 'build'
      ? 'This update needs a native build. Run one now with Capgo Builder?'
      : 'This update includes native changes. Set up Capgo Builder now?',
    initialValue: true,
  })
  if (pIsCancel(accepted))
    return 'continue'

  if (accepted === true) {
    void trackEvent({ channel: 'bundle', event: 'Builder CTA Accepted', icon: '✅', apikey: params.apikey, appId: params.appId, orgId: params.orgId, tags: { mode } })
    return mode === 'build' ? 'launch-build' : 'launch-onboarding'
  }

  // Declined → confirm with the low-fear warning (spec option 4).
  const stillSkip = await pConfirm({
    message: 'Heads up: this update includes native changes, which ship via an app-store build rather than OTA. Skip the Builder for now?',
    initialValue: false,
  })
  const sure = !pIsCancel(stillSkip) && stillSkip === true
  void trackEvent({ channel: 'bundle', event: 'Builder CTA Declined', icon: '🚫', apikey: params.apikey, appId: params.appId, orgId: params.orgId, tags: { mode, sure } })
  if (sure) {
    await snoozeBuilderPrompt(params.appId, SNOOZE_DAYS, now)
    void trackEvent({ channel: 'bundle', event: 'Builder CTA Snoozed', icon: '😴', apikey: params.apikey, appId: params.appId, orgId: params.orgId, tags: { mode, days: SNOOZE_DAYS } })
  }
  return 'continue'
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run tests/builder-cta.unit.test.ts`
Expected: PASS (decision matrix + 6 orchestrator tests).

- [ ] **Step 5: Commit**

```bash
git add cli/src/bundle/builder-cta.ts tests/builder-cta.unit.test.ts
git commit -m "feat(cli): add Builder CTA prompt orchestrator + CI ad + tracking"
```

---

## Task 4: Surface `incompatible` from `verifyCompatibility`

**Files:**
- Modify: `cli/src/bundle/upload.ts` (function `verifyCompatibility`, ends with `return { nativePackages, minUpdateVersion }`)

- [ ] **Step 1: Update the return value**

In `verifyCompatibility`, the summary is already computed as `compatibilitySummary` (used for the `Bundle Upload Compatibility Checked` event). Change the final return from:

```typescript
  return { nativePackages, minUpdateVersion }
```

to:

```typescript
  return {
    nativePackages,
    minUpdateVersion,
    incompatible: compatibilitySummary.result === 'incompatible',
    incompatibleCount: compatibilitySummary.incompatibleCount,
  }
```

- [ ] **Step 2: Typecheck**

Run: `bun run --cwd cli typecheck`
Expected: PASS (the new fields are inferred; no consumers broken — the call site destructures a subset).

- [ ] **Step 3: Commit**

```bash
git add cli/src/bundle/upload.ts
git commit -m "feat(cli): return incompatible flag from verifyCompatibility"
```

---

## Task 5: Wire the CTA into the upload flow

**Files:**
- Modify: `cli/src/bundle/upload.ts` (imports; `uploadBundleInternal`, immediately after the `verifyCompatibility` call near line 885)

- [ ] **Step 1: Add imports** (top of `upload.ts`, with the other `./` imports)

```typescript
import { maybePromptBuilderCta } from './builder-cta'
```

And with the build-command imports (these are new cross-module imports into upload.ts):

```typescript
import { onboardingBuilderCommand } from '../build/onboarding/command'
import { requestBuildCommand } from '../build/request'
```

- [ ] **Step 2: Destructure the new fields and run the CTA**

Replace:

```typescript
  const { nativePackages, minUpdateVersion } = await verifyCompatibility(supabase, pm, options, channel, appid, bundle, orgId)
```

with:

```typescript
  const { nativePackages, minUpdateVersion, incompatible, incompatibleCount } = await verifyCompatibility(supabase, pm, options, channel, appid, bundle, orgId)

  if (incompatible) {
    const builderAction = await maybePromptBuilderCta({ incompatible, appId: appid, orgId, apikey, incompatibleCount })
    if (builderAction !== 'continue') {
      if (builderAction === 'launch-onboarding')
        await onboardingBuilderCommand({ apikey })
      else
        await requestBuildCommand(appid, { apikey, supaHost: options.supaHost, supaAnon: options.supaAnon, path: options.path })

      return {
        success: true,
        skipped: true,
        reason: 'NATIVE_BUILD',
        bundle,
        checksum: null,
        encryptionMethod,
        storageProvider: defaultStorageProvider,
      }
    }
  }
```

> Notes: `apikey`, `interactive`, `encryptionMethod`, `defaultStorageProvider`, `orgId`, `appid`, `bundle`, `options` are all already in scope here (defined earlier in `uploadBundleInternal`). The skip-result shape mirrors the existing `VERSION_EXISTS` early return, and `uploadBundle` already special-cases `result.skipped` (it skips the star-repo prompt).

- [ ] **Step 3: Typecheck + build (catches any circular import / option-shape issues)**

Run: `bun run --cwd cli typecheck && bun run --cwd cli build`
Expected: PASS, "Built CLI and SDK successfully". If `requestBuildCommand`'s options type rejects the passed fields, narrow to the accepted subset (it extends `optionsBaseSchema` + `path`).

- [ ] **Step 4: Commit**

```bash
git add cli/src/bundle/upload.ts
git commit -m "feat(cli): prompt for Capgo Builder on incompatible upload"
```

---

## Task 6: Full verification

- [ ] **Step 1: Run the new unit tests + typecheck + build**

Run:
```bash
bunx vitest run tests/builder-snooze.unit.test.ts tests/builder-cta.unit.test.ts
bun run --cwd cli typecheck
bun run --cwd cli build
```
Expected: all green.

- [ ] **Step 2: Manual smoke (interactive)**

In a Capacitor project whose native deps differ from the channel's metadata, run `npx @capgo/cli bundle upload --channel <ch>` on a TTY and confirm:
- No credentials → "Set up Capgo Builder now?" → declining then confirming "skip" suppresses the prompt for 3 days (re-run shows no prompt); the OTA upload proceeds.
- `CAPGO_NO_BUILDER_PROMPT=1 npx @capgo/cli bundle upload ...` → no prompt, no ad.
- Piping (non-TTY) → prints the ad, no prompt, upload proceeds.

- [ ] **Step 3: Commit any fixups, then open PR**

```bash
git push -u origin feat/builder-cta-on-incompatible-upload
gh pr create --base main --title "feat(cli): offer Capgo Builder on incompatible upload" --body "Implements docs/superpowers/specs/2026-05-30-builder-cta-on-incompatible-upload-design.md"
```

---

## Notes / risks

- **Circular imports:** `upload.ts` will import `build/request` and `build/onboarding/command`. Those import `utils`/`credentials`, not `upload`, so no cycle is expected — Step 5.3's build is the gate.
- **`requestBuildCommand` options:** it resolves the platform interactively (`resolveBuildPlatform`), so launching without `--platform` prompts the user. Pass only `apikey`/`supaHost`/`supaAnon`/`path`; trim if the type complains.
- **Tracking:** `Builder CTA Shown/Accepted/Declined/Snoozed` carry `appId` + `orgId` so they group by org in PostHog (same lesson as the compat event). They join the existing Capgo Builder Tracking funnel.
- **Out of scope:** no backend changes; CTA only in `bundle upload`; the compat verdict stays non-fatal.
