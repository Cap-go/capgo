# Precompiled macOS Keychain Helper Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the keychain-export logic as a precompiled, Developer-ID-signed, notarized generic `helper` binary in per-arch npm packages (`@capgo/cli-keychain-darwin-arm64` / `-x64`), invoked as `helper keychain-export …`, verified at runtime by the CLI, with the runtime swiftc compilation path deleted.

**Architecture:** A new `cli-helper/` monorepo dir owns the Swift source (`helper.swift`, a single binary with subcommand dispatch) and two binary-only npm packages. A manually dispatched (`workflow_dispatch` with a `version` input) GitHub Actions workflow on `macos-latest` builds both arch slices, codesigns with hardened runtime, notarizes via `notarytool`, publishes with npm provenance, and creates the `cli-helper-X.Y.Z` tag + release. The CLI resolves the arch-matching package at runtime, verifies its code signature against Capgo's Apple Team ID via a `codesign` designated-requirement check, and hard-errors with install guidance when anything is missing — no compile fallback. A dev-only `CAPGO_KEYCHAIN_HELPER_PATH` env override is dead-code-eliminated from release builds via a `Bun.build` define. The sensitive `keychain-export` subcommand carries an anti-footgun gate (internal handshake flag + non-TTY stdout) documented as a non-security-boundary in `cli-helper/SECURITY.md`.

**Tech Stack:** Swift (Security framework), Bun build pipeline, Node `createRequire` resolution, GitHub Actions (macos-latest), `codesign`/`notarytool`, npm provenance.

**Spec:** `docs/superpowers/specs/2026-06-06-keychain-helper-precompile-design.md`

**⚠️ Sequencing constraint:** Task 9 (adding `optionalDependencies` to `cli/package.json`) MUST NOT merge to main until helper 1.0.0 is live on npm (Task 13). Otherwise `bun install --frozen-lockfile` in every CI job fails resolving the not-yet-published packages. Tasks 1–8 and 10–11 are safe to merge any time (the helper workflow only runs on manual `workflow_dispatch`, never automatically). The CLI release (Task 13) comes last.

**⚠️ User input needed during execution:**
- Task 4 / Task 12: Capgo's Apple **Team ID** (10-char, the `subject.OU` of the Developer ID cert). Likely `UVTJ336J2D` (appears in existing test fixtures as "digital shift oü (UVTJ336J2D)") — **confirm with the user before hardcoding**.
- Task 12: Apple Developer portal actions (cert creation) and GitHub secrets — user-performed, agent-guided.

---

## File structure

**Created:**

| Path | Responsibility |
| --- | --- |
| `cli-helper/src/helper.swift` | Swift source (git-moved+renamed from `cli/src/build/onboarding/keychain-export.swift`); one binary, subcommand dispatch, anti-footgun gate |
| `cli-helper/npm/darwin-arm64/package.json` | arm64 npm package manifest |
| `cli-helper/npm/darwin-x64/package.json` | x64 npm package manifest |
| `cli-helper/scripts/build.sh` | swiftc per-arch builds → `cli-helper/dist/` |
| `cli-helper/scripts/sign-and-notarize.sh` | codesign + notarytool + verify, both binaries |
| `cli-helper/scripts/prepare-publish.mjs` | stamp tag version into manifests, copy binaries into packages |
| `cli-helper/SECURITY.md` | threat model — macOS Keychain ACL is the boundary; reporting expectation |
| `cli-helper/README.md` | purpose, dev bootstrap, release runbook |
| `.github/workflows/publish_cli_helper.yml` | tag-triggered build/sign/notarize/publish |

**Modified:**

| Path | Change |
| --- | --- |
| `cli/src/build/onboarding/macos-signing.ts` | delete compile path; add `helperPackageName`, `helperSignatureRequirement`, `resolveHelperBinary`, `verifyHelperSignature`; add `FORBIDDEN_CALLER` to the result-code union; invoke with `keychain-export` subcommand + handshake |
| `cli/src/build/onboarding/types.ts` | remove `'import-compiling-helper'` step (union L51, `STEP_PROGRESS` L257, `getPhaseLabel` case L341) |
| `cli/src/build/onboarding/ui/app.tsx` | remove compiling-helper effect (L1728-1744), `isHelperCached` branch (L4268), render line (L4282), imports (L50, L107) |
| `cli/src/build/onboarding/ui/steps/ios-import.tsx` | delete `ImportCompilingHelperStep` component + props (L412-~460) |
| `cli/build.mjs` | externals for helper packages; `__CAPGO_ALLOW_HELPER_ENV_OVERRIDE__` define; delete `.swift` copy (L408-415) |
| `cli/package.json` | add `optionalDependencies` (Task 9 — gated on helper publish) |
| `cli/test/test-macos-signing.mjs` | add resolution + signature-verification tests |
| `.github/workflows/publish_cli.yml` | assert env-override string absent from release bundle |

All commands below run from the **repo root** unless stated otherwise. The CLI test runner is `bun` (`cd cli && bun test/test-macos-signing.mjs`); typecheck is `cd cli && bun run typecheck`; lint is `cd cli && bun run lint`. (If `~/bin/zigrep` is on the executor's PATH, prefer it over `grep` per repo hooks; plain `grep` shown below is illustrative of intent.)

---

### Task 1: `cli-helper/` skeleton, move+rename Swift source, add subcommand+gate, SECURITY.md

**Files:**
- Move: `cli/src/build/onboarding/keychain-export.swift` → `cli-helper/src/helper.swift`
- Modify: `cli-helper/src/helper.swift` (subcommand dispatch + anti-footgun gate + `FORBIDDEN_CALLER`)
- Create: `cli-helper/npm/darwin-arm64/package.json`, `cli-helper/npm/darwin-x64/package.json`
- Create: `cli-helper/SECURITY.md`, `cli-helper/README.md`

- [ ] **Step 1: git-move + rename the Swift source**

```bash
mkdir -p cli-helper/src cli-helper/npm/darwin-arm64 cli-helper/npm/darwin-x64 cli-helper/scripts
git mv cli/src/build/onboarding/keychain-export.swift cli-helper/src/helper.swift
```

Note: `cli/build.mjs:412-415` still references the old path — the CLI build is broken until Task 8. Tasks 2-8 don't run the CLI build; Task 8 fixes it.

- [ ] **Step 2: Add `FORBIDDEN_CALLER` to the Swift error enum**

In `cli-helper/src/helper.swift`, in `enum KeychainExportError` (the `case` list), add:

```swift
    case forbiddenCaller(String)
```

In the `errorCode` switch add `case .forbiddenCaller: return "FORBIDDEN_CALLER"`; in `exitCode` add `case .forbiddenCaller: return 5`; in `message` add `.forbiddenCaller(m)` to the existing `let .invalidArgs(m), let .noIdentity(m), let .writeFailed(m)` group (so it returns `m`). `osStatus` already defaults to `nil` for it.

- [ ] **Step 3: Add `--invoked-by` to `Args` and `parseArgs`**

Change `struct Args` to add a field:

```swift
struct Args {
    var sha1Hex: String = ""
    var outputPath: String = ""
    var passphrase: String = ""
    var invokedBy: String = ""
}
```

Change `parseArgs()` to take an explicit argument list (so `main` can pass the post-subcommand slice) and accept the handshake flag. Replace the signature line `func parseArgs() throws -> Args {` and the `let cli = CommandLine.arguments` / `var i = 1` lines with:

```swift
func parseArgs(_ cli: [String]) throws -> Args {
    var args = Args()
    var i = 0
```

In the `switch flag` block add a case (before `default`):

```swift
        case "--invoked-by": args.invokedBy = value
```

(The `--invoked-by` value is NOT required by `parseArgs` — the gate validates it, so a missing handshake yields `FORBIDDEN_CALLER`, not `INVALID_ARGS`.)

- [ ] **Step 4: Add the anti-footgun gate function**

Add before `// MARK: - Main` (uses `isatty`/`STDOUT_FILENO` from Foundation/Darwin, already imported via Foundation):

```swift
// MARK: - Caller gate (anti-footgun; NOT a security boundary — see SECURITY.md)
//
// Stops casual / accidental / naive-script invocation of the sensitive
// export path. It does NOT stop a determined local attacker, who can read the
// handshake straight out of the open-source CLI (or call Apple's keychain APIs
// directly). The macOS Keychain ACL is the real boundary.
func enforceCallerGate(_ args: Args) throws {
    guard args.invokedBy == "capgo-cli" else {
        throw KeychainExportError.forbiddenCaller(
            "Refusing to run: missing or invalid --invoked-by handshake."
        )
    }
    guard isatty(STDOUT_FILENO) == 0 else {
        throw KeychainExportError.forbiddenCaller(
            "Refusing to run with an interactive (TTY) stdout."
        )
    }
}
```

- [ ] **Step 5: Rewrite `main` to dispatch on a subcommand**

Replace the `// MARK: - Main` `do { … }` block (currently calls `parseArgs()` directly) with:

```swift
// MARK: - Main

do {
    let argv = CommandLine.arguments
    guard argv.count >= 2 else {
        throw KeychainExportError.invalidArgs("Missing subcommand. Usage: helper <subcommand> …")
    }
    switch argv[1] {
    case "keychain-export":
        let args = try parseArgs(Array(argv.dropFirst(2)))
        try enforceCallerGate(args)
        let (identity, identityName) = try findIdentityBySha1(args.sha1Hex)
        let p12 = try exportIdentityAsPkcs12(identity, passphrase: args.passphrase)
        try writeP12(p12, to: args.outputPath)
        emitSuccessAndExit(p12Path: args.outputPath, p12SizeBytes: p12.count, identityName: identityName)
    default:
        throw KeychainExportError.invalidArgs("Unknown subcommand: \(argv[1])")
    }
} catch let error as KeychainExportError {
    emitFailureAndExit(error)
} catch {
    emitFailureAndExit(
        code: 1,
        errorCode: "INTERNAL",
        message: "Unhandled error: \(error.localizedDescription)"
    )
}
```

Also update the file's top usage comment (lines ~8-11) to show `helper keychain-export --sha1 … --output … --passphrase … --invoked-by capgo-cli` and the build line (~42) to `swiftc helper.swift -framework Security -o helper`.

- [ ] **Step 6: Compile-check the Swift edits locally (this machine has Xcode CLT)**

Run: `swiftc cli-helper/src/helper.swift -framework Security -O -o /tmp/helper-check && echo BUILD_OK`
Expected: `BUILD_OK`.

Run (gate rejects missing handshake): `/tmp/helper-check keychain-export --sha1 $(printf 'a%.0s' {1..40}) --output /tmp/x.p12 --passphrase p | cat; echo "exit=${PIPESTATUS[0]}"`
Expected: one-line JSON with `"ok":false` and `"errorCode":"FORBIDDEN_CALLER"`, `exit=5`. (Piped through `cat` so stdout is not a TTY — proving the handshake, not the TTY check, is what fires.)

Run (no subcommand → INVALID_ARGS): `/tmp/helper-check | cat; echo "exit=${PIPESTATUS[0]}"`
Expected: `"ok":false`, `"errorCode":"INVALID_ARGS"`, `exit=2`.

- [ ] **Step 7: Write the two package manifests**

`cli-helper/npm/darwin-arm64/package.json`:

```json
{
  "name": "@capgo/cli-keychain-darwin-arm64",
  "version": "0.0.0",
  "description": "Precompiled macOS (Apple Silicon) keychain helper for @capgo/cli",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/Cap-go/capgo.git",
    "directory": "cli-helper"
  },
  "license": "Apache 2.0",
  "os": ["darwin"],
  "cpu": ["arm64"],
  "files": ["helper"]
}
```

`cli-helper/npm/darwin-x64/package.json` — identical except `"name": "@capgo/cli-keychain-darwin-x64"`, `"description": "Precompiled macOS (Intel) keychain helper for @capgo/cli"`, `"cpu": ["x64"]`.

(`version` is `0.0.0` in-repo; `prepare-publish.mjs` stamps the real version from the release tag.)

- [ ] **Step 8: Write `cli-helper/SECURITY.md`**

```markdown
# Security model — Capgo CLI keychain helper

## The boundary is the macOS Keychain ACL, not this binary

Exporting a code-signing private key triggers an OS-level Keychain prompt
("Allow" / "Always Allow") that macOS enforces against the **calling binary's
code signature**. That prompt — not anything in this helper or in `@capgo/cli`
— is the security boundary.

## Invoking the helper grants no privilege

An attacker who can run this `helper` on a victim's machine already has local
code execution as that user, and can call Apple's own `SecItemExport` or
`/usr/bin/security export` directly. This helper is a worse-for-them version of
tools already present on every Mac. It is **not** a privilege escalation.

## Why we don't authenticate the caller

- The CLI runs as `node dist/index.js`; **node is signed by the user's Node
  install, not by Capgo** — there is no Capgo signature on the parent to pin.
- A shared secret would live in readable JavaScript in the npm tarball.
- Parent-PID checks are TOCTOU-racy and subject to PID reuse.

## What we do instead

- The CLI verifies **this binary's** Developer ID + Capgo Team ID signature
  before running it (protects the CLI from a swapped helper).
- The sensitive `keychain-export` subcommand has an **anti-footgun gate**
  (requires an internal `--invoked-by capgo-cli` handshake and a non-TTY
  stdout). This stops casual/accidental/naive-script misuse. **It is explicitly
  not a security boundary** — a determined local attacker reads the handshake
  out of the open-source CLI. It exists to keep honest software honest.

## Reporting expectation

Demonstrating that you can invoke this helper yourself, or that doing so exports
a key after the user grants the macOS prompt, is **out of scope by design** — it
is equivalent to calling Apple's keychain APIs, which any local process with the
user's privileges can already do. Reports must show a privilege boundary being
crossed that the OS would otherwise enforce.
```

- [ ] **Step 9: Write `cli-helper/README.md`**

```markdown
# Capgo CLI keychain helper

Small Swift program (Security framework only) shipped as one generic binary
named `helper`. Today it has a single subcommand:

    helper keychain-export --sha1 <40-hex> --output <path.p12> \
      --passphrase <wrap-pass> --invoked-by capgo-cli

It exports one code-signing identity from the macOS Keychain as a
passphrase-wrapped PKCS#12 and always emits one line of JSON on stdout
(`{"ok":true,...}` or `{"ok":false,"errorCode":...}`). Future helpers are new
subcommands of the same signed binary.

Shipped as two precompiled, Developer-ID-signed, notarized npm packages:

- `@capgo/cli-keychain-darwin-arm64` (Apple Silicon, macOS 11+)
- `@capgo/cli-keychain-darwin-x64` (Intel, macOS 10.15+)

Both are `optionalDependencies` of `@capgo/cli`; npm installs at most one. The
CLI verifies the binary's code signature (Developer ID + Capgo Team ID) before
every execution and refuses to run anything else. See SECURITY.md for the
threat model.

## Dev bootstrap (working on the Swift source)

The published CLI has no compile fallback. To test local Swift changes:

    swiftc cli-helper/src/helper.swift -framework Security -O -o /tmp/helper-dev
    cd cli && NODE_ENV=development bun run build
    CAPGO_KEYCHAIN_HELPER_PATH=/tmp/helper-dev node dist/index.js ...

`CAPGO_KEYCHAIN_HELPER_PATH` only exists in dev builds — it is dead-code-
eliminated from npm release builds (asserted in CI). The env-override path
skips both the signature check and the subcommand wrapper, so point it at a
binary you built and trust.

## Release

1. Bump nothing in-repo — the version comes from the dispatch input.
2. Run the workflow from the GitHub Actions UI ("Run workflow" → enter the
   version), or: `gh workflow run publish_cli_helper.yml -f version=X.Y.Z`
3. `.github/workflows/publish_cli_helper.yml` builds, signs, notarizes,
   smoke-tests, publishes both packages with npm provenance, and creates the
   `cli-helper-X.Y.Z` tag + GitHub release.
4. Release only when `src/helper.swift` actually changed.

Required GitHub secrets: `DEVELOPER_ID_CERT_BASE64`, `DEVELOPER_ID_CERT_PASSWORD`
(Developer ID Application cert as base64 .p12), `APPLE_TEAM_ID`, plus existing
`APPLE_KEY_ID`, `APPLE_ISSUER_ID`, `APPLE_KEY_CONTENT` (App Store Connect API
key, used by notarytool) and `NPM_TOKEN`.
```

- [ ] **Step 10: Commit**

```bash
git add cli-helper cli/src/build/onboarding
git commit -m "feat(cli-helper): scaffold helper packages, move+rename Swift source, add subcommand+gate"
```

---

### Task 2: `cli-helper/scripts/build.sh` + local build verification

**Files:**
- Create: `cli-helper/scripts/build.sh`

- [ ] **Step 1: Write the build script**

```bash
#!/usr/bin/env bash
# Compile helper for both macOS architectures into cli-helper/dist/.
# arm64 targets macOS 11 (first Apple Silicon release); x64 targets 10.15
# (oldest macOS that can run Node 20, the CLI's floor).
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p dist
swiftc src/helper.swift -framework Security -O \
  -target arm64-apple-macos11 -o dist/helper-arm64
swiftc src/helper.swift -framework Security -O \
  -target x86_64-apple-macos10.15 -o dist/helper-x64
echo "Built:"
file dist/helper-arm64 dist/helper-x64
```

```bash
chmod +x cli-helper/scripts/build.sh
```

- [ ] **Step 2: Run it locally**

Run: `bash cli-helper/scripts/build.sh`
Expected output ends with:
```
dist/helper-arm64: Mach-O 64-bit executable arm64
dist/helper-x64:   Mach-O 64-bit executable x86_64
```

- [ ] **Step 3: Smoke-run the arm64 binary (no subcommand → JSON INVALID_ARGS)**

Run: `./cli-helper/dist/helper-arm64 | cat; echo "exit=${PIPESTATUS[0]}"`
Expected: one line of JSON containing `"ok":false` and `"errorCode":"INVALID_ARGS"`, then `exit=2`.

- [ ] **Step 4: Verify the deployment targets**

Run: `otool -l cli-helper/dist/helper-x64 | grep -A2 LC_BUILD_VERSION | grep minos`
Expected: `minos 10.15`
Run: `otool -l cli-helper/dist/helper-arm64 | grep -A2 LC_BUILD_VERSION | grep minos`
Expected: `minos 11.0`

- [ ] **Step 5: Add `dist/` to gitignore and commit**

Append to the repo's `.gitignore` (check it doesn't already cover it):

```
cli-helper/dist/
```

```bash
git add cli-helper/scripts/build.sh .gitignore
git commit -m "feat(cli-helper): per-arch swiftc build script"
```

---

### Task 3: `cli-helper/scripts/prepare-publish.mjs`

**Files:**
- Create: `cli-helper/scripts/prepare-publish.mjs`

- [ ] **Step 1: Write the script**

```js
// Stamp the release version into both npm manifests and copy the signed
// binaries into their package dirs.
//   Usage: node cli-helper/scripts/prepare-publish.mjs <semver>
// Fails fast on a malformed version or missing binary so a bad tag can
// never publish.
import { chmodSync, copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const version = process.argv[2]
if (!version || !/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(version)) {
  console.error(`Usage: node prepare-publish.mjs <semver> — got "${version ?? ''}"`)
  process.exit(1)
}

for (const arch of ['arm64', 'x64']) {
  const src = join(root, 'dist', `helper-${arch}`)
  if (!existsSync(src)) {
    console.error(`Missing binary ${src} — run build.sh + sign-and-notarize.sh first`)
    process.exit(1)
  }
  const pkgDir = join(root, 'npm', `darwin-${arch}`)
  const manifestPath = join(pkgDir, 'package.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'))
  const updated = { ...manifest, version }
  writeFileSync(manifestPath, `${JSON.stringify(updated, null, 2)}\n`)
  const dest = join(pkgDir, 'helper')
  copyFileSync(src, dest)
  chmodSync(dest, 0o755)
  console.log(`Prepared ${manifest.name}@${version}`)
}
```

- [ ] **Step 2: Test it locally (binaries exist from Task 2)**

Run: `node cli-helper/scripts/prepare-publish.mjs 1.0.0-test && node -e "console.log(JSON.parse(require('node:fs').readFileSync('cli-helper/npm/darwin-arm64/package.json','utf8')).version)" && ls -l cli-helper/npm/darwin-arm64/helper`
Expected: `Prepared @capgo/cli-keychain-darwin-arm64@1.0.0-test`, `Prepared ...x64@1.0.0-test`, prints `1.0.0-test`, and the binary listed with `-rwxr-xr-x`.

- [ ] **Step 3: Test the failure path**

Run: `node cli-helper/scripts/prepare-publish.mjs banana; echo "exit=$?"`
Expected: usage error, `exit=1`.

- [ ] **Step 4: Restore manifests and remove copied binaries**

```bash
git checkout cli-helper/npm/darwin-arm64/package.json cli-helper/npm/darwin-x64/package.json
rm -f cli-helper/npm/darwin-arm64/helper cli-helper/npm/darwin-x64/helper
```

Append to `.gitignore` so a local run never commits binaries:

```
cli-helper/npm/*/helper
```

- [ ] **Step 5: Commit**

```bash
git add cli-helper/scripts/prepare-publish.mjs .gitignore
git commit -m "feat(cli-helper): version-stamp and package-prep script"
```

---

### Task 4: `macos-signing.ts` — package name mapping + requirement string + result code (TDD)

**Files:**
- Modify: `cli/src/build/onboarding/macos-signing.ts`
- Test: `cli/test/test-macos-signing.mjs`

- [ ] **Step 1: Write failing tests**

Append to `cli/test/test-macos-signing.mjs` (add `helperPackageName, helperSignatureRequirement` to the existing import block from `'../src/build/onboarding/macos-signing.ts'`):

```js
// ─── helperPackageName ────────────────────────────────────────────────

t('helperPackageName maps arm64 and x64 to scoped packages', () => {
  assert.equal(helperPackageName('arm64'), '@capgo/cli-keychain-darwin-arm64')
  assert.equal(helperPackageName('x64'), '@capgo/cli-keychain-darwin-x64')
})

t('helperPackageName returns null for unsupported architectures', () => {
  assert.equal(helperPackageName('ia32'), null)
  assert.equal(helperPackageName('ppc64'), null)
  assert.equal(helperPackageName(''), null)
})

// ─── helperSignatureRequirement ───────────────────────────────────────

t('helperSignatureRequirement pins Developer ID + team', () => {
  const req = helperSignatureRequirement('ABCDE12345')
  assert.ok(req.startsWith('=anchor apple generic'))
  assert.ok(req.includes('certificate leaf[field.1.2.840.113635.100.6.1.13]'))
  assert.ok(req.includes('certificate leaf[subject.OU] = "ABCDE12345"'))
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd cli && bun test/test-macos-signing.mjs`
Expected: FAIL — `helperPackageName` is not exported.

- [ ] **Step 3: Implement**

In `cli/src/build/onboarding/macos-signing.ts`, after `generateP12Passphrase` (around line 262), add:

```ts
// ─── Precompiled helper resolution ────────────────────────────────────

/**
 * Apple Team ID the precompiled helper binaries are signed with. Used in the
 * codesign designated-requirement check before executing a package-resolved
 * binary. Must match the Developer ID Application cert used by
 * .github/workflows/publish_cli_helper.yml.
 */
const CAPGO_APPLE_TEAM_ID = 'UVTJ336J2D'

const HELPER_PACKAGE_PREFIX = '@capgo/cli-keychain-darwin-'

/**
 * Map a Node `process.arch` value to the matching helper package name, or
 * null when no precompiled helper exists for that architecture.
 */
export function helperPackageName(arch: string): string | null {
  if (arch === 'arm64' || arch === 'x64')
    return `${HELPER_PACKAGE_PREFIX}${arch}`
  return null
}

/**
 * codesign designated requirement asserting: Apple-rooted chain, a
 * Developer ID Application leaf cert (OID 1.2.840.113635.100.6.1.13), and
 * the given Apple Team ID as the signing team.
 */
export function helperSignatureRequirement(teamId: string = CAPGO_APPLE_TEAM_ID): string {
  return `=anchor apple generic and certificate leaf[field.1.2.840.113635.100.6.1.13] and certificate leaf[subject.OU] = "${teamId}"`
}
```

Also extend the `SwiftHelperResult.errorCode` union (the existing interface near the helper-result types) to include the new code: change it to
`'INVALID_ARGS' | 'NO_IDENTITY' | 'USER_DENIED' | 'EXPORT_FAILED' | 'WRITE_FAILED' | 'FORBIDDEN_CALLER' | 'INTERNAL'`.

**Before committing:** confirm the Team ID with the user (`UVTJ336J2D` per existing fixtures — but verify; it must equal the `subject.OU` of the Developer ID cert created in Task 12).

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd cli && bun test/test-macos-signing.mjs`
Expected: PASS, including all pre-existing tests.

- [ ] **Step 5: Commit**

```bash
git add cli/src/build/onboarding/macos-signing.ts cli/test/test-macos-signing.mjs
git commit -m "feat(cli): helper package name mapping, codesign requirement, FORBIDDEN_CALLER code"
```

---

### Task 5: `macos-signing.ts` — `resolveHelperBinary` with signature verification (TDD)

**Files:**
- Modify: `cli/src/build/onboarding/macos-signing.ts`
- Test: `cli/test/test-macos-signing.mjs`

- [ ] **Step 1: Write failing tests**

Append to `cli/test/test-macos-signing.mjs` (add `resolveHelperBinary` to the import; `chmodSync` to the `node:fs` import line):

```js
// ─── resolveHelperBinary ──────────────────────────────────────────────

function makeFakeHelper() {
  const dir = mkdtempSync(join(tmpdir(), 'capgo-helper-test-'))
  const bin = join(dir, 'helper')
  writeFileSync(bin, '#!/bin/sh\nexit 0\n')
  chmodSync(bin, 0o755)
  return { dir, bin }
}

const okCodesign = async () => ({ stdout: '', stderr: '', code: 0 })
const failCodesign = async () => ({ stdout: '', stderr: 'test requirement failed', code: 3 })

await tAsync('resolveHelperBinary rejects unsupported architectures', async () => {
  await assert.rejects(
    resolveHelperBinary({ arch: 'ia32', resolve: () => { throw new Error('unreachable') } }),
    /No precompiled Capgo keychain helper exists for .*ia32/,
  )
})

await tAsync('resolveHelperBinary names the missing package in its error', async () => {
  await assert.rejects(
    resolveHelperBinary({ arch: 'arm64', resolve: () => { throw new Error('not found') } }),
    /@capgo\/cli-keychain-darwin-arm64.*not installed/s,
  )
})

await tAsync('resolveHelperBinary returns the binary when signature verifies', async () => {
  const { dir, bin } = makeFakeHelper()
  try {
    const resolved = await resolveHelperBinary({
      arch: 'arm64',
      resolve: () => join(dir, 'package.json'),
      codesignRunner: okCodesign,
    })
    assert.equal(resolved, bin)
  }
  finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

await tAsync('resolveHelperBinary hard-errors when signature verification fails', async () => {
  const { dir } = makeFakeHelper()
  try {
    await assert.rejects(
      resolveHelperBinary({
        arch: 'arm64',
        resolve: () => join(dir, 'package.json'),
        codesignRunner: failCodesign,
      }),
      /Refusing to run the keychain helper.*did not verify/s,
    )
  }
  finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

await tAsync('resolveHelperBinary errors when resolved binary file is missing', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'capgo-helper-test-'))
  try {
    await assert.rejects(
      resolveHelperBinary({
        arch: 'arm64',
        resolve: () => join(dir, 'package.json'),
        codesignRunner: okCodesign,
      }),
      /not installed|missing its binary/s,
    )
  }
  finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

await tAsync('env override wins when explicitly allowed (dev builds)', async () => {
  const { dir, bin } = makeFakeHelper()
  process.env.CAPGO_KEYCHAIN_HELPER_PATH = bin
  try {
    const resolved = await resolveHelperBinary({
      allowEnvOverride: true,
      arch: 'arm64',
      resolve: () => { throw new Error('should not be consulted') },
      codesignRunner: failCodesign, // override path skips signature check too
    })
    assert.equal(resolved, bin)
  }
  finally {
    delete process.env.CAPGO_KEYCHAIN_HELPER_PATH
    rmSync(dir, { recursive: true, force: true })
  }
})

await tAsync('env override is ignored by default (release semantics)', async () => {
  const { dir, bin } = makeFakeHelper()
  process.env.CAPGO_KEYCHAIN_HELPER_PATH = '/nonexistent/evil-binary'
  try {
    const resolved = await resolveHelperBinary({
      arch: 'arm64',
      resolve: () => join(dir, 'package.json'),
      codesignRunner: okCodesign,
    })
    assert.equal(resolved, bin)
  }
  finally {
    delete process.env.CAPGO_KEYCHAIN_HELPER_PATH
    rmSync(dir, { recursive: true, force: true })
  }
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd cli && bun test/test-macos-signing.mjs`
Expected: FAIL — `resolveHelperBinary` is not exported.

- [ ] **Step 3: Implement**

In `cli/src/build/onboarding/macos-signing.ts`:

Add to the imports at the top (`accessSync`, `constants` join the existing `node:fs` import; `createRequire` is new):

```ts
import { accessSync, constants, existsSync } from 'node:fs'
import { createRequire } from 'node:module'
```

After `helperSignatureRequirement`, add:

```ts
/**
 * Build-time flag controlling whether CAPGO_KEYCHAIN_HELPER_PATH is honored.
 * cli/build.mjs `define`s this to `false` for npm release builds — the whole
 * env-override branch (including the string literal) is dead-code-eliminated
 * from dist/index.js, and CI asserts the string is absent. Dev builds
 * (NODE_ENV=development) define it `true`. Running unbundled source (tests,
 * `bun src/index.ts`) leaves it undefined → override disabled (fail closed).
 */
declare const __CAPGO_ALLOW_HELPER_ENV_OVERRIDE__: boolean | undefined

interface CodesignRunner {
  (args: readonly string[]): Promise<SpawnResult>
}

const defaultCodesignRunner: CodesignRunner = args => spawnCapture('/usr/bin/codesign', args)

export interface ResolveHelperBinaryOptions {
  /** Override `process.arch` (tests). */
  arch?: string
  /**
   * Override module resolution (tests). Receives the package's
   * `package.json` specifier; must return its absolute path or throw.
   */
  resolve?: (specifier: string) => string
  /** Override the codesign spawn (tests). */
  codesignRunner?: CodesignRunner
  /** Force the dev env-override gate (tests). Defaults to the build-time flag. */
  allowEnvOverride?: boolean
}

/**
 * Locate the precompiled `helper` binary for this machine and verify its code
 * signature chains to Capgo's Developer ID before returning it.
 *
 * Resolution order:
 *   1. CAPGO_KEYCHAIN_HELPER_PATH (dev builds only — see the build-time flag)
 *   2. The arch-matching @capgo/cli-keychain-darwin-* optional dependency
 *   3. Hard error with install guidance. There is no compile fallback.
 */
export async function resolveHelperBinary(options: ResolveHelperBinaryOptions = {}): Promise<string> {
  const allowEnvOverride = options.allowEnvOverride
    ?? (typeof __CAPGO_ALLOW_HELPER_ENV_OVERRIDE__ !== 'undefined' && __CAPGO_ALLOW_HELPER_ENV_OVERRIDE__)

  if (allowEnvOverride) {
    const overridePath = process.env.CAPGO_KEYCHAIN_HELPER_PATH
    if (overridePath) {
      if (!existsSync(overridePath))
        throw new MacOSSigningError(`CAPGO_KEYCHAIN_HELPER_PATH points to a missing file: ${overridePath}`)
      return overridePath
    }
  }

  const arch = options.arch ?? process.arch
  const packageName = helperPackageName(arch)
  if (!packageName) {
    throw new MacOSSigningError(
      `No precompiled Capgo keychain helper exists for ${process.platform}/${arch}. `
      + `Supported macOS architectures: arm64, x64.`,
    )
  }

  const resolveSpecifier = options.resolve ?? createRequire(import.meta.url).resolve
  let packageJsonPath: string
  try {
    packageJsonPath = resolveSpecifier(`${packageName}/package.json`)
  }
  catch {
    throw new MacOSSigningError(
      `The Capgo keychain helper package (${packageName}) is not installed. `
      + `It ships as an optional dependency of @capgo/cli — reinstall without `
      + `--no-optional / --omit=optional, or install it directly: npm i ${packageName}`,
    )
  }

  const binaryPath = join(dirname(packageJsonPath), 'helper')
  try {
    accessSync(binaryPath, constants.X_OK)
  }
  catch {
    throw new MacOSSigningError(
      `The keychain helper package (${packageName}) is installed but missing its binary `
      + `(or it is not executable) at ${binaryPath}. Reinstall ${packageName}.`,
    )
  }

  await verifyHelperSignature(binaryPath, packageName, options.codesignRunner ?? defaultCodesignRunner)
  return binaryPath
}

/**
 * Verify the binary's code signature against Capgo's designated requirement
 * (Apple-rooted chain + Developer ID Application leaf + Capgo Team ID).
 * macOS validates the certificate chain and the binary's seal, so this also
 * detects post-install tampering. Throws — never executes the binary — on
 * any failure.
 */
async function verifyHelperSignature(
  binaryPath: string,
  packageName: string,
  runner: CodesignRunner,
): Promise<void> {
  const result = await runner(['--verify', '--strict', '-R', helperSignatureRequirement(), binaryPath])
  if (result.code !== 0) {
    const detail = result.stderr.trim() || result.stdout.trim()
    throw new MacOSSigningError(
      `Refusing to run the keychain helper at ${binaryPath}: its code signature `
      + `did not verify as Capgo's (codesign exit ${result.code}${detail ? `: ${detail}` : ''}). `
      + `Reinstall ${packageName} and try again.`,
    )
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd cli && bun test/test-macos-signing.mjs`
Expected: PASS (all new + all pre-existing).

- [ ] **Step 5: Typecheck and commit**

Run: `cd cli && bun run typecheck`
Expected: clean.

```bash
git add cli/src/build/onboarding/macos-signing.ts cli/test/test-macos-signing.mjs
git commit -m "feat(cli): resolve precompiled keychain helper with signature verification"
```

---

### Task 6: `macos-signing.ts` — wire `exportP12FromKeychain`, delete the compile path

**Files:**
- Modify: `cli/src/build/onboarding/macos-signing.ts`

- [ ] **Step 1: Rewire `exportP12FromKeychain`**

At the line `const helperPath = options.helperPathOverride ?? await ensureSwiftHelper()`, change to:

```ts
  const helperPath = options.helperPathOverride ?? await resolveHelperBinary(options.resolveOptions)
```

Change the spawn call to use the subcommand + handshake. Replace the `spawnCapture(helperPath, [ '--sha1', sha1, '--output', p12Path, '--passphrase', passphrase ])` argument array with:

```ts
    const result = await spawnCapture(helperPath, [
      'keychain-export',
      '--sha1',
      sha1,
      '--output',
      p12Path,
      '--passphrase',
      passphrase,
      '--invoked-by',
      'capgo-cli',
    ])
```

Extend `ExportP12Options`:

```ts
export interface ExportP12Options {
  /**
   * Pre-resolved helper binary path. Used in tests to inject a fake binary;
   * in production this is computed automatically. Bypasses the signature
   * check — not reachable from user input.
   */
  helperPathOverride?: string
  /** Injection points for {@link resolveHelperBinary} (tests). */
  resolveOptions?: ResolveHelperBinaryOptions
}
```

Update the function's doc comment: replace the paragraph beginning "Internally calls the bundled Swift helper (compiled on first use…)" with "Internally runs the precompiled, signature-verified `helper keychain-export` subcommand from the arch-matching `@capgo/cli-keychain-darwin-*` package."

- [ ] **Step 2: Delete the compile path**

Remove these from `macos-signing.ts`:
- `resolveSwiftSourcePath()` + doc comment
- `compiledHelperPath()` + doc comment
- `compileSwiftHelper()` + doc comment
- `isHelperCached()` + doc comment
- `ensureSwiftHelper()` + doc comment
- `precompileSwiftHelper()` + doc comment

Then remove now-unused imports: `chmod`, `rename` (from `node:fs/promises`), `fileURLToPath` (from `node:url`) — verify each is truly unused before deleting (`rm`, `mkdtemp`, `readFile`, `readdir` are still used; `dirname`, `join` are still used; `existsSync` is now used by `resolveHelperBinary`).

- [ ] **Step 3: Run tests + typecheck + lint**

Run: `cd cli && bun test/test-macos-signing.mjs && bun run typecheck && bun run lint`
Expected: tests PASS; typecheck reports errors **only** in `ui/app.tsx` (imports of the deleted `isHelperCached`/`precompileSwiftHelper` — fixed in Task 7). If typecheck fails on anything else in `macos-signing.ts`, fix it now.

- [ ] **Step 4: Commit**

```bash
git add cli/src/build/onboarding/macos-signing.ts
git commit -m "feat(cli): remove runtime swiftc compilation of keychain helper"
```

(Committing with the known app.tsx typecheck break is acceptable only because Task 7 immediately fixes it; if you prefer atomically green commits, squash Tasks 6+7.)

---

### Task 7: Remove the "compiling helper" UI step

**Files:**
- Modify: `cli/src/build/onboarding/types.ts:51,257,341`
- Modify: `cli/src/build/onboarding/ui/app.tsx:50,107,1728-1744,4268,4282`
- Modify: `cli/src/build/onboarding/ui/steps/ios-import.tsx:412-~460`

- [ ] **Step 1: types.ts — remove the step**

- Line 51: delete `| 'import-compiling-helper'` from the `OnboardingStep` union.
- Line 257: delete `'import-compiling-helper': 72,` from `STEP_PROGRESS`. (Leave `'import-exporting': 75` as is.)
- Line 341: delete `case 'import-compiling-helper':` (the fall-through label inside `getPhaseLabel`; `case 'import-export-warning':` and `case 'import-exporting':` keep returning `'Step 4 of 4 · Export from Keychain'`).

- [ ] **Step 2: app.tsx — remove usage**

- Line 50: remove `isHelperCached` and `precompileSwiftHelper` from the `'../macos-signing.js'` import (keep `exportP12FromKeychain`, `bundleIdMatches`, etc.).
- Line 107: remove `ImportCompilingHelperStep,` from the steps import.
- Lines 1728-1744: delete the entire `if (step === 'import-compiling-helper') { ... }` effect block.
- Line 4268: change

```tsx
setStep(isHelperCached() ? 'import-exporting' : 'import-compiling-helper')
```

to

```tsx
setStep('import-exporting')
```

- Line 4282: delete `{step === 'import-compiling-helper' && <ImportCompilingHelperStep dense={dense} />}`.

- [ ] **Step 3: ios-import.tsx — delete the component**

Delete the comment block (lines ~412-419), `ImportCompilingHelperStepProps` (~420-422), and the whole `ImportCompilingHelperStep` component (~424 through its closing `}`, ~line 460 — read to the component's end before deleting). Then check whether `SpinnerLine` / `Newline` are still used elsewhere in the file before touching its imports.

- [ ] **Step 4: Typecheck, lint, full signing tests**

Run: `cd cli && bun run typecheck && bun run lint && bun test/test-macos-signing.mjs`
Expected: all clean. Typecheck exhaustiveness over `OnboardingStep` surfaces any `'import-compiling-helper'` reference we missed — fix stragglers.

- [ ] **Step 5: Commit**

```bash
git add cli/src/build/onboarding/types.ts cli/src/build/onboarding/ui/app.tsx cli/src/build/onboarding/ui/steps/ios-import.tsx
git commit -m "feat(cli): drop compiling-helper onboarding step"
```

---

### Task 8: `cli/build.mjs` — externals, define, drop the .swift copy

**Files:**
- Modify: `cli/build.mjs:302-326` (buildCLI), `:329-347` (buildSDK), `:408-415` (swift copy)

- [ ] **Step 1: Edit buildCLI and buildSDK**

Near the top of `cli/build.mjs` (after the imports), add:

```js
// Precompiled keychain helper packages resolve from node_modules at runtime
// (binary-only optional deps) — never bundle them.
const HELPER_PACKAGES = [
  '@capgo/cli-keychain-darwin-arm64',
  '@capgo/cli-keychain-darwin-x64',
]
```

In the `buildCLI` options (lines 302-326), add `external` and extend `define`:

```js
  external: HELPER_PACKAGES,
  define: {
    'process.env.SUPA_DB': '"production"',
    // Gates the CAPGO_KEYCHAIN_HELPER_PATH dev override. `false` here makes
    // the minifier delete the whole branch from release bundles —
    // publish_cli.yml asserts the string is absent from dist/index.js.
    '__CAPGO_ALLOW_HELPER_ENV_OVERRIDE__': env.NODE_ENV === 'development' ? 'true' : 'false',
  },
```

Apply the same `external: HELPER_PACKAGES` to `buildSDK` (lines 329-347) for safety; its `define` gets the same new entry.

- [ ] **Step 2: Delete the .swift copy**

Delete lines 408-415 (the comment + `copyFileSync('src/build/onboarding/keychain-export.swift', 'dist/keychain-export.swift')` call — the source path no longer exists after Task 1).

- [ ] **Step 3: Build and assert dead-code elimination**

Run: `cd cli && bun run build && { grep -c "CAPGO_KEYCHAIN_HELPER_PATH" dist/index.js && echo "FAIL: leaked" && exit 1 || echo "OK: stripped"; }`
Expected: build succeeds; `OK: stripped`. (If `~/bin/zigrep` is available, substitute it for `grep`.)

Then the dev build keeps it:
Run: `cd cli && NODE_ENV=development bun run build && grep -c "CAPGO_KEYCHAIN_HELPER_PATH" dist/index.js`
Expected: count ≥ 1.

Finally rebuild for release mode so no dev artifact lingers: `cd cli && bun run build`

- [ ] **Step 4: Run the CLI bundle test**

Run: `cd cli && bun run test:bundle`
Expected: PASS (catches bundling regressions from the external/define changes).

- [ ] **Step 5: Commit**

```bash
git add cli/build.mjs
git commit -m "feat(cli): externalize helper packages, strip dev env override from release builds"
```

---

### Task 9: ⚠️ GATED — add `optionalDependencies` to `cli/package.json`

**Do NOT execute until helper 1.0.0 is published (after Task 12/13).** Adding unpublished packages breaks `bun install --frozen-lockfile` everywhere.

**Files:**
- Modify: `cli/package.json`
- Modify: `bun.lock` (via `bun install`)

- [ ] **Step 1: Add the block** (after `"dependencies"`, around line 133):

```json
  "optionalDependencies": {
    "@capgo/cli-keychain-darwin-arm64": "^1.0.0",
    "@capgo/cli-keychain-darwin-x64": "^1.0.0"
  },
```

- [ ] **Step 2: Refresh the lockfile**

Run: `bun install` (repo root)
Expected: resolves both packages; on this arm64 Mac, `cli/node_modules/@capgo/cli-keychain-darwin-arm64/helper` exists and is executable.

- [ ] **Step 3: End-to-end resolution check on this machine**

Run: `cd cli && bun -e "const m = await import('./src/build/onboarding/macos-signing.ts'); const p = await m.resolveHelperBinary(); console.log(p); const r = Bun.spawnSync([p]); console.log(r.stdout.toString())"`
Expected: prints the node_modules `helper` path, then the helper's `INVALID_ARGS` JSON envelope (proving real codesign verification + execution of the published binary).

- [ ] **Step 4: Commit**

```bash
git add cli/package.json bun.lock
git commit -m "feat(cli): depend on precompiled keychain helper packages"
```

---

### Task 10: `cli-helper/scripts/sign-and-notarize.sh`

**Files:**
- Create: `cli-helper/scripts/sign-and-notarize.sh`

- [ ] **Step 1: Write the script**

```bash
#!/usr/bin/env bash
# Codesign (hardened runtime + timestamp) and notarize both helper binaries,
# then verify each against the same designated requirement the CLI enforces
# at runtime — a cert/team mismatch fails the release, not the user.
#
# Required env:
#   DEVELOPER_ID_IDENTITY   codesign identity, e.g. "Developer ID Application: <name> (<TEAMID>)"
#   CAPGO_APPLE_TEAM_ID     10-char Apple Team ID (must match macos-signing.ts)
#   APPLE_KEY_ID            App Store Connect API key id
#   APPLE_ISSUER_ID         App Store Connect API key issuer
#   APPLE_KEY_PATH          path to the API key .p8 file
set -euo pipefail
cd "$(dirname "$0")/.."

: "${DEVELOPER_ID_IDENTITY:?}" "${CAPGO_APPLE_TEAM_ID:?}" "${APPLE_KEY_ID:?}" "${APPLE_ISSUER_ID:?}" "${APPLE_KEY_PATH:?}"

REQUIREMENT='=anchor apple generic and certificate leaf[field.1.2.840.113635.100.6.1.13] and certificate leaf[subject.OU] = "'"$CAPGO_APPLE_TEAM_ID"'"'

# Stable code-signing identifier. macOS keys the Keychain "Always Allow" grant
# to the code's designated requirement, which includes this identifier — so
# pinning it now keeps users' grants intact across future re-signs, including a
# possible migration to a `Capgo.app` bundle that reuses the SAME
# CFBundleIdentifier. Never change this value. See "Future: native
# notifications & UI" in the design spec.
HELPER_IDENTIFIER="app.capgo.cli.helper"

for arch in arm64 x64; do
  bin="dist/helper-$arch"
  echo "── Signing $bin"
  codesign --force --sign "$DEVELOPER_ID_IDENTITY" --identifier "$HELPER_IDENTIFIER" --options runtime --timestamp "$bin"

  echo "── Notarizing $bin"
  ditto -c -k "$bin" "$bin.zip"
  out=$(xcrun notarytool submit "$bin.zip" \
    --key "$APPLE_KEY_PATH" --key-id "$APPLE_KEY_ID" --issuer "$APPLE_ISSUER_ID" \
    --wait --timeout 30m --output-format json) || true
  id=$(echo "$out" | jq -r '.id // empty')
  status=$(echo "$out" | jq -r '.status // empty')
  if [ "$status" != "Accepted" ]; then
    echo "Notarization failed for $bin (status: ${status:-unknown})" >&2
    if [ -n "$id" ]; then
      xcrun notarytool log "$id" \
        --key "$APPLE_KEY_PATH" --key-id "$APPLE_KEY_ID" --issuer "$APPLE_ISSUER_ID" >&2 || true
    fi
    exit 1
  fi
  echo "── Notarization accepted ($id)"

  echo "── Verifying $bin"
  codesign --verify --strict "$bin"
  codesign --verify --strict -R "$REQUIREMENT" "$bin"
done
echo "All binaries signed, notarized, and verified."
```

```bash
chmod +x cli-helper/scripts/sign-and-notarize.sh
```

(`CAPGO_APPLE_TEAM_ID` here and the constant in `macos-signing.ts` must match — both set from the value confirmed in Task 4/12.)

- [ ] **Step 2: Shellcheck it (if installed; skip otherwise)**

Run: `command -v shellcheck >/dev/null && shellcheck cli-helper/scripts/sign-and-notarize.sh || echo "shellcheck not installed — skipped"`
Expected: no errors (or skipped).

- [ ] **Step 3: Commit**

```bash
git add cli-helper/scripts/sign-and-notarize.sh
git commit -m "feat(cli-helper): codesign + notarize script with runtime-requirement verification"
```

---

### Task 11: CI workflows

**Files:**
- Create: `.github/workflows/publish_cli_helper.yml`
- Modify: `.github/workflows/publish_cli.yml` (insert one step after "Build CLI", line 37)

- [ ] **Step 1: Write `publish_cli_helper.yml`**

```yaml
name: Build and publish CLI keychain helper

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

on:
  workflow_dispatch:
    inputs:
      version:
        description: "Helper version to publish, e.g. 1.0.0 (no 'cli-helper-' prefix)"
        required: true

permissions: {}

jobs:
  publish_cli_helper:
    runs-on: macos-latest
    name: Build, sign, notarize, publish keychain helper
    timeout-minutes: 45
    permissions:
      contents: write
      id-token: write
    steps:
      - name: Checkout
        uses: actions/checkout@v6
      - name: Setup Node.js
        uses: actions/setup-node@v6
        with:
          node-version: 24.x
          registry-url: https://registry.npmjs.org
      - name: Validate + capture version
        id: version
        run: |
          v="${{ github.event.inputs.version }}"
          if ! echo "$v" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.]+)?$'; then
            echo "::error::version '$v' is not semver (e.g. 1.0.0)"; exit 1
          fi
          echo "version=$v" >> "$GITHUB_OUTPUT"
      - name: Build helper binaries
        run: bash cli-helper/scripts/build.sh
      - name: Import Developer ID certificate into throwaway keychain
        env:
          DEVELOPER_ID_CERT_BASE64: ${{ secrets.DEVELOPER_ID_CERT_BASE64 }}
          DEVELOPER_ID_CERT_PASSWORD: ${{ secrets.DEVELOPER_ID_CERT_PASSWORD }}
        run: |
          KEYCHAIN_PATH="$RUNNER_TEMP/build.keychain-db"
          KEYCHAIN_PWD="$(uuidgen)"
          security create-keychain -p "$KEYCHAIN_PWD" "$KEYCHAIN_PATH"
          security set-keychain-settings -lut 21600 "$KEYCHAIN_PATH"
          security unlock-keychain -p "$KEYCHAIN_PWD" "$KEYCHAIN_PATH"
          echo "$DEVELOPER_ID_CERT_BASE64" | base64 -d > "$RUNNER_TEMP/cert.p12"
          security import "$RUNNER_TEMP/cert.p12" -k "$KEYCHAIN_PATH" \
            -P "$DEVELOPER_ID_CERT_PASSWORD" -T /usr/bin/codesign
          rm "$RUNNER_TEMP/cert.p12"
          security set-key-partition-list -S apple-tool:,apple:,codesign: \
            -s -k "$KEYCHAIN_PWD" "$KEYCHAIN_PATH"
          security list-keychains -d user -s "$KEYCHAIN_PATH" login.keychain
          IDENTITY=$(security find-identity -v -p codesigning "$KEYCHAIN_PATH" \
            | awk -F'"' '/Developer ID Application/ {print $2; exit}')
          if [ -z "$IDENTITY" ]; then
            echo "::error::No Developer ID Application identity found in imported cert"
            exit 1
          fi
          echo "DEVELOPER_ID_IDENTITY=$IDENTITY" >> "$GITHUB_ENV"
      - name: Write App Store Connect API key
        env:
          APPLE_KEY_CONTENT: ${{ secrets.APPLE_KEY_CONTENT }}
        run: |
          printf '%s' "$APPLE_KEY_CONTENT" > "$RUNNER_TEMP/AuthKey.p8"
          echo "APPLE_KEY_PATH=$RUNNER_TEMP/AuthKey.p8" >> "$GITHUB_ENV"
      - name: Sign and notarize
        env:
          CAPGO_APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
          APPLE_KEY_ID: ${{ secrets.APPLE_KEY_ID }}
          APPLE_ISSUER_ID: ${{ secrets.APPLE_ISSUER_ID }}
        run: bash cli-helper/scripts/sign-and-notarize.sh
      - name: Smoke test signed binary
        run: |
          set +e
          out=$(./cli-helper/dist/helper-arm64)
          code=$?
          set -e
          [ "$code" -ne 0 ] || { echo "::error::expected non-zero exit"; exit 1; }
          echo "$out" | jq -e '.ok == false and .errorCode == "INVALID_ARGS"' > /dev/null \
            || { echo "::error::unexpected helper output: $out"; exit 1; }
      - name: Gate test — keychain-export without handshake is FORBIDDEN_CALLER
        run: |
          set +e
          out=$(./cli-helper/dist/helper-arm64 keychain-export --sha1 "$(printf 'a%.0s' {1..40})" --output /tmp/x.p12 --passphrase p | cat)
          set -e
          echo "$out" | jq -e '.ok == false and .errorCode == "FORBIDDEN_CALLER"' > /dev/null \
            || { echo "::error::gate did not reject missing handshake: $out"; exit 1; }
      - name: Prepare packages
        run: node cli-helper/scripts/prepare-publish.mjs "${{ steps.version.outputs.version }}"
      - name: Publish darwin-arm64
        working-directory: cli-helper/npm/darwin-arm64
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
        run: npm publish --provenance --access public
      - name: Publish darwin-x64
        working-directory: cli-helper/npm/darwin-x64
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
        run: npm publish --provenance --access public
      - name: Create tag + GitHub release
        uses: softprops/action-gh-release@v2
        with:
          tag_name: cli-helper-${{ steps.version.outputs.version }}
          target_commitish: ${{ github.sha }}
          files: |
            cli-helper/dist/helper-arm64
            cli-helper/dist/helper-x64
          make_latest: false
          token: "${{ secrets.PERSONAL_ACCESS_TOKEN }}"
```

New secret referenced: `APPLE_TEAM_ID` (set in Task 12 alongside the cert secrets).

- [ ] **Step 2: Add the strip assertion to `publish_cli.yml`**

Insert after the "Build CLI" step (after line 37):

```yaml
      - name: Assert dev-only env override is stripped from release bundle
        run: |
          if grep -q "CAPGO_KEYCHAIN_HELPER_PATH" cli/dist/index.js; then
            echo "::error::CAPGO_KEYCHAIN_HELPER_PATH leaked into the release bundle — dead-code elimination failed"
            exit 1
          fi
```

- [ ] **Step 3: Validate workflow syntax**

Run: `node -e "const fs=require('fs');const yaml=require('js-yaml');yaml.load(fs.readFileSync('.github/workflows/publish_cli_helper.yml','utf8'));console.log('YAML OK')"`
Expected: `YAML OK`. (If `js-yaml` is unavailable, `brew install actionlint && actionlint .github/workflows/publish_cli_helper.yml` is the better check.)

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/publish_cli_helper.yml .github/workflows/publish_cli.yml
git commit -m "ci: keychain helper sign/notarize/publish workflow + release strip assertion"
```

---

### Task 12: Apple setup + local dry run (user-guided)

No repo files change here (except possibly the Team ID constant if it differs from Task 4). Performed by the user with agent guidance.

- [ ] **Step 1: Create the Developer ID Application certificate**

User actions (requires **Account Holder** role on the Apple Developer team):
1. https://developer.apple.com/account/resources/certificates → `+` → **Developer ID Application** → follow CSR instructions (Keychain Access → Certificate Assistant → Request a Certificate From a Certificate Authority, saved to disk).
2. Download the `.cer`, double-click to install into the login keychain.
3. Keychain Access → My Certificates → right-click the "Developer ID Application: …" entry → Export as `.p12` with a password.

- [ ] **Step 2: Record the Team ID and reconcile the constant**

Run: `security find-identity -v -p codesigning | head -5` — the Developer ID line ends in `(TEAMID)`.
If it differs from the `CAPGO_APPLE_TEAM_ID` committed in Task 4, update the constant in `cli/src/build/onboarding/macos-signing.ts` and commit (`fix(cli): correct Apple Team ID for helper verification`).

- [ ] **Step 3: Set GitHub secrets**

```bash
base64 -i DeveloperID.p12 | gh secret set DEVELOPER_ID_CERT_BASE64 --repo Cap-go/capgo
gh secret set DEVELOPER_ID_CERT_PASSWORD --repo Cap-go/capgo   # paste the export password
gh secret set APPLE_TEAM_ID --repo Cap-go/capgo                 # the 10-char Team ID
```

(`APPLE_KEY_ID`, `APPLE_ISSUER_ID`, `APPLE_KEY_CONTENT`, `NPM_TOKEN`, `PERSONAL_ACCESS_TOKEN` already exist.)

- [ ] **Step 4: Verify the App Store Connect API key can notarize**

The key needs **Developer role or higher**. Local dry run (binaries from Task 2 exist):

```bash
export DEVELOPER_ID_IDENTITY="$(security find-identity -v -p codesigning | awk -F'"' '/Developer ID Application/ {print $2; exit}')"
export CAPGO_APPLE_TEAM_ID=<team id>
export APPLE_KEY_ID=<key id> APPLE_ISSUER_ID=<issuer id> APPLE_KEY_PATH=<path to .p8>
bash cli-helper/scripts/sign-and-notarize.sh
```

Expected: both binaries report `Notarization accepted` and both `codesign --verify` checks pass. Validates the cert, the key's notarization permission, and the exact command set before CI runs.

---

### Task 13: Release sequencing

- [ ] **Step 1: Merge everything except Task 9** (the `optionalDependencies` change stays unmerged/uncommitted until Step 3).

- [ ] **Step 2: Dispatch the helper release for 1.0.0**

From the GitHub Actions UI ("Build and publish CLI keychain helper" → Run
workflow → version `1.0.0`), or:

```bash
gh workflow run publish_cli_helper.yml --repo Cap-go/capgo -f version=1.0.0
```

Watch: `gh run watch --repo Cap-go/capgo`. The run signs, notarizes, publishes,
and creates the `cli-helper-1.0.0` tag + release. Then verify:

```bash
npm view @capgo/cli-keychain-darwin-arm64@1.0.0 dist.tarball
npm view @capgo/cli-keychain-darwin-x64@1.0.0 dist.tarball
```

Expected: both resolve. Confirm provenance badges on npmjs.com.

- [ ] **Step 3: Execute Task 9** (optionalDependencies + lockfile), merge it.

- [ ] **Step 4: Manual acceptance on this Mac**

```bash
cd "$(mktemp -d)" && npm init -y >/dev/null && npm i @capgo/cli
node -e "const {execFileSync}=require('node:child_process');const p='node_modules/@capgo/cli-keychain-darwin-arm64/helper';execFileSync('/usr/bin/codesign',['--verify','--strict','-R','=anchor apple generic and certificate leaf[field.1.2.840.113635.100.6.1.13] and certificate leaf[subject.OU] = \"'+process.env.TEAM_ID+'\"',p]);console.log('signature OK')" TEAM_ID=<team id>
```

Then run the real onboarding export flow once (`npx @capgo/cli build init` → iOS → import existing) and confirm: no "compiling helper" step, successful P12 export, two Keychain prompts max. If an Intel Mac or Rosetta terminal is available, repeat there (x64 package).

- [ ] **Step 5: Regression — `--no-optional` produces the guidance error**

```bash
cd "$(mktemp -d)" && npm init -y >/dev/null && npm i @capgo/cli --omit=optional
```

Run the import flow; expected: hard error naming `@capgo/cli-keychain-darwin-arm64` with reinstall guidance (no crash, no swiftc mention).

- [ ] **Step 6: Cut the CLI release** per the normal `cli-X.Y.Z` tag process. The release workflow's new strip assertion must pass.

---

## Self-review notes

- Spec coverage: package layout + SECURITY.md + README (T1), Swift subcommand/gate/FORBIDDEN_CALLER (T1), build targets (T2), version stamping (T3), name mapping + requirement + result-code union (T4), resolution + verification + env override (T5), compile-path removal + subcommand/handshake invocation (T6), UI removal (T7), build defines/externals/copy removal (T8), optionalDependencies (T9), sign/notarize (T10), CI pipeline + strip assertion + gate test (T11), Apple runbook (T12), release ordering + manual acceptance + `--no-optional` regression (T13). All spec sections map to tasks.
- Type consistency: binary name is `helper` everywhere (package `files`, `prepare-publish.mjs` dest, `resolveHelperBinary`'s `join(dirname(...), 'helper')`, fake-helper test fixture, CI paths). Subcommand token `keychain-export` + `--invoked-by capgo-cli` handshake match between Swift `main` dispatch (T1), the `exportP12FromKeychain` spawn args (T6), and the CI gate test (T11). `FORBIDDEN_CALLER` appears in the Swift enum (T1), the TS `SwiftHelperResult.errorCode` union (T4), and the CI gate test (T11). `SpawnResult` (existing) is reused by `CodesignRunner`.
- Known accepted wart: Task 6's commit leaves `app.tsx` typecheck-broken until Task 7 (called out inline with a squash alternative).
