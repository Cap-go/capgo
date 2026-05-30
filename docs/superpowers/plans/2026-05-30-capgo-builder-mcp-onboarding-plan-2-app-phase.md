# Capgo Builder MCP Onboarding — Plan 2: App phase + auto-executor

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the onboarding actually *do* automatic work between gates — specifically, register the app in Capgo Cloud — by adding an **auto-executor** that runs consecutive `auto` steps (performing their side effects) until the next gate/choice/done, with app-already-exists conflict handling.

**Architecture:** Builds directly on Plan 1. The pure deciders gain an **App phase**: when authenticated but the app isn't registered, `decideStart` returns an `auto` step `registering-app`. The orchestrators change from "decide once" to a **drive loop**: gather facts → decide → if the result is an executable `auto` step, perform its side effect via an injected dep and re-decide; otherwise return it. A `MAX_AUTO_STEPS` guard prevents infinite loops. App registration reuses `sdk.addApp` + `isAppAlreadyExistsError` + `buildAppIdConflictSuggestions`.

**Tech Stack:** Same as Plan 1 (TypeScript ESM, bun-script tests). No new dependencies.

**Prerequisite:** Plan 1 merged/committed on this branch (`wolny/mcp-builder-onboarding`). Verified APIs: `sdk.addApp({ appId })` → `SDKResult`; `sdk.listApps()` → `SDKResult<{ appId, name }[]>`; `isAppAlreadyExistsError(error)` and `buildAppIdConflictSuggestions(appId)` in `cli/src/init/app-conflict.ts`.

---

## File structure (Plan 2)

| File | Change |
|------|--------|
| `cli/src/build/onboarding/mcp/engine.ts` | Add App-phase branch to `decideStart`/`decideAdvance`; replace `runStart`/`runAdvance` bodies with a shared `drive()` loop + `executeAuto`; extend `EngineDeps` with `registerApp`; add `appConflictResult` helper. |
| `cli/src/build/onboarding/mcp/onboarding-tools.ts` | Add the real `registerApp` to `buildDeps` (wraps `sdk.addApp` + `isAppAlreadyExistsError`). |
| `cli/test/test-mcp-onboarding.mjs` | New tests: App-phase decider, drive-loop executor, conflict result. Update `fakeDeps` to include `registerApp`. |

---

### Task 1: App-phase decision (pure)

**Files:** Modify `cli/src/build/onboarding/mcp/engine.ts`, `cli/test/test-mcp-onboarding.mjs`

- [ ] **Step 1: Write the failing test** — append before the results block in `test-mcp-onboarding.mjs`:

```js
await test('decideStart: authenticated but app not registered → auto registering-app', async () => {
  const r = decideStart(facts({ appRegistered: false }), null)
  eq(r.kind, 'auto')
  eq(r.phase, 'app')
  eq(r.state, 'registering-app')
})

await test('decideStart: app registered → proceeds to platform decision', async () => {
  const r = decideStart(facts({ appRegistered: true }), null)
  ok(r.state === 'platform-select' || r.phase === 'credentials', 'should be past the app phase')
})

await test('decideAdvance: platform chosen but app not registered → routes back to register first', async () => {
  const r = decideAdvance(facts({ appRegistered: false }), null, { platform: 'ios' })
  eq(r.state, 'registering-app')
})
```

- [ ] **Step 2: Run, expect fail**

Run: `cd cli && bun test/test-mcp-onboarding.mjs`
Expected: FAIL — `registering-app` not returned (decideStart currently skips straight to platform).

- [ ] **Step 3: Implement** — in `engine.ts`, in `decideStart`, replace the final line `return decidePlatform(facts, progress)` with:

```ts
  // App phase: ensure the app is registered in Capgo Cloud before signing.
  if (!facts.appRegistered) {
    return {
      onboarding: 'capgo-builder',
      phase: 'app',
      state: 'registering-app',
      progress: 8,
      kind: 'auto',
      summary: `Registering "${facts.appId}" in Capgo Cloud…`,
      context: { appId: facts.appId },
      rules: ONBOARDING_RULES,
    }
  }

  return decidePlatform(facts, progress)
```

And in `decideAdvance`, add the registration guard before `platformChosen`:

```ts
  if (input?.platform === 'ios' || input?.platform === 'android') {
    if (!facts.authenticated)
      return decideStart(facts, progress)
    if (!facts.appRegistered)
      return decideStart(facts, progress) // register the app before credentials
    return platformChosen(facts, input.platform)
  }
```

- [ ] **Step 4: Run, expect pass** (`20 passed`)

Run: `cd cli && bun test/test-mcp-onboarding.mjs`

- [ ] **Step 5: Commit**

```bash
git add cli/src/build/onboarding/mcp/engine.ts cli/test/test-mcp-onboarding.mjs
git commit -m "feat(cli): add App-phase decision to onboarding engine"
```

---

### Task 2: Drive loop + auto-executor

**Files:** Modify `cli/src/build/onboarding/mcp/engine.ts`, `cli/test/test-mcp-onboarding.mjs`

- [ ] **Step 1: Write the failing test** — append before the results block. (Extend `fakeDeps` with `registerApp`; add a stateful fake that flips `appRegistered` once `registerApp` is called.)

```js
function appPhaseDeps(o = {}) {
  let registered = false
  return {
    cwd: '/tmp/app',
    hasSavedKey: () => true,
    getAppId: async () => 'com.acme.app',
    detectPlatforms: async () => ['ios', 'android'],
    isAppRegistered: async () => registered,
    loadProgress: async () => null,
    registerApp: async () => { registered = true; return { ok: true } },
    ...o,
  }
}

await test('runStart: unregistered app → executor registers it → ends at platform-select', async () => {
  const deps = appPhaseDeps()
  const r = await runStart(deps)
  eq(r.state, 'platform-select') // auto register-app step was executed and coalesced
})

await test('runStart: register-app side effect actually runs once', async () => {
  let calls = 0
  const deps = appPhaseDeps({ registerApp: async () => { calls++; return { ok: true } } })
  // isAppRegistered stays false unless we flip it; flip on first call:
  let registered = false
  deps.isAppRegistered = async () => registered
  deps.registerApp = async () => { calls++; registered = true; return { ok: true } }
  await runStart(deps)
  eq(calls, 1)
})

await test('drive loop guards against a non-progressing auto step', async () => {
  // registerApp claims ok but isAppRegistered never flips → must not loop forever.
  const deps = appPhaseDeps({ isAppRegistered: async () => false, registerApp: async () => ({ ok: true }) })
  const r = await runStart(deps)
  eq(r.kind, 'error')
  eq(r.state, 'auto-loop-guard')
})
```

- [ ] **Step 2: Run, expect fail** — `runStart` currently decides once and returns the `auto` `registering-app` result directly (no execution), so `r.state` is `registering-app`, not `platform-select`.

- [ ] **Step 3: Implement** — in `engine.ts`, replace the existing `runStart` and `runAdvance` bodies with a shared drive loop. Delete the old `runStart`/`runAdvance` and add:

```ts
const MAX_AUTO_STEPS = 8

/** Perform an executable auto step's side effect. Returns the next directive,
 *  or null to signal "executed; re-decide". */
async function executeAuto(
  result: NextStepResult,
  facts: PreflightFacts,
  deps: EngineDeps,
): Promise<NextStepResult | null> {
  if (result.state === 'registering-app' && facts.appId) {
    const reg = await deps.registerApp(facts.appId)
    if (reg.ok)
      return null // executed — re-decide (app should now be registered)
    if (reg.alreadyExists)
      return appConflictResult(facts.appId)
    return {
      onboarding: 'capgo-builder',
      phase: 'app',
      state: 'register-app-failed',
      progress: 8,
      kind: 'error',
      summary: `Could not register "${facts.appId}" in Capgo: ${reg.error}`,
      rules: ONBOARDING_RULES,
    }
  }
  // Unknown auto step — surface it rather than silently looping.
  return result
}

/** Gather → decide → execute auto steps → repeat until a terminal directive. */
async function drive(deps: EngineDeps, input?: { platform?: string }): Promise<NextStepResult> {
  for (let i = 0; i < MAX_AUTO_STEPS; i++) {
    const facts = await gatherFacts(deps)
    const progress = facts.appId ? await deps.loadProgress(facts.appId) : null
    const result = decideAdvance(facts, progress, input)
    if (result.kind !== 'auto')
      return result
    const afterExec = await executeAuto(result, facts, deps)
    if (afterExec !== null)
      return afterExec // conflict / error / unknown — stop here
    // executed successfully → loop to re-gather and re-decide
  }
  return {
    onboarding: 'capgo-builder',
    phase: 'preflight',
    state: 'auto-loop-guard',
    progress: 0,
    kind: 'error',
    summary: 'Onboarding stalled (too many automatic steps without progress). Please retry or run `capgo doctor`.',
    rules: ONBOARDING_RULES,
  }
}

/** Orient/resume — runs the drive loop with no input. */
export async function runStart(deps: EngineDeps): Promise<NextStepResult> {
  return drive(deps, undefined)
}

/** Advance one step, carrying the user's choice/values. */
export async function runAdvance(deps: EngineDeps, input?: { platform?: string }): Promise<NextStepResult> {
  return drive(deps, input)
}
```

Add the `registerApp` field to `EngineDeps` (in the interface):

```ts
  registerApp: (appId: string) => Promise<{ ok: true } | { ok: false, alreadyExists: boolean, error: string }>
```

Add the `appConflictResult` helper (place near `platformChosen`):

```ts
function appConflictResult(appId: string): NextStepResult {
  return {
    onboarding: 'capgo-builder',
    phase: 'app',
    state: 'app-id-conflict',
    progress: 8,
    kind: 'human_gate',
    summary: `The app id "${appId}" already exists and is not in your account. You'll need a different app id.`,
    human: {
      instruction: `Choose a different app id (it must match your capacitor.config). Suggestions: ${buildAppIdConflictSuggestions(appId).slice(0, 4).join(', ')}. Update capacitor.config, then continue. (Automatic rename lands in a later milestone.)`,
    },
    next: {
      tool: 'capgo_builder_onboarding_next_step',
      instruction: 'After the user updates their app id in capacitor.config, call next_step (no arguments).',
      call: 'capgo_builder_onboarding_next_step({})',
    },
    rules: ONBOARDING_RULES,
  }
}
```

Add the import at the top of `engine.ts`:

```ts
import { buildAppIdConflictSuggestions } from '../../../init/app-conflict.js'
```

- [ ] **Step 4: Run, expect pass** (`23 passed`)

Run: `cd cli && bun test/test-mcp-onboarding.mjs`

- [ ] **Step 5: Commit**

```bash
git add cli/src/build/onboarding/mcp/engine.ts cli/test/test-mcp-onboarding.mjs
git commit -m "feat(cli): add auto-executor drive loop with app registration"
```

---

### Task 3: App-id conflict result

**Files:** Modify `cli/test/test-mcp-onboarding.mjs`

> The conflict path was implemented in Task 2 (`appConflictResult` + the `alreadyExists` branch in `executeAuto`). This task adds the test that locks the behavior in.

- [ ] **Step 1: Write the failing test** — append before the results block:

```js
await test('drive loop: app id taken by another account → human_gate conflict with suggestions', async () => {
  const deps = appPhaseDeps({
    isAppRegistered: async () => false,
    registerApp: async () => ({ ok: false, alreadyExists: true, error: 'already exists' }),
  })
  const r = await runStart(deps)
  eq(r.kind, 'human_gate')
  eq(r.state, 'app-id-conflict')
  ok(/com\.acme\.app/.test(r.human.instruction), 'should suggest alternates based on the id')
})

await test('drive loop: registration hard-fails → error result', async () => {
  const deps = appPhaseDeps({
    isAppRegistered: async () => false,
    registerApp: async () => ({ ok: false, alreadyExists: false, error: 'network down' }),
  })
  const r = await runStart(deps)
  eq(r.kind, 'error')
  eq(r.state, 'register-app-failed')
})
```

- [ ] **Step 2: Run, expect pass** (`25 passed`) — already implemented in Task 2.

Run: `cd cli && bun test/test-mcp-onboarding.mjs`
Expected: PASS. (If these fail, the `executeAuto` branches from Task 2 are wrong — fix there.)

- [ ] **Step 3: Commit**

```bash
git add cli/test/test-mcp-onboarding.mjs
git commit -m "test(cli): lock app-id conflict and registration-failure paths"
```

---

### Task 4: Wire the real `registerApp` dep

**Files:** Modify `cli/src/build/onboarding/mcp/onboarding-tools.ts`

- [ ] **Step 1: Implement** — in `onboarding-tools.ts`, add the import:

```ts
import { isAppAlreadyExistsError } from '../../../init/app-conflict.js'
```

And add `registerApp` to the object returned by `buildDeps`:

```ts
    registerApp: async (appId: string) => {
      const res = await sdk.addApp({ appId })
      if (res.success)
        return { ok: true as const }
      const error = res.error || 'Failed to register app'
      return { ok: false as const, alreadyExists: isAppAlreadyExistsError(error), error }
    },
```

- [ ] **Step 2: Typecheck**

Run: `bun run --cwd cli typecheck`
Expected: PASS. (`EngineDeps.registerApp` is now satisfied by `buildDeps`.)

- [ ] **Step 3: Run the onboarding unit suite**

Run: `cd cli && bun test/test-mcp-onboarding.mjs`
Expected: `25 passed, 0 failed` (the registration tests in the test file pass fake deps, so they are unaffected; this confirms nothing regressed).

- [ ] **Step 4: Commit**

```bash
git add cli/src/build/onboarding/mcp/onboarding-tools.ts
git commit -m "feat(cli): wire real app registration into onboarding deps"
```

---

### Task 5: Verify end-to-end

**Files:** none (verification only)

- [ ] **Step 1: Typecheck** — `bun run --cwd cli typecheck` → PASS.
- [ ] **Step 2: Build** — `cd cli && bun run build` → succeeds.
- [ ] **Step 3: Integration smoke** — `cd cli && node test/test-mcp.mjs` → `MCP server responds and tools are listed` (both onboarding tools still exposed).
- [ ] **Step 4: Commit (if any incidental changes)** — otherwise nothing to commit; Plan 2 is complete.

---

## Self-Review (completed during planning)

**1. Spec coverage:** App phase (register-if-missing) → Tasks 1–2,4. Auto-executor with coalescing → Task 2. App-already-exists conflict → Tasks 2–3 (partial: surfaces a `human_gate` with suggestions; auto-rename of capacitor.config deferred to a later plan, explicitly noted in the result text). Login resolution → already handled by Plan 1's idempotent re-orientation (after `capgo login`, the next `runStart`/`runAdvance` re-gathers facts with `authenticated: true` and proceeds — no new code needed). ✓

**2. Placeholder scan:** No "TBD"/vague steps; all code complete. The deferred auto-rename is a named, intentional boundary surfaced to the user, not a placeholder. ✓

**3. Type consistency:** `EngineDeps.registerApp` return type `{ ok: true } | { ok: false, alreadyExists, error }` is identical in the interface (Task 2), the real impl (Task 4), and the fakes (Tasks 2–3). `drive`/`executeAuto`/`appConflictResult` names consistent. Expected test counts: 17 (Plan 1) → 20 (T1) → 23 (T2) → 25 (T3). ✓

**Open items to verify during execution:**
- Confirm `sdk.addApp` returns `{ success: false, error }` (string) on duplicate rather than throwing — `isAppAlreadyExistsError` accepts the string; if `addApp` throws instead, wrap in try/catch inside `registerApp`.
- The `appConflictResult` instruction tells the user to change their app id manually; confirm that's the desired v1 behavior vs. offering the existing `init/app-conflict` interactive suggestions flow (deferred by design).
