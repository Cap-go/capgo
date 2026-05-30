# Capgo Builder MCP Onboarding — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an AI agent conduct Capgo Builder (native cloud build) onboarding entirely through the MCP server — the server owns a resumable state machine, automates what it can, and returns one explicit next step per call — from zero to a first successful build, for iOS and Android.

**Architecture:** A platform-agnostic, server-owned state machine drives the flow. The AI only ever calls a **2-tool spine** — `start_capgo_builder_onboarding` (orient/resume, no args) and `capgo_builder_onboarding_next_step` (advance, carrying the user's choice/values). Every tool result is a `NextStepResult` whose `kind` (`auto`/`human_gate`/`choice`/`done`/`error`/`info`) tells the AI how to behave and whose `next` names the literal next move. Heavy work (Apple/Google APIs, keystore, build) runs **inside the server** by reusing the existing `build/onboarding/` automations; secrets travel via local channels (file paths, the local credential store), never the chat. Logic lives in **pure deciders + deps-injected orchestrators** so it is unit-testable headlessly (the codebase's established `getResumeStep` pattern).

**Tech Stack:** TypeScript (ESM, `.js` import specifiers), `@modelcontextprotocol/sdk`, `zod`, the existing `CapgoSDK`, bun-script tests (`cli/test/test-*.mjs`).

**Design references (in this repo):**
- `docs/superpowers/specs/2026-05-30-capgo-builder-mcp-onboarding-design.html` — architecture
- `docs/superpowers/specs/2026-05-30-capgo-builder-onboarding-user-journey.html` — end-user journey

---

## Plan series (scope decomposition)

This feature is too large for one plan. It is split into **five sequential, individually-shippable plans**. **Only Plan 1 is detailed below**; Plans 2–5 are summaries to be expanded into their own `docs/superpowers/plans/` files when reached.

| # | Plan | Ships | Depends on |
|---|------|-------|-----------|
| **1** | **Spine, contract & preflight (walking skeleton)** | The 2 tools live in the MCP server; `start` returns a real preflight report + roadmap + first decision; `next_step` advances the decision graph. Credentials/build phases return a clear `info` "next milestone" result. Fully unit-tested deciders. | — |
| 2 | App + login phase | Resolves the login gate (detect local key) and the App phase (register, or reuse-vs-recreate on conflict) for real. | 1 |
| 3 | Android credentials | Reuse `android/` automations: keystore gen (auto), Google OAuth (browser, server-driven), GCP/Play provisioning (auto), save creds. Requires extracting the headless core of those modules. | 2 |
| 4 | iOS credentials (create-new) | Reuse `apple-api.ts`: ASC API key `human_gate` → verify → certificate → profile → save. Cert-limit `choice`. (iOS import-existing path deferred to a later plan.) | 2 |
| 5 | Build + done + recovery | `capgo_request_build` + poll + `done` (URL/QR). Recovery results for the edge cases in the journey doc. | 3 or 4 |

> **Headless-core extraction note (Plans 3–4):** before writing those plans, survey `cli/src/build/onboarding/{apple-api,macos-signing,android/*}.ts` to confirm the automation logic is separable from the Ink/React/`@clack` UI (the `ui/` subfolders should hold all interactivity). Where a routine blocks on an interactive prompt, the extraction lifts the "ask" out to the driver and keeps the automation pure — mirroring how `getResumeStep`/`getImportEntryStep` are already pure and unit-tested.

---

## Plan 1 — File structure

| File | Responsibility |
|------|----------------|
| `cli/src/build/onboarding/mcp/contract.ts` (create) | Result-contract types (`NextStepResult`, `StepKind`, …), the `ONBOARDING_RULES` preamble, and `renderResult()` (turns a result into MCP text content: directive first, JSON last). Pure. |
| `cli/src/build/onboarding/mcp/engine.ts` (create) | The state machine. Pure deciders (`decideStart`, `decideAdvance`) + `PreflightFacts`, and deps-injected orchestrators (`gatherFacts`, `runStart`, `runAdvance`) that do IO through an injected `EngineDeps`. |
| `cli/src/build/onboarding/mcp/onboarding-tools.ts` (create) | `registerOnboardingTools(server, sdk, depsOverride?)` — builds real `EngineDeps` from `CapgoSDK` + utils and registers the two MCP tools, rendering results via `renderResult`. |
| `cli/src/mcp/server.ts` (modify) | Import and call `registerOnboardingTools(server, sdk)` after the SDK is constructed. |
| `cli/test/test-mcp-onboarding.mjs` (create) | Headless tests for the contract, deciders, orchestrators, and tool registration. Grows across Tasks 1–4. |
| `cli/package.json` (modify) | Add `test:mcp-onboarding` script and append it to the aggregate `"test"` script. |

**Conventions to follow exactly:**
- New files in the onboarding subtree use **`.js` import specifiers** for relative imports (e.g. `import { x } from '../types.js'`) — matches `progress.ts`.
- `server.ts` uses **extensionless** imports — match it for the one import added there.
- Tests are plain `.mjs`, `await import('../src/.../*.ts')`, tiny inline `test()/assertEquals()` harness, `process.exit(1)` on failure — matches `test-android-onboarding-progress.mjs`.
- Run a single test from the `cli/` dir: `cd cli && bun test/test-mcp-onboarding.mjs`.

---

### Task 1: Result contract module

**Files:**
- Create: `cli/src/build/onboarding/mcp/contract.ts`
- Create: `cli/test/test-mcp-onboarding.mjs`
- Modify: `cli/package.json` (scripts)

- [ ] **Step 1: Write the failing test**

Create `cli/test/test-mcp-onboarding.mjs`:

```js
#!/usr/bin/env node
/** Headless tests for the MCP-conducted Capgo Builder onboarding engine. */
import process from 'node:process'

console.log('🧪 Testing MCP Builder onboarding...\n')

const { renderResult, ONBOARDING_RULES } = await import('../src/build/onboarding/mcp/contract.ts')

let pass = 0
let fail = 0
async function test(name, fn) {
  try { console.log(`\n🔍 ${name}`); await fn(); console.log(`✅ PASSED: ${name}`); pass++ }
  catch (e) { console.error(`❌ FAILED: ${name}`); console.error(`   ${e.message}`); fail++ }
}
function eq(a, b, msg) { if (a !== b) throw new Error(msg || `Expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`) }
function ok(c, msg) { if (!c) throw new Error(msg || 'expected truthy') }

await test('ONBOARDING_RULES is a non-trivial preamble', async () => {
  ok(Array.isArray(ONBOARDING_RULES) && ONBOARDING_RULES.length >= 3)
})

await test('renderResult leads with a directive and embeds the JSON', async () => {
  const result = {
    onboarding: 'capgo-builder', phase: 'preflight', state: 'platform-select', progress: 5,
    kind: 'choice', summary: 'Pick a platform.',
    options: [{ value: 'ios', label: 'iOS', note: 'needs Apple key' }],
    next: { tool: 'capgo_builder_onboarding_next_step', instruction: 'Ask the user, then call next_step.', call: 'capgo_builder_onboarding_next_step({ platform: "ios" })' },
  }
  const text = renderResult(result)
  ok(text.includes('DO THIS NEXT'), 'should contain the directive header')
  ok(text.includes('Example call:'), 'should contain the example call')
  ok(text.includes('"kind": "choice"'), 'should embed the JSON payload')
  ok(text.includes('- ios'), 'should list options')
})

console.log(`\n📊 Results: ${pass} passed, ${fail} failed`)
if (fail > 0)
  process.exit(1)
```

Then add the script to `cli/package.json`. Insert after the `"test:apple-api-import-helpers": ...` line:

```json
    "test:mcp-onboarding": "bun test/test-mcp-onboarding.mjs",
```

And append to the end of the aggregate `"test"` script value (just before the closing quote):

```text
 && bun run test:mcp-onboarding
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd cli && bun test/test-mcp-onboarding.mjs`
Expected: FAIL — `Cannot find module '../src/build/onboarding/mcp/contract.ts'` (the module does not exist yet).

- [ ] **Step 3: Write minimal implementation**

Create `cli/src/build/onboarding/mcp/contract.ts`:

```ts
// src/build/onboarding/mcp/contract.ts
// Result contract for the MCP-conducted Capgo Builder onboarding.
// The `kind` tells the AI how to behave; `next` tells it the literal next move.
// Returned both as JSON and as a rendered directive (see renderResult).

export type StepKind = 'auto' | 'human_gate' | 'choice' | 'done' | 'error' | 'info'
export type OnboardingPhase = 'preflight' | 'app' | 'credentials' | 'build' | 'done'
export type Platform = 'ios' | 'android'

export interface ChoiceOption {
  value: string
  label?: string
  note?: string
}

export interface CollectField {
  field: string
  desc: string
}

export interface NextAction {
  /** The exact tool to call next. */
  tool: string
  /** Argument hint for the model. */
  with?: Record<string, unknown>
  /** A literal, copy-pasteable example call the model can pattern-match. */
  call?: string
  /** Plain-English directive. */
  instruction: string
}

export interface NextStepResult {
  onboarding: 'capgo-builder'
  phase: OnboardingPhase
  /** Granular step name (reuses OnboardingStep vocabulary where applicable). */
  state: string
  platform?: Platform
  /** 0–100. */
  progress: number
  kind: StepKind
  summary: string
  /** Human-facing journey overview; informational, not an execution list. */
  roadmap?: string[]
  context?: Record<string, unknown>
  /** Present when kind === 'choice'. */
  options?: ChoiceOption[]
  /** Present when kind === 'human_gate'. */
  human?: { instruction: string, resourceUri?: string }
  /** Present when kind === 'human_gate': what to bring back. */
  collect?: CollectField[]
  next?: NextAction
  /** Rules of engagement; included on the first result of a session. */
  rules?: string[]
}

export const ONBOARDING_RULES: string[] = [
  'You are conducting Capgo Builder onboarding. Do not plan the steps yourself.',
  'Do exactly what the result\'s `next` says — never improvise the order or call other tools mid-flow.',
  'If kind is "human_gate", show `human.instruction` to the user, wait, then call `next.tool` with the values in `collect`. Never ask the user to paste secrets into the chat.',
  'If kind is "choice", present `options` and call `next.tool` with the user\'s pick.',
  'Never tell the user a step succeeded unless a result confirms it.',
]

/** Render a result into MCP text content: imperative directive first, structured data last. */
export function renderResult(result: NextStepResult): string {
  const lines: string[] = []
  lines.push(`Capgo Builder onboarding — phase: ${result.phase} · step: ${result.state} · ${result.progress}%`)
  lines.push('')
  lines.push(result.summary)

  if (result.roadmap?.length) {
    lines.push('')
    lines.push('PLAN (show the user):')
    for (const item of result.roadmap)
      lines.push(`  • ${item}`)
  }
  if (result.human?.instruction) {
    lines.push('')
    lines.push(`ACTION FOR THE USER:\n${result.human.instruction}`)
    if (result.human.resourceUri)
      lines.push(`(Detailed guide: ${result.human.resourceUri})`)
  }
  if (result.options?.length) {
    lines.push('')
    lines.push('OPTIONS:')
    for (const o of result.options)
      lines.push(`  - ${o.value}${o.label ? ` (${o.label})` : ''}${o.note ? ` — ${o.note}` : ''}`)
  }
  if (result.collect?.length) {
    lines.push('')
    lines.push('COLLECT FROM THE USER (never via chat if secret — use file paths / local login):')
    for (const c of result.collect)
      lines.push(`  - ${c.field}: ${c.desc}`)
  }
  if (result.next) {
    lines.push('')
    lines.push(`DO THIS NEXT: ${result.next.instruction}`)
    if (result.next.call)
      lines.push(`Example call: ${result.next.call}`)
  }
  lines.push('')
  lines.push('---')
  lines.push(JSON.stringify(result, null, 2))
  return lines.join('\n')
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd cli && bun test/test-mcp-onboarding.mjs`
Expected: PASS — `2 passed, 0 failed`.

- [ ] **Step 5: Commit**

```bash
git add cli/src/build/onboarding/mcp/contract.ts cli/test/test-mcp-onboarding.mjs cli/package.json
git commit -m "feat(cli): add MCP Builder onboarding result contract"
```

---

### Task 2: State-machine deciders (pure)

**Files:**
- Create: `cli/src/build/onboarding/mcp/engine.ts`
- Modify: `cli/test/test-mcp-onboarding.mjs`

- [ ] **Step 1: Write the failing test**

Append to `cli/test/test-mcp-onboarding.mjs` BEFORE the final results block (`console.log('\n📊 Results: ...')`):

```js
const { decideStart, decideAdvance } = await import('../src/build/onboarding/mcp/engine.ts')

const facts = (o = {}) => ({
  capacitorProject: true,
  appId: 'com.acme.app',
  platformsDetected: ['ios', 'android'],
  authenticated: true,
  appRegistered: true,
  ...o,
})

await test('decideStart: not a Capacitor project → error', async () => {
  const r = decideStart(facts({ capacitorProject: false, appId: undefined }), null)
  eq(r.kind, 'error')
  eq(r.phase, 'preflight')
})

await test('decideStart: not authenticated → login human_gate, no chat paste', async () => {
  const r = decideStart(facts({ authenticated: false }), null)
  eq(r.kind, 'human_gate')
  eq(r.state, 'login-required')
  ok(/cli login/i.test(r.human.instruction), 'should mention the login command')
  ok(/not paste/i.test(r.human.instruction), 'should warn against pasting into chat')
})

await test('decideStart: both platforms → choice with two options', async () => {
  const r = decideStart(facts(), null)
  eq(r.kind, 'choice')
  eq(r.state, 'platform-select')
  eq(r.options.length, 2)
  ok(r.roadmap.length >= 3, 'first decision should carry the roadmap')
})

await test('decideStart: single platform → auto-selects and enters credentials phase', async () => {
  const r = decideStart(facts({ platformsDetected: ['android'] }), null)
  eq(r.platform, 'android')
  eq(r.phase, 'credentials')
})

await test('decideStart: no native folder → human_gate cap add', async () => {
  const r = decideStart(facts({ platformsDetected: [] }), null)
  eq(r.kind, 'human_gate')
  eq(r.state, 'no-platform')
})

await test('decideAdvance: platform choice records it and enters credentials', async () => {
  const r = decideAdvance(facts(), null, { platform: 'ios' })
  eq(r.platform, 'ios')
  eq(r.phase, 'credentials')
})

await test('decideAdvance: platform choice while unauthenticated bounces to login', async () => {
  const r = decideAdvance(facts({ authenticated: false }), null, { platform: 'ios' })
  eq(r.state, 'login-required')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd cli && bun test/test-mcp-onboarding.mjs`
Expected: FAIL — `Cannot find module '../src/build/onboarding/mcp/engine.ts'`.

- [ ] **Step 3: Write minimal implementation**

Create `cli/src/build/onboarding/mcp/engine.ts`:

```ts
// src/build/onboarding/mcp/engine.ts
import type { OnboardingProgress } from '../types.js'
import type { NextStepResult, Platform } from './contract.js'
import { ONBOARDING_RULES } from './contract.js'

/** Facts gathered during preflight; the pure deciders branch only on these. */
export interface PreflightFacts {
  capacitorProject: boolean
  appId?: string
  platformsDetected: Platform[]
  authenticated: boolean
  appRegistered: boolean
}

const ROADMAP: string[] = [
  'Preflight — detect your project & account',
  'Register the app in Capgo',
  'Set up signing credentials',
  'Run your first cloud build',
]

const NEXT_STEP_TOOL = 'capgo_builder_onboarding_next_step'

/** Decide the first/again step for a fresh or resumed session. Pure. */
export function decideStart(facts: PreflightFacts, progress: OnboardingProgress | null): NextStepResult {
  if (!facts.capacitorProject || !facts.appId) {
    return {
      onboarding: 'capgo-builder',
      phase: 'preflight',
      state: 'no-capacitor-project',
      progress: 0,
      kind: 'error',
      summary: 'This does not look like a Capacitor project (no capacitor.config with an app id). Run onboarding from your app directory.',
      rules: ONBOARDING_RULES,
    }
  }

  if (!facts.authenticated) {
    return {
      onboarding: 'capgo-builder',
      phase: 'preflight',
      state: 'login-required',
      progress: 5,
      kind: 'human_gate',
      summary: `Found your app "${facts.appId}". First, connect your Capgo account.`,
      roadmap: ROADMAP,
      context: { appId: facts.appId, platformsDetected: facts.platformsDetected },
      human: {
        instruction: 'Get an API key at app.capgo.io → Account → API keys, then run `npx @capgo/cli login` in your terminal so it is stored locally. Do not paste the key into this chat.',
      },
      next: {
        tool: NEXT_STEP_TOOL,
        instruction: 'After the user has run `capgo login`, call next_step again (no arguments) to continue.',
        call: `${NEXT_STEP_TOOL}({})`,
      },
      rules: ONBOARDING_RULES,
    }
  }

  return decidePlatform(facts, progress)
}

function decidePlatform(facts: PreflightFacts, _progress: OnboardingProgress | null): NextStepResult {
  const platforms = facts.platformsDetected

  if (platforms.length === 0) {
    return {
      onboarding: 'capgo-builder',
      phase: 'preflight',
      state: 'no-platform',
      progress: 5,
      kind: 'human_gate',
      summary: 'No native platform folder found (ios/ or android/).',
      human: {
        instruction: 'Add a native platform first (run `npx cap add ios` or `npx cap add android`), then continue.',
      },
      next: {
        tool: NEXT_STEP_TOOL,
        instruction: 'After the user has added a native platform, call next_step (no arguments).',
        call: `${NEXT_STEP_TOOL}({})`,
      },
      rules: ONBOARDING_RULES,
    }
  }

  if (platforms.length === 1)
    return platformChosen(facts, platforms[0])

  return {
    onboarding: 'capgo-builder',
    phase: 'preflight',
    state: 'platform-select',
    progress: 5,
    kind: 'choice',
    summary: `Found your app "${facts.appId}". Which platform do you want to set up first?`,
    roadmap: ROADMAP,
    context: { appId: facts.appId, appRegistered: facts.appRegistered },
    options: [
      { value: 'ios', label: 'iOS', note: 'you will create an App Store Connect API key' },
      { value: 'android', label: 'Android', note: 'mostly automatic; one Google sign-in' },
    ],
    next: {
      tool: NEXT_STEP_TOOL,
      with: { platform: '<ios|android>' },
      instruction: 'Ask the user which platform, then call next_step with their choice.',
      call: `${NEXT_STEP_TOOL}({ platform: "ios" })`,
    },
    rules: ONBOARDING_RULES,
  }
}

/**
 * Plan 1 stops at the START of the credentials phase. The real per-platform
 * credential flow lands in Plans 3 (Android) and 4 (iOS).
 */
function platformChosen(facts: PreflightFacts, platform: Platform): NextStepResult {
  return {
    onboarding: 'capgo-builder',
    phase: 'credentials',
    state: 'credentials-not-implemented',
    platform,
    progress: 10,
    kind: 'info',
    summary: `Platform "${platform}" selected for "${facts.appId}". The credential setup flow lands in the next milestone.`,
    context: { appId: facts.appId, appRegistered: facts.appRegistered },
    rules: ONBOARDING_RULES,
  }
}

/** Advance one step. Pure. `input.platform` resolves a platform-select choice. */
export function decideAdvance(
  facts: PreflightFacts,
  progress: OnboardingProgress | null,
  input?: { platform?: string },
): NextStepResult {
  if (input?.platform === 'ios' || input?.platform === 'android') {
    if (!facts.authenticated)
      return decideStart(facts, progress)
    return platformChosen(facts, input.platform)
  }
  // No explicit input → re-orient (idempotent): re-run the start decision.
  return decideStart(facts, progress)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd cli && bun test/test-mcp-onboarding.mjs`
Expected: PASS — `9 passed, 0 failed`.

- [ ] **Step 5: Commit**

```bash
git add cli/src/build/onboarding/mcp/engine.ts cli/test/test-mcp-onboarding.mjs
git commit -m "feat(cli): add MCP Builder onboarding state-machine deciders"
```

---

### Task 3: Deps-injected orchestrators

**Files:**
- Modify: `cli/src/build/onboarding/mcp/engine.ts`
- Modify: `cli/test/test-mcp-onboarding.mjs`

- [ ] **Step 1: Write the failing test**

Append to `cli/test/test-mcp-onboarding.mjs` before the final results block:

```js
const { gatherFacts, runStart, runAdvance } = await import('../src/build/onboarding/mcp/engine.ts')

const fakeDeps = (o = {}) => ({
  cwd: '/tmp/app',
  hasSavedKey: () => true,
  getAppId: async () => 'com.acme.app',
  detectPlatforms: async () => ['ios'],
  isAppRegistered: async () => true,
  loadProgress: async () => null,
  ...o,
})

await test('gatherFacts: maps injected deps into facts', async () => {
  const f = await gatherFacts(fakeDeps())
  eq(f.capacitorProject, true)
  eq(f.appId, 'com.acme.app')
  eq(f.authenticated, true)
  eq(f.platformsDetected.length, 1)
  eq(f.appRegistered, true)
})

await test('gatherFacts: no appId → not a capacitor project, skips app check', async () => {
  let appChecked = false
  const f = await gatherFacts(fakeDeps({
    getAppId: async () => undefined,
    isAppRegistered: async () => { appChecked = true; return true },
  }))
  eq(f.capacitorProject, false)
  eq(appChecked, false, 'must not call isAppRegistered without an appId')
})

await test('gatherFacts: unauthenticated skips the registered-app check', async () => {
  let appChecked = false
  const f = await gatherFacts(fakeDeps({
    hasSavedKey: () => false,
    isAppRegistered: async () => { appChecked = true; return true },
  }))
  eq(f.authenticated, false)
  eq(appChecked, false, 'must not call the API when unauthenticated')
})

await test('runStart: single platform via deps → enters credentials phase', async () => {
  const r = await runStart(fakeDeps())
  eq(r.platform, 'ios')
  eq(r.phase, 'credentials')
})

await test('runAdvance: passes platform input through to the decider', async () => {
  const r = await runAdvance(fakeDeps({ detectPlatforms: async () => ['ios', 'android'] }), { platform: 'android' })
  eq(r.platform, 'android')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd cli && bun test/test-mcp-onboarding.mjs`
Expected: FAIL — `gatherFacts is not a function` (export does not exist yet).

- [ ] **Step 3: Write minimal implementation**

Append to `cli/src/build/onboarding/mcp/engine.ts`:

```ts
/** IO surface the orchestrators depend on. Injected so the flow is testable headlessly. */
export interface EngineDeps {
  cwd: string
  hasSavedKey: () => boolean
  getAppId: () => Promise<string | undefined>
  detectPlatforms: () => Promise<Platform[]>
  isAppRegistered: (appId: string) => Promise<boolean>
  loadProgress: (appId: string) => Promise<OnboardingProgress | null>
}

/** Gather preflight facts via the injected deps. */
export async function gatherFacts(deps: EngineDeps): Promise<PreflightFacts> {
  const appId = await deps.getAppId()
  const authenticated = deps.hasSavedKey()

  if (!appId)
    return { capacitorProject: false, appId: undefined, platformsDetected: [], authenticated, appRegistered: false }

  const platformsDetected = await deps.detectPlatforms()
  const appRegistered = authenticated ? await deps.isAppRegistered(appId) : false
  return { capacitorProject: true, appId, platformsDetected, authenticated, appRegistered }
}

/** Orient/resume. Gathers facts + progress, then runs the pure start decider. */
export async function runStart(deps: EngineDeps): Promise<NextStepResult> {
  const facts = await gatherFacts(deps)
  const progress = facts.appId ? await deps.loadProgress(facts.appId) : null
  return decideStart(facts, progress)
}

/** Advance one step. */
export async function runAdvance(deps: EngineDeps, input?: { platform?: string }): Promise<NextStepResult> {
  const facts = await gatherFacts(deps)
  const progress = facts.appId ? await deps.loadProgress(facts.appId) : null
  return decideAdvance(facts, progress, input)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd cli && bun test/test-mcp-onboarding.mjs`
Expected: PASS — `14 passed, 0 failed`.

- [ ] **Step 5: Commit**

```bash
git add cli/src/build/onboarding/mcp/engine.ts cli/test/test-mcp-onboarding.mjs
git commit -m "feat(cli): add deps-injected onboarding orchestrators"
```

---

### Task 4: MCP tool registration

**Files:**
- Create: `cli/src/build/onboarding/mcp/onboarding-tools.ts`
- Modify: `cli/test/test-mcp-onboarding.mjs`

- [ ] **Step 1: Write the failing test**

Append to `cli/test/test-mcp-onboarding.mjs` before the final results block:

```js
const { registerOnboardingTools } = await import('../src/build/onboarding/mcp/onboarding-tools.ts')

function fakeServer() {
  const tools = {}
  return {
    tools,
    tool(name, _desc, _schema, handler) { tools[name] = { handler } },
  }
}

await test('registerOnboardingTools: registers the two-tool spine', async () => {
  const server = fakeServer()
  registerOnboardingTools(server, /* sdk */ null, fakeDeps())
  ok(server.tools.start_capgo_builder_onboarding, 'start tool registered')
  ok(server.tools.capgo_builder_onboarding_next_step, 'next_step tool registered')
})

await test('registerOnboardingTools: start handler returns rendered text content', async () => {
  const server = fakeServer()
  registerOnboardingTools(server, null, fakeDeps())
  const res = await server.tools.start_capgo_builder_onboarding.handler({})
  ok(Array.isArray(res.content) && res.content[0].type === 'text', 'returns MCP text content')
  ok(res.content[0].text.includes('Capgo Builder onboarding'), 'renders the result')
})

await test('registerOnboardingTools: next_step handler forwards platform input', async () => {
  const server = fakeServer()
  registerOnboardingTools(server, null, fakeDeps({ detectPlatforms: async () => ['ios', 'android'] }))
  const res = await server.tools.capgo_builder_onboarding_next_step.handler({ platform: 'android' })
  ok(res.content[0].text.includes('"platform": "android"'), 'forwards the chosen platform')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd cli && bun test/test-mcp-onboarding.mjs`
Expected: FAIL — `Cannot find module '../src/build/onboarding/mcp/onboarding-tools.ts'`.

- [ ] **Step 3: Write minimal implementation**

Create `cli/src/build/onboarding/mcp/onboarding-tools.ts`:

```ts
// src/build/onboarding/mcp/onboarding-tools.ts
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
import { z } from 'zod'
import type { CapgoSDK } from '../../../sdk.js'
import { findSavedKeySilent, getAppId, getConfig } from '../../../utils.js'
import { getPlatformDirFromCapacitorConfig } from '../../platform-paths.js'
import { loadProgress } from '../progress.js'
import type { Platform } from './contract.js'
import { renderResult } from './contract.js'
import type { EngineDeps } from './engine.js'
import { runAdvance, runStart } from './engine.js'

/** Minimal shape of the MCP server's tool registrar (matches McpServer.tool). */
interface McpLike {
  tool: (
    name: string,
    description: string,
    schema: Record<string, unknown>,
    handler: (args: any) => Promise<{ content: Array<{ type: 'text', text: string }> }>,
  ) => unknown
}

/** Build the real IO deps from the SDK + CLI utils. */
function buildDeps(sdk: CapgoSDK): EngineDeps {
  const cwd = process.cwd()
  return {
    cwd,
    hasSavedKey: () => Boolean(findSavedKeySilent()),
    getAppId: async () => {
      try {
        const ext = await getConfig(true)
        return getAppId(undefined, ext?.config)
      }
      catch {
        return undefined
      }
    },
    detectPlatforms: async () => {
      const out: Platform[] = []
      try {
        const ext = await getConfig(true)
        const iosDir = getPlatformDirFromCapacitorConfig(ext?.config, 'ios')
        const androidDir = getPlatformDirFromCapacitorConfig(ext?.config, 'android')
        if (existsSync(join(cwd, iosDir)))
          out.push('ios')
        if (existsSync(join(cwd, androidDir)))
          out.push('android')
      }
      catch {
        // not a Capacitor project — leave empty
      }
      return out
    },
    isAppRegistered: async (appId: string) => {
      const res = await sdk.listApps()
      if (!res.success || !res.data)
        return false
      return res.data.some((a: { app_id?: string, appId?: string }) => a.app_id === appId || a.appId === appId)
    },
    loadProgress: (appId: string) => loadProgress(appId),
  }
}

/**
 * Register the 2-tool onboarding spine onto an MCP server.
 * `depsOverride` is for tests; production passes only `server` + `sdk`.
 */
export function registerOnboardingTools(server: McpLike, sdk: CapgoSDK, depsOverride?: EngineDeps): void {
  const deps = depsOverride ?? buildDeps(sdk)

  server.tool(
    'start_capgo_builder_onboarding',
    'Start or resume guided Capgo Builder onboarding — set up native iOS/Android cloud builds, signing, and a first cloud build. Call this whenever the user wants to set up, configure, or troubleshoot native builds. Takes no arguments; it inspects the project and returns the first step.',
    {},
    async () => {
      const result = await runStart(deps)
      return { content: [{ type: 'text' as const, text: renderResult(result) }] }
    },
  )

  server.tool(
    'capgo_builder_onboarding_next_step',
    'Advance the guided Capgo Builder onboarding by one step. Call ONLY as directed by the previous result\'s `next`. Pass the user\'s choice (e.g. platform) when the previous step asked for one.',
    {
      platform: z.enum(['ios', 'android']).optional().describe('Platform choice, when the previous step asked for it'),
    },
    async ({ platform }: { platform?: Platform }) => {
      const result = await runAdvance(deps, { platform })
      return { content: [{ type: 'text' as const, text: renderResult(result) }] }
    },
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd cli && bun test/test-mcp-onboarding.mjs`
Expected: PASS — `17 passed, 0 failed`.

- [ ] **Step 5: Commit**

```bash
git add cli/src/build/onboarding/mcp/onboarding-tools.ts cli/test/test-mcp-onboarding.mjs
git commit -m "feat(cli): register the Capgo Builder onboarding 2-tool spine"
```

---

### Task 5: Wire the tools into the MCP server

**Files:**
- Modify: `cli/src/mcp/server.ts`

- [ ] **Step 1: Add the import**

In `cli/src/mcp/server.ts`, add this import alongside the existing imports (after the `import { findSavedKey } from '../utils'` line, matching the file's extensionless import style):

```ts
import { registerOnboardingTools } from '../build/onboarding/mcp/onboarding-tools'
```

- [ ] **Step 2: Register the tools after the SDK is constructed**

In `startMcpServer()`, immediately after the SDK is created:

```ts
  const sdk = new CapgoSDK({ apikey: savedApiKey })
```

add:

```ts
  // Guided Capgo Builder onboarding (2-tool spine: start + next_step).
  registerOnboardingTools(server, sdk)
```

- [ ] **Step 3: Typecheck**

Run: `bun run --cwd cli typecheck`
Expected: PASS (no type errors). If `tsgo` reports an error in the new files, fix the reported type before continuing.

- [ ] **Step 4: Run the onboarding test suite + the existing MCP smoke test**

Run: `cd cli && bun test/test-mcp-onboarding.mjs && node test/test-mcp.mjs`
Expected: onboarding `17 passed, 0 failed`; `test-mcp.mjs` passes (existing MCP server still starts and lists tools, now including the two new ones).

- [ ] **Step 5: Manual smoke (optional but recommended)**

Run the MCP server and confirm the new tools appear and `start` responds:

```bash
cd cli && bun run build
# In an MCP client (or the project's MCP test harness), connect to `npx @capgo/cli mcp`
# and call `start_capgo_builder_onboarding` with {} from a Capacitor project dir.
# Expect a rendered result: a roadmap + either a login gate, a platform-select choice,
# or (single platform) the credentials-phase info step.
```

- [ ] **Step 6: Commit**

```bash
git add cli/src/mcp/server.ts
git commit -m "feat(cli): expose Capgo Builder onboarding tools on the MCP server"
```

---

## Self-Review (completed during planning)

**1. Spec coverage (Plan 1 scope):**
- 2-tool spine (`start` + `next_step`) → Tasks 4–5. ✓
- Result contract with `kind`/`next`/`collect`/`roadmap` + render-as-directive → Task 1. ✓
- Preflight (capacitor project, appId, platforms, auth, app-registered) → Tasks 2–3. ✓
- Login gate with **no chat paste** (terminal login, per the recorded decision) → Task 2 decider + test asserts `not paste`. ✓
- Platform-agnostic core with single-/multi-platform handling → Task 2. ✓
- Resumability hook (`loadProgress` injected; `progress` threaded into deciders) → Task 3. ✓ (Full resume logic per phase arrives with Plans 3–5.)
- Credentials/build phases explicitly **out of Plan 1** → returned as `info` `credentials-not-implemented`; covered by Plans 3–5. ✓ (Intentional scope boundary, not a gap.)

**2. Placeholder scan:** No "TBD"/"add error handling"/"similar to" — every step has complete code and exact commands. The `credentials-not-implemented` state is a deliberate, named milestone boundary, not a placeholder. ✓

**3. Type consistency:** `NextStepResult`, `PreflightFacts`, `EngineDeps` names/fields are identical across contract.ts, engine.ts, onboarding-tools.ts, and the tests. Tool names `start_capgo_builder_onboarding` / `capgo_builder_onboarding_next_step` are identical in engine `next.tool`, onboarding-tools registration, and tests. ✓

**Open items to verify during execution (don't block the plan):**
- Confirm `getConfig(true)` returns `{ config }` (used as `ext?.config`) — mirror `cli/src/build/onboarding/command.ts` if the shape differs.
- Confirm the app-id field on `listApps()` results (`app_id` vs `appId`) — the `isAppRegistered` check handles both; tighten to the real field once confirmed.
- Naming: the user proposed `start_capgo_builder_onboarding`; if you prefer the repo's `capgo_*` prefix convention, rename to `capgo_start_builder_onboarding` consistently across engine `next.tool`, registration, and tests.
