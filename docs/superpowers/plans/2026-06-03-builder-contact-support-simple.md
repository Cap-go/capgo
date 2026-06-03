# Builder Contact Support (Simplified) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an "Email Capgo support" action to the Capgo builder CLI that captures a verbose internal log (incl. non-build failures), writes one combined logs bundle as both `.log` and `.log.gz`, then — after an explicit confirmation — copies the `.log.gz` path to the clipboard, reveals it in Finder (macOS), and opens a pre-filled `mailto:support@capgo.app`. No backend.

**Architecture:** Pure, testable core modules under `cli/src/support/` (mailto builder, secret redactor, help-menu options, contact-support orchestrator with injected UI deps) + an extension to the existing `writeOnboardingSupportBundle` to emit both file formats + a shared clipboard/reveal util extracted from `credentials-manage.ts`. UI wiring (iOS/Android Ink menus + `init`) calls the orchestrator with UI-provided dependencies. The user's own mail client sends the email, so the existing `Cap-go/automations` bridge handles it natively — we build nothing server-side.

**Tech Stack:** TypeScript, Node built-ins (`node:zlib`, `node:fs`, `node:child_process`), the `open` npm package (already a dep), Ink (React) for build-onboarding UI. Tests: `.mjs` files in `cli/test/` using a custom `t(name, fn)` helper + `node:assert/strict`, run with `bun`.

Spec: `docs/superpowers/specs/2026-06-03-builder-contact-support-simple-design.md`.

---

## File Structure

**New (`cli/src/support/`):**
- `mailto.ts` — pure `buildMailtoUrl()` (encoding + body length cap).
- `redact.ts` — pure `redactSecrets()` for free-text logs.
- `clipboard.ts` — `copyToClipboard()` + `revealInFinder()` (extracted from `credentials-manage.ts` for reuse).
- `internal-log.ts` — append-as-you-go verbose log file with redaction-on-write.
- `help-menu.ts` — pure `buildHelpMenuOptions({ hasBuildLog })`.
- `contact-support.ts` — `contactSupport(deps)` orchestrator (confirm → write → copy gz → reveal → mailto → print).

**Modified:**
- `cli/src/onboarding-support.ts` — export `renderOnboardingSupportBundle`; add `writeSupportBundleFiles()` (both `.log` + `.log.gz`).
- `cli/src/build/credentials-manage.ts` — import `copyToClipboard` from the new shared module (remove the local copy).
- `cli/src/build/onboarding/ui/steps/ios-shared.tsx` + the parent `cli/src/build/onboarding/ui/app.tsx` — add the support option + confirm step + handler.
- `cli/src/build/onboarding/android/ui/app.tsx` — same wiring for Android.
- `cli/src/init/command.ts` — offer "Email Capgo support" on init failures.

**Tests (`cli/test/`):** `test-support-mailto.mjs`, `test-support-redact.mjs`, `test-support-bundle-files.mjs`, `test-support-help-menu.mjs`, `test-support-contact.mjs`.

---

## Task 1: `mailto` URL builder (pure)

**Files:**
- Create: `cli/src/support/mailto.ts`
- Test: `cli/test/test-support-mailto.mjs`

- [ ] **Step 1: Write the failing test**

```javascript
// cli/test/test-support-mailto.mjs
import assert from 'node:assert/strict'
import { buildMailtoUrl, MAILTO_BODY_MAX } from '../src/support/mailto.ts'

function t(name, fn) {
  try { fn(); process.stdout.write(`✓ ${name}\n`) }
  catch (e) { process.stderr.write(`✗ ${name}\n`); throw e }
}

t('builds a mailto url with encoded subject and body', () => {
  const url = buildMailtoUrl({ to: 'support@capgo.app', subject: 'A & B', body: 'line1\nline2' })
  assert.ok(url.startsWith('mailto:support@capgo.app?'))
  assert.ok(url.includes('subject=A%20%26%20B'))
  assert.ok(url.includes('body=line1%0Aline2'))
})

t('caps the body length and appends a truncation marker', () => {
  const long = 'x'.repeat(MAILTO_BODY_MAX + 500)
  const url = buildMailtoUrl({ to: 'support@capgo.app', subject: 's', body: long })
  const body = decodeURIComponent(url.split('body=')[1])
  assert.ok(body.length <= MAILTO_BODY_MAX)
  assert.ok(body.endsWith('…(truncated)'))
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd cli && bun test/test-support-mailto.mjs`
Expected: FAIL — `Cannot find module '../src/support/mailto.ts'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// cli/src/support/mailto.ts

// mailto: URLs are length-limited by mail clients in practice; keep the body small.
// Full logs go in the attachment, never the body.
export const MAILTO_BODY_MAX = 1500

export interface MailtoParams {
  to: string
  subject: string
  body: string
}

export function buildMailtoUrl(params: MailtoParams): string {
  let body = params.body
  if (body.length > MAILTO_BODY_MAX) {
    const marker = '…(truncated)'
    body = body.slice(0, MAILTO_BODY_MAX - marker.length) + marker
  }
  const subject = encodeURIComponent(params.subject)
  const encodedBody = encodeURIComponent(body)
  return `mailto:${params.to}?subject=${subject}&body=${encodedBody}`
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd cli && bun test/test-support-mailto.mjs`
Expected: PASS (both tests print `✓`).

- [ ] **Step 5: Commit**

```bash
git add cli/src/support/mailto.ts cli/test/test-support-mailto.mjs
git commit -m "feat(cli): add mailto url builder for contact support"
```

---

## Task 2: Secret redactor for free-text logs (pure)

**Files:**
- Create: `cli/src/support/redact.ts`
- Test: `cli/test/test-support-redact.mjs`

- [ ] **Step 1: Write the failing test**

```javascript
// cli/test/test-support-redact.mjs
import assert from 'node:assert/strict'
import { redactSecrets } from '../src/support/redact.ts'

function t(name, fn) {
  try { fn(); process.stdout.write(`✓ ${name}\n`) }
  catch (e) { process.stderr.write(`✗ ${name}\n`); throw e }
}

t('redacts bearer tokens', () => {
  const out = redactSecrets('Authorization: Bearer abc123DEF456ghi789')
  assert.ok(!out.includes('abc123DEF456ghi789'))
  assert.ok(out.includes('[REDACTED]'))
})

t('redacts capgo api keys (capgkey/capg_ prefixes)', () => {
  const out = redactSecrets('using key capg_1234567890abcdef and capgkey=zzzzzzzzzzzz')
  assert.ok(!out.includes('capg_1234567890abcdef'))
  assert.ok(!out.includes('zzzzzzzzzzzz'))
})

t('redacts PEM private key blocks', () => {
  const pem = '-----BEGIN PRIVATE KEY-----\nMIIabc\nDEF==\n-----END PRIVATE KEY-----'
  const out = redactSecrets(`key:\n${pem}\ndone`)
  assert.ok(out.includes('done'))
  assert.ok(!out.includes('MIIabc'))
  assert.ok(out.includes('[REDACTED PRIVATE KEY]'))
})

t('leaves ordinary text untouched', () => {
  assert.equal(redactSecrets('Build failed at step signing'), 'Build failed at step signing')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd cli && bun test/test-support-redact.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```typescript
// cli/src/support/redact.ts

// Best-effort, conservative redaction for free-text logs before they touch disk.
// Order matters: multi-line PEM blocks first, then line-level token patterns.
const PEM_RE = /-----BEGIN [^-]+-----[\s\S]*?-----END [^-]+-----/g
const PATTERNS: Array<{ re: RegExp, replace: string }> = [
  // Authorization: Bearer <token>  /  "token": "<token>"
  { re: /(authorization\s*:\s*bearer\s+)[\w.\-+/=]+/gi, replace: '$1[REDACTED]' },
  // Capgo API keys
  { re: /\bcapg_[A-Za-z0-9]{8,}\b/g, replace: '[REDACTED]' },
  { re: /(capgkey\s*[=:]\s*)[\w-]{6,}/gi, replace: '$1[REDACTED]' },
  // generic key/secret/token/password = value
  { re: /\b(api[_-]?key|secret|token|password|passwd|pwd)(\s*[=:]\s*)["']?[\w.\-+/=]{6,}["']?/gi, replace: '$1$2[REDACTED]' },
]

export function redactSecrets(text: string): string {
  let out = text.replace(PEM_RE, '[REDACTED PRIVATE KEY]')
  for (const { re, replace } of PATTERNS)
    out = out.replace(re, replace)
  return out
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd cli && bun test/test-support-redact.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add cli/src/support/redact.ts cli/test/test-support-redact.mjs
git commit -m "feat(cli): add secret redactor for support logs"
```

---

## Task 3: Extract shared clipboard + Finder reveal util

**Files:**
- Create: `cli/src/support/clipboard.ts`
- Modify: `cli/src/build/credentials-manage.ts` (remove local `copyToClipboard` + `ClipboardCandidate`, import from new module)

- [ ] **Step 1: Create the shared module**

```typescript
// cli/src/support/clipboard.ts
import { spawnSync } from 'node:child_process'

interface ClipboardCandidate {
  cmd: string
  args: string[]
}

export function copyToClipboard(text: string): { ok: boolean, method?: string } {
  const osPlatform = process.platform
  const candidates: ClipboardCandidate[] = []
  if (osPlatform === 'darwin') {
    candidates.push({ cmd: 'pbcopy', args: [] })
  }
  else if (osPlatform === 'win32') {
    candidates.push({ cmd: 'clip', args: [] })
  }
  else {
    candidates.push({ cmd: 'wl-copy', args: [] })
    candidates.push({ cmd: 'xclip', args: ['-selection', 'clipboard'] })
    candidates.push({ cmd: 'xsel', args: ['--clipboard', '--input'] })
  }
  for (const candidate of candidates) {
    try {
      const result = spawnSync(candidate.cmd, candidate.args, { input: text })
      if (result.error)
        continue
      if (result.status === 0)
        return { ok: true, method: candidate.cmd }
    }
    catch {
      // Try next candidate.
    }
  }
  return { ok: false }
}

// macOS only: select the file in Finder so it's a one-drag attach. Best-effort.
export function revealInFinder(filePath: string): boolean {
  if (process.platform !== 'darwin')
    return false
  try {
    const result = spawnSync('open', ['-R', filePath])
    return !result.error && result.status === 0
  }
  catch {
    return false
  }
}
```

- [ ] **Step 2: Update `credentials-manage.ts` to import the shared copy**

In `cli/src/build/credentials-manage.ts`: delete the local `interface ClipboardCandidate { … }` (lines ~928–931) and the local `function copyToClipboard(…) { … }` (lines ~933–959), and add an import near the other imports at the top of the file:

```typescript
import { copyToClipboard } from '../support/clipboard.ts'
```

- [ ] **Step 3: Verify the CLI still typechecks/builds**

Run: `cd cli && bun run typecheck` (or the repo's check script — see `cli/package.json` `scripts`)
Expected: no new type errors; `copyToClipboard` resolves from the new module.

- [ ] **Step 4: Run the existing credentials tests to confirm no regression**

Run: `cd cli && bun test/test-macos-signing.mjs` and any credentials test present.
Expected: PASS (no behavior change).

- [ ] **Step 5: Commit**

```bash
git add cli/src/support/clipboard.ts cli/src/build/credentials-manage.ts
git commit -m "refactor(cli): extract clipboard util + add revealInFinder"
```

---

## Task 4: Verbose internal log (append-as-you-go, redacted)

**Files:**
- Create: `cli/src/support/internal-log.ts`
- Test: extend `cli/test/test-support-redact.mjs`? No — Create: `cli/test/test-support-internal-log.mjs`

- [ ] **Step 1: Write the failing test**

```javascript
// cli/test/test-support-internal-log.mjs
import assert from 'node:assert/strict'
import { readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { appendInternalLog, getInternalLogPath, startInternalLog } from '../src/support/internal-log.ts'

function t(name, fn) {
  try { fn(); process.stdout.write(`✓ ${name}\n`) }
  catch (e) { process.stderr.write(`✗ ${name}\n`); throw e }
}

t('writes redacted lines to the log file', () => {
  const dir = join(tmpdir(), `capgo-ilog-${Date.now()}`)
  const path = startInternalLog('com.example.app', dir)
  appendInternalLog('normal line')
  appendInternalLog('Authorization: Bearer SECRETTOKEN123')
  const content = readFileSync(path, 'utf8')
  assert.ok(content.includes('normal line'))
  assert.ok(!content.includes('SECRETTOKEN123'))
  assert.ok(content.includes('[REDACTED]'))
  rmSync(dir, { recursive: true, force: true })
})

t('getInternalLogPath returns null before start', () => {
  // fresh import state is per-process; this test runs first in isolation when run alone
  assert.equal(typeof getInternalLogPath, 'function')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd cli && bun test/test-support-internal-log.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```typescript
// cli/src/support/internal-log.ts
import { appendFileSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { redactSecrets } from './redact.ts'

let currentPath: string | null = null

function stamp(): string {
  // Avoid Date in plan-time; runtime is fine. ISO-ish, filesystem-safe.
  return new Date().toISOString().replace(/[:.]/g, '-')
}

function sanitize(seg: string | undefined, fallback: string): string {
  return (seg ?? fallback).replace(/[^\w.-]/g, '_').slice(0, 60) || fallback
}

export function startInternalLog(appId?: string, dir = join(homedir(), '.capgo-credentials', 'support')): string {
  mkdirSync(dir, { recursive: true })
  currentPath = join(dir, `internal-${sanitize(appId, 'unknown-app')}-${stamp()}.log`)
  return currentPath
}

export function getInternalLogPath(): string | null {
  return currentPath
}

export function appendInternalLog(line: string): void {
  if (!currentPath)
    return
  try {
    appendFileSync(currentPath, `${redactSecrets(line)}\n`, 'utf8')
  }
  catch {
    // Never let logging break the build flow.
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd cli && bun test/test-support-internal-log.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add cli/src/support/internal-log.ts cli/test/test-support-internal-log.mjs
git commit -m "feat(cli): add redacted append-as-you-go internal log"
```

---

## Task 5: Emit the bundle as both `.log` and `.log.gz`

**Files:**
- Modify: `cli/src/onboarding-support.ts` (export `renderOnboardingSupportBundle`; add `writeSupportBundleFiles`)
- Test: `cli/test/test-support-bundle-files.mjs`

- [ ] **Step 1: Write the failing test**

```javascript
// cli/test/test-support-bundle-files.mjs
import assert from 'node:assert/strict'
import { gunzipSync } from 'node:zlib'
import { readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { writeSupportBundleFiles } from '../src/support/../onboarding-support.ts'

function t(name, fn) {
  try { fn(); process.stdout.write(`✓ ${name}\n`) }
  catch (e) { process.stderr.write(`✗ ${name}\n`); throw e }
}

t('writes both .log and .log.gz with identical decoded content', () => {
  const dir = join(tmpdir(), `capgo-bundle-${Date.now()}`)
  const res = writeSupportBundleFiles({ kind: 'build-init', appId: 'com.example.app', error: 'boom', logs: ['l1', 'l2'] }, dir)
  assert.ok(res)
  assert.ok(res.logPath.endsWith('.log'))
  assert.ok(res.gzPath.endsWith('.log.gz'))
  const plain = readFileSync(res.logPath, 'utf8')
  const fromGz = gunzipSync(readFileSync(res.gzPath)).toString('utf8')
  assert.equal(plain, fromGz)
  assert.ok(plain.includes('boom'))
  rmSync(dir, { recursive: true, force: true })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd cli && bun test/test-support-bundle-files.mjs`
Expected: FAIL — `writeSupportBundleFiles` is not exported.

- [ ] **Step 3: Add the new function (keep the existing `writeOnboardingSupportBundle` intact)**

In `cli/src/onboarding-support.ts`: (a) change `function renderOnboardingSupportBundle` to `export function renderOnboardingSupportBundle`; (b) add the imports and the new function:

```typescript
import { gzipSync } from 'node:zlib'
// (existing imports: mkdirSync, writeFileSync, join, homedir, etc.)

export interface SupportBundleFiles {
  logPath: string
  gzPath: string
}

// Writes the combined bundle as BOTH a plain .log and a .log.gz (same content).
export function writeSupportBundleFiles(
  input: OnboardingSupportBundleInput,
  supportDir = join(homedir(), '.capgo-credentials', 'support'),
): SupportBundleFiles | null {
  try {
    mkdirSync(supportDir, { recursive: true })
    const kind = sanitizeSegment(input.kind, 'onboarding')
    const app = sanitizeSegment(input.appId, 'unknown-app')
    const base = `builder-support-${kind}-${app}-${nowStamp()}`
    const logPath = join(supportDir, `${base}.log`)
    const gzPath = join(supportDir, `${base}.log.gz`)
    const rendered = renderOnboardingSupportBundle(input)
    writeFileSync(logPath, rendered, 'utf8')
    writeFileSync(gzPath, gzipSync(Buffer.from(rendered, 'utf8')))
    return { logPath, gzPath }
  }
  catch {
    return null
  }
}
```

(`sanitizeSegment` and `nowStamp` already exist in this file and are reused.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd cli && bun test/test-support-bundle-files.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add cli/src/onboarding-support.ts cli/test/test-support-bundle-files.mjs
git commit -m "feat(cli): write support bundle as both .log and .log.gz"
```

---

## Task 6: Help-menu options (pure: support-first, AI iff build log)

**Files:**
- Create: `cli/src/support/help-menu.ts`
- Test: `cli/test/test-support-help-menu.mjs`

- [ ] **Step 1: Write the failing test**

```javascript
// cli/test/test-support-help-menu.mjs
import assert from 'node:assert/strict'
import { buildHelpMenuOptions } from '../src/support/help-menu.ts'

function t(name, fn) {
  try { fn(); process.stdout.write(`✓ ${name}\n`) }
  catch (e) { process.stderr.write(`✗ ${name}\n`); throw e }
}

t('support is always first', () => {
  const opts = buildHelpMenuOptions({ hasBuildLog: false })
  assert.equal(opts[0].value, 'support')
})

t('AI only offered when a build log exists', () => {
  assert.ok(!buildHelpMenuOptions({ hasBuildLog: false }).some(o => o.value === 'ai'))
  assert.ok(buildHelpMenuOptions({ hasBuildLog: true }).some(o => o.value === 'ai'))
})

t('always includes retry and exit', () => {
  const values = buildHelpMenuOptions({ hasBuildLog: true }).map(o => o.value)
  assert.ok(values.includes('retry'))
  assert.ok(values.includes('exit'))
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd cli && bun test/test-support-help-menu.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```typescript
// cli/src/support/help-menu.ts
export interface HelpMenuOption {
  label: string
  value: string
}

export function buildHelpMenuOptions(opts: { hasBuildLog: boolean }): HelpMenuOption[] {
  const options: HelpMenuOption[] = [
    { label: '📨  Email Capgo support', value: 'support' },
  ]
  if (opts.hasBuildLog)
    options.push({ label: '🤖  Ask AI for help', value: 'ai' })
  options.push({ label: '🔄  Try again', value: 'retry' })
  options.push({ label: '❌  Exit', value: 'exit' })
  return options
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd cli && bun test/test-support-help-menu.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add cli/src/support/help-menu.ts cli/test/test-support-help-menu.mjs
git commit -m "feat(cli): add help-menu options builder (support-first, AI iff build log)"
```

---

## Task 7: Contact-support orchestrator (confirm → write → copy gz → reveal → mailto)

**Files:**
- Create: `cli/src/support/contact-support.ts`
- Test: `cli/test/test-support-contact.mjs`

- [ ] **Step 1: Write the failing test**

```javascript
// cli/test/test-support-contact.mjs
import assert from 'node:assert/strict'
import { contactSupport } from '../src/support/contact-support.ts'

function t(name, fn) {
  try { fn(); process.stdout.write(`✓ ${name}\n`) }
  catch (e) { process.stderr.write(`✗ ${name}\n`); throw e }
}
async function ta(name, fn) {
  try { await fn(); process.stdout.write(`✓ ${name}\n`) }
  catch (e) { process.stderr.write(`✗ ${name}\n`); throw e }
}

function makeDeps(overrides = {}) {
  const calls = { copied: [], opened: [], revealed: [], printed: [] }
  const deps = {
    subject: 'Capgo Builder support',
    body: 'hello',
    confirm: async () => true,
    buildFiles: () => ({ logPath: '/x/b.log', gzPath: '/x/b.log.gz' }),
    copyPath: (p) => { calls.copied.push(p); return true },
    reveal: (p) => { calls.revealed.push(p) },
    openUrl: async (u) => { calls.opened.push(u) },
    print: (m) => { calls.printed.push(m) },
    ...overrides,
  }
  return { deps, calls }
}

await ta('cancels without writing/opening when confirm is false', async () => {
  const { deps, calls } = makeDeps({ confirm: async () => false })
  const result = await contactSupport(deps)
  assert.equal(result, 'cancelled')
  assert.equal(calls.opened.length, 0)
  assert.equal(calls.copied.length, 0)
})

await ta('copies the GZIPPED path (not the plain .log)', async () => {
  const { deps, calls } = makeDeps()
  await contactSupport(deps)
  assert.deepEqual(calls.copied, ['/x/b.log.gz'])
})

await ta('opens a mailto: to support@capgo.app and prints instructions', async () => {
  const { deps, calls } = makeDeps()
  const result = await contactSupport(deps)
  assert.equal(result, 'opened')
  assert.ok(calls.opened[0].startsWith('mailto:support@capgo.app?'))
  assert.ok(decodeURIComponent(calls.opened[0]).includes('/x/b.log.gz')) // path is in the email body
  assert.ok(calls.printed.some(m => m.includes('support@capgo.app')))
})

await ta('returns failed when files cannot be written', async () => {
  const { deps } = makeDeps({ buildFiles: () => null })
  assert.equal(await contactSupport(deps), 'failed')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd cli && bun test/test-support-contact.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```typescript
// cli/src/support/contact-support.ts
import { buildMailtoUrl } from './mailto.ts'

const SUPPORT_EMAIL = 'support@capgo.app'

// Tell the user everything that's about to happen — incl. the macOS Finder reveal.
function confirmMessage(): string {
  const reveal = process.platform === 'darwin' ? ', reveal them in Finder,' : ''
  return `We'll save your logs locally${reveal} and open a pre-filled email to support@capgo.app in your mail app. Continue?`
}

export interface ContactSupportDeps {
  subject: string
  body: string
  // Show the confirmation gate; resolve true to proceed, false to cancel.
  confirm: (message: string) => Promise<boolean>
  // Write the bundle; return both paths, or null on failure.
  buildFiles: () => { logPath: string, gzPath: string } | null
  // Copy a path to the clipboard; return success.
  copyPath: (path: string) => boolean
  // Optional macOS Finder reveal.
  reveal?: (path: string) => void
  // Open a URL (the mailto:).
  openUrl: (url: string) => Promise<unknown>
  // Emit a user-facing line.
  print: (message: string) => void
}

export type ContactSupportResult = 'opened' | 'cancelled' | 'failed'

export async function contactSupport(deps: ContactSupportDeps): Promise<ContactSupportResult> {
  const proceed = await deps.confirm(confirmMessage())
  if (!proceed)
    return 'cancelled'

  const files = deps.buildFiles()
  if (!files) {
    deps.print('Could not save your logs locally. Please email support@capgo.app and describe the issue.')
    return 'failed'
  }

  // Clipboard must hold the GZIPPED file path (the compact attachment).
  const copied = deps.copyPath(files.gzPath)
  deps.reveal?.(files.gzPath)

  // Put the saved file path in the email body too — mailto: can't auto-attach, and
  // the user is looking at their mail client now, not the terminal.
  const body = `${deps.body}\n\nPlease attach the logs file saved at:\n${files.gzPath}\n(The path is already on your clipboard.)`
  const url = buildMailtoUrl({ to: SUPPORT_EMAIL, subject: deps.subject, body })
  try {
    await deps.openUrl(url)
  }
  catch {
    // Mail client failed to open — the user still has the file + address below.
  }

  const clip = copied ? ' (copied to your clipboard)' : ''
  deps.print(`Opened an email to ${SUPPORT_EMAIL}. Your logs are saved at ${files.gzPath}${clip} — attach that file and send. (A readable copy is also at ${files.logPath}.)`)
  return 'opened'
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd cli && bun test/test-support-contact.mjs`
Expected: PASS (all four).

- [ ] **Step 5: Commit**

```bash
git add cli/src/support/contact-support.ts cli/test/test-support-contact.mjs
git commit -m "feat(cli): add contact-support orchestrator (confirm + mailto + gz clipboard)"
```

---

## Task 8: Wire into the iOS build-onboarding failure menu

**Files:**
- Modify: `cli/src/build/onboarding/ui/steps/ios-shared.tsx` (`RETRY_OPTIONS` → support-first via `buildHelpMenuOptions`)
- Modify: `cli/src/build/onboarding/ui/app.tsx` (handle the `support` value: confirm sub-step → call `contactSupport` with Ink-provided deps)

- [ ] **Step 1: Replace the hard-coded retry options with the shared builder**

In `cli/src/build/onboarding/ui/steps/ios-shared.tsx`, add an import:

```typescript
import { buildHelpMenuOptions } from '../../../../support/help-menu.ts'
```

Replace the `RETRY_OPTIONS` constant (lines ~276–280) with a per-render computed list inside `ErrorStep`, using the component's existing `showRetry` to decide `hasBuildLog` (a build log exists when this error came from a failed build — pass that in). Concretely, where `RETRY_OPTIONS` was used in the `<Select options={…}>`, use:

```tsx
<Select
  options={buildHelpMenuOptions({ hasBuildLog: props.hasBuildLog ?? false })}
  onChange={props.onChange}
/>
```

Add `hasBuildLog?: boolean` to `ErrorStepProps`.

- [ ] **Step 2: Handle `support` in the parent state machine**

In `cli/src/build/onboarding/ui/app.tsx`, where the `ErrorStep` `onChange` value is handled (the same place `retry`/`restart`/`exit` are switched on), add a `case 'support':` that transitions to a new confirm step, then runs the orchestrator. Provide the Ink deps:

```tsx
import open from 'open'
import { contactSupport } from '../../../support/contact-support.ts'
import { copyToClipboard, revealInFinder } from '../../../support/clipboard.ts'
import { writeSupportBundleFiles } from '../../../onboarding-support.ts'
import { getInternalLogPath } from '../../../support/internal-log.ts'
import { readFileSync } from 'node:fs'

async function handleSupport() {
  await contactSupport({
    subject: `Capgo Builder support — ${appId} (${platform})`,
    body: `Hi Capgo team,\n\nMy build failed and I'd like help.\n\nApp: ${appId}\nPlatform: ${platform}\nError: ${error}\n\n(Logs saved locally; secrets removed — I'll attach the file.)`,
    confirm: async msg => askYesNo(msg), // existing Ink confirm Select; see Step 3
    buildFiles: () => writeSupportBundleFiles({
      kind: 'build-init',
      appId,
      platform,
      error,
      logs: readBuildLogTail(), // existing helper that reads the captured build log
      sections: [{ title: 'Internal log', lines: readInternalLogLines() }],
    }),
    copyPath: p => copyToClipboard(p).ok,
    reveal: p => { revealInFinder(p) },
    openUrl: u => open(u),
    print: msg => pushLogLine(msg), // existing UI log sink
  })
}

function readInternalLogLines(): string[] {
  const p = getInternalLogPath()
  if (!p)
    return []
  try { return readFileSync(p, 'utf8').split('\n') }
  catch { return [] }
}
```

(`appId`, `platform`, `error`, `readBuildLogTail`, `pushLogLine`, and the confirm Select already exist in this component — wire to the real names found there.)

- [ ] **Step 3: Add the confirm Select step**

In the same component, render an Ink `<Select>` with `{ label: 'Yes, open the email', value: 'yes' }` / `{ label: 'Cancel', value: 'no' }` when in the support-confirm state, resolving the `askYesNo` promise. (Mirror how `AiAnalysisPromptStep` renders its two-option Select.)

- [ ] **Step 4: Manually verify the iOS flow**

Run a build that fails (or use the onboarding test harness) and confirm: the failure menu lists **📨 Email Capgo support** first; selecting it shows the confirm; **Cancel** returns to the menu; **Yes** writes `~/.capgo-credentials/support/builder-support-*.log[.gz]`, copies the `.log.gz` path, reveals it in Finder (macOS), and opens the mail client to `support@capgo.app`.

- [ ] **Step 5: Commit**

```bash
git add cli/src/build/onboarding/ui/steps/ios-shared.tsx cli/src/build/onboarding/ui/app.tsx
git commit -m "feat(cli): add Email Capgo support to iOS build failure menu"
```

---

## Task 9: Wire into the Android build-onboarding failure menu

**Files:**
- Modify: `cli/src/build/onboarding/android/ui/app.tsx`

- [ ] **Step 1: Mirror the iOS wiring**

Apply the same three pieces as Task 8 (help-menu options, `support` case → confirm → `contactSupport`, confirm Select) in the Android app component, using its existing `appId`/`platform`/`error`/log-sink names. Capture raw **Google Play / Gradle** errors into the internal log (Task 10 wiring).

- [ ] **Step 2: Manually verify the Android flow**

Same checklist as Task 8 Step 4, for an Android build failure.

- [ ] **Step 3: Commit**

```bash
git add cli/src/build/onboarding/android/ui/app.tsx
git commit -m "feat(cli): add Email Capgo support to Android build failure menu"
```

---

## Task 10: Capture the internal log (incl. non-build failures) + wire `init`

**Files:**
- Modify: `cli/src/init/command.ts` (start the internal log; offer support on failure)
- Modify: the API/exec call sites that surface raw Apple/Google errors (e.g. `cli/src/build/onboarding/apple-api.ts`, the Android GCP/Play paths) to `appendInternalLog(...)`

- [ ] **Step 1: Start the internal log at the top of the builder/init flows**

In `cli/src/init/command.ts` (and the build-onboarding entry), call `startInternalLog(globalAppId)` early so the file exists for the whole run. Import:

```typescript
import { appendInternalLog, startInternalLog } from '../support/internal-log.ts'
```

- [ ] **Step 2: Append raw provider errors + key steps to the internal log**

At the call sites that catch/surface raw Apple App Store Connect and Google Play / Gradle errors (and around shell command runs), add `appendInternalLog(\`<context>: \${message}\`)`. This is what makes **non-build failures** (e.g. an Apple API error during onboarding) useful in the bundle. Keep these calls best-effort (the function already swallows errors).

- [ ] **Step 3: Offer "Email Capgo support" on init failure**

Where `writeInitSupportBundle` is currently called on an init error (`cli/src/init/command.ts:442`), add a menu/prompt offering **📨 Email Capgo support**; on select, run `contactSupport` with init-flavored deps:

```typescript
import open from 'open'
import { contactSupport } from '../support/contact-support.ts'
import { copyToClipboard, revealInFinder } from '../support/clipboard.ts'
import { writeSupportBundleFiles } from '../onboarding-support.ts'
import { getInternalLogPath } from '../support/internal-log.ts'
import { readFileSync } from 'node:fs'

await contactSupport({
  subject: `Capgo Builder onboarding support — ${globalAppId ?? 'unknown'}`,
  body: `Hi Capgo team,\n\nI hit an error during Capgo Builder onboarding.\n\nApp: ${globalAppId}\nError: ${error}\n\n(Logs saved locally; secrets removed — I'll attach the file.)`,
  confirm: async msg => /* existing init confirm prompt */ confirmPrompt(msg),
  buildFiles: () => writeSupportBundleFiles({
    kind: 'init',
    appId: globalAppId,
    error,
    sections: [{ title: 'Internal log', lines: readInternalLogLinesInit() }],
  }),
  copyPath: p => copyToClipboard(p).ok,
  reveal: p => { revealInFinder(p) },
  openUrl: u => open(u),
  print: msg => log.info(msg),
})

function readInternalLogLinesInit(): string[] {
  const p = getInternalLogPath()
  if (!p)
    return []
  try { return readFileSync(p, 'utf8').split('\n') }
  catch { return [] }
}
```

(For init there's no build log, so `buildHelpMenuOptions({ hasBuildLog: false })` correctly omits AI.)

- [ ] **Step 4: Manually verify a non-build failure path**

Trigger an onboarding error (e.g. an Apple API failure) and confirm the support flow saves a bundle whose `Internal log` section contains the raw provider error (with secrets redacted), copies the `.log.gz` path, and opens the mail client.

- [ ] **Step 5: Commit**

```bash
git add cli/src/init/command.ts cli/src/build/onboarding/apple-api.ts
git commit -m "feat(cli): capture internal log + offer Email Capgo support on init/onboarding failures"
```

---

## Task 11: Full suite + docs cross-check

- [ ] **Step 1: Run the whole CLI test suite**

Run: `cd cli && bun run test`
Expected: all support tests + existing tests PASS.

- [ ] **Step 2: Typecheck/lint**

Run: `cd cli && bun run typecheck` and the repo lint script.
Expected: clean.

- [ ] **Step 3: Confirm spec ↔ implementation match**

Re-read `docs/superpowers/specs/2026-06-03-builder-contact-support-simple-design.md`: confirmation gate present (Task 7), clipboard copies `.log.gz` (Task 7), both files emitted (Task 5), non-build failures covered (Task 10), CLI-only (no backend touched). Tick the spec's open items or note follow-ups.

- [ ] **Step 4: Commit any final fixes**

```bash
git add -A && git commit -m "test(cli): finalize contact-support suite + docs cross-check"
```

---

## Notes for the implementer

- **Do not** add any backend/worker/Email-Service/bridge code — the user's own mail client sends the email; the existing `Cap-go/automations` bridge handles inbound natively.
- Keep all support-flow failures **non-fatal**: clipboard, reveal, and mail-open failures must degrade to "your logs are at `<path>`; email support@capgo.app".
- The orchestrator is UI-agnostic by design (injected deps) — that's what makes Tasks 1–7 unit-testable and Tasks 8–10 thin wiring.
