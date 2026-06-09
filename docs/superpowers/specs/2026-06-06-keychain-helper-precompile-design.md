# Precompiled macOS Keychain-Export Helper — Design

**Date:** 2026-06-06
**Status:** Approved design, pending implementation plan

## Problem

The Capgo CLI's macOS signing onboarding exports a code-signing identity from the
user's Keychain via a Swift helper (`keychain-export.swift`). Today the helper
ships as **source** in the npm tarball and is compiled on the user's machine
with `swiftc` on first use. This:

- requires Xcode Command Line Tools at runtime (hard failure without them),
- adds a first-run compile delay and a dedicated "compiling helper" UI step,
- compiles and executes a binary from source at runtime — a large, security-
  sensitive code path (`compileSwiftHelper`, tmp-dir caching, atomic renames),
- produces a fresh ad-hoc-signed binary per CLI version, so macOS Keychain
  "Always Allow" ACL decisions do **not** persist across CLI upgrades
  (ACLs are tied to the calling binary's code signature).

## Goal

Ship precompiled, Developer-ID-signed, notarized helper binaries as separate
macOS-only npm packages, resolved and signature-verified at runtime by the
CLI. The runtime swiftc compilation path is **removed entirely** — the CLI
either runs a verified Capgo-signed binary or fails with clear guidance.

> **AMENDMENT (implemented after design):** the helper now ships **inside a
> hidden `Capgo.app` bundle** (`LSUIElement` agent — no Dock icon), not as a
> bare `helper` binary. Everywhere this spec says "the binary", read "the
> bundle's inner executable at `Capgo.app/Contents/MacOS/capgo`"; the package
> `files` is `["Capgo.app"]`; runtime resolution returns that inner exec after
> verifying the **bundle's** code signature; CI signs + notarizes + **staples**
> the bundle. The win: macOS Keychain prompts during export show the **Capgo
> name + icon** (signed bundles only), and `CFBundleIdentifier =
> app.capgo.cli.helper` keys the "Always Allow" grant. This realizes the
> bundle-packaging half of "Future: native notifications & UI" below; only the
> notification/window *code* remains future. See `cli-helper/README.md`.

## Decisions (settled during brainstorming)

| Decision | Choice |
| --- | --- |
| Source location | New top-level `cli-helper/` dir in the capgo monorepo; **Swift source moves there** (`cli-helper/src/helper.swift`) as single source of truth |
| Package shape | Per-arch packages (esbuild style): `@capgo/cli-keychain-darwin-arm64`, `@capgo/cli-keychain-darwin-x64` |
| Install mechanism | Both listed in `@capgo/cli` `optionalDependencies` with `^` range; `os`/`cpu` fields make npm/bun/pnpm install at most one |
| Fallback | **None.** The runtime swiftc compile path and tmp-binary cache are deleted. Missing/unverifiable binary → hard error with install guidance |
| Min macOS | x64 slice: macOS 10.15 (oldest macOS that runs Node 20, the CLI's floor); arm64 slice: macOS 11.0 |
| Versioning | Independent semver, starting 1.0.0; release tag `cli-helper-X.Y.Z`; released **only when helper source changes**, not per CLI release |
| Pipeline | **Manually dispatched** (`workflow_dispatch` with a `version` input) GitHub Actions workflow on `macos-latest`: build → codesign → notarize → verify → npm publish with provenance; the run creates the `cli-helper-X.Y.Z` git tag + GitHub release itself. Deliberate (human-in-the-loop) because releases are rare and notarization is a flaky external dependency — intentionally diverges from the repo's auto-tag `bump_version.yml` path used by `capgo`/`cli` |
| Signing | Developer ID Application certificate; hardened runtime + secure timestamp; stable code-signing identifier `app.capgo.cli.helper` (preserves Keychain "Always Allow" across re-signs and a future `.app` migration); notarized via `notarytool` with existing App Store Connect API key secrets |
| Binary trust | CLI verifies the package-resolved binary's code signature (Developer ID + Capgo Team ID designated requirement) before executing it; failure is a hard error |
| Env override | `CAPGO_KEYCHAIN_HELPER_PATH` exists in dev builds only — stripped from npm release builds via build-time define + dead-code elimination |
| Binary name | One generic binary named `helper`, invoked with a subcommand (`helper keychain-export …`). Future helpers are new subcommands of the same signed binary, not new files |
| Caller hardening | Anti-footgun gate on the sensitive subcommand (requires an internal handshake flag + non-TTY stdout) — explicitly a non-security-boundary; plus a `SECURITY.md` documenting why the macOS Keychain ACL is the actual boundary. "Always Allow" caching is kept |

## Architecture

### Repository layout

```text
cli-helper/
├── src/
│   └── helper.swift                  # moved+renamed from cli/src/build/onboarding/keychain-export.swift
├── npm/
│   ├── darwin-arm64/package.json     # @capgo/cli-keychain-darwin-arm64
│   └── darwin-x64/package.json       # @capgo/cli-keychain-darwin-x64
├── scripts/
│   ├── build.sh                      # swiftc per-arch builds
│   ├── sign-and-notarize.sh          # codesign + notarytool submit --wait
│   └── prepare-publish.mjs           # stamps tag version, copies binaries into npm/*/
├── SECURITY.md                       # threat model — why the macOS Keychain ACL is the boundary
└── README.md                         # includes dev bootstrap instructions
```

### Package manifests

```json
{
  "name": "@capgo/cli-keychain-darwin-arm64",
  "version": "1.0.0",
  "description": "Precompiled macOS (Apple Silicon) keychain-export helper for @capgo/cli",
  "os": ["darwin"],
  "cpu": ["arm64"],
  "files": ["helper"],
  "license": "Apache 2.0"
}
```

(`-x64` variant identical with `"cpu": ["x64"]`.)

- The binary ships as a plain executable `helper` at the package root.
  No `bin` entry — it is never on PATH; the CLI resolves it by path.
  npm preserves the executable bit from the tarball.
- Both packages always publish at the same version in the same workflow run.

### CLI integration

`@capgo/cli` `package.json`:

```json
"optionalDependencies": {
  "@capgo/cli-keychain-darwin-arm64": "^1.0.0",
  "@capgo/cli-keychain-darwin-x64": "^1.0.0"
}
```

Runtime resolution order in `cli/src/build/onboarding/macos-signing.ts`:

1. `CAPGO_KEYCHAIN_HELPER_PATH` env override — **dev builds only**. The branch
   is guarded by a build-time global (`__CAPGO_ALLOW_HELPER_ENV_OVERRIDE__`)
   defined `false` in the npm release build, so the minifier removes the code
   entirely: the published `dist/index.js` contains neither the branch nor the
   string `CAPGO_KEYCHAIN_HELPER_PATH` (CI asserts this — see Testing). Dev
   builds define it `true`. Rationale: an env-controlled executable path in
   the release artifact is an arbitrary-binary-execution vector. This is also
   the dev bootstrap path: before the npm packages exist (or when iterating on
   the Swift source), developers compile locally with one documented `swiftc`
   command and point the override at the result.
2. Precompiled package:
   `createRequire(import.meta.url).resolve('@capgo/cli-keychain-darwin-' + archSuffix + '/helper')`
   where `archSuffix` maps `process.arch` `arm64`→`arm64`, `x64`→`x64`.
   Wrapped in try/catch; verify the file exists and is executable, **then
   verify its code signature** (below) before use.
3. Anything else — unsupported arch, package not installed, file missing, or
   signature verification failure — is a **hard error** (see Error handling).
   There is no compilation fallback.

The CLI invokes the resolved binary as
`helper keychain-export --sha1 … --output … --passphrase … --invoked-by capgo-cli`,
capturing stdout (piped, not a TTY). The leading `keychain-export` subcommand
and the `--invoked-by` handshake flag feed the anti-footgun gate (see Security
model). The JSON stdout contract is unchanged.

### Signature verification of the precompiled binary

Before executing a package-resolved binary (step 2), the CLI verifies it was
signed by the Capgo team using a `codesign` designated-requirement check:

```text
codesign --verify --strict
  -R '=anchor apple generic
      and certificate leaf[field.1.2.840.113635.100.6.1.13]
      and certificate leaf[subject.OU] = "<CAPGO_APPLE_TEAM_ID>"'
  <binary>
```

This asserts, validated by macOS itself: (a) an Apple-rooted certificate
chain, (b) a Developer ID Application leaf certificate, and (c) Capgo's Apple
Team ID as the signing team. Because the code signature seals the binary's
contents, this also detects post-install tampering — a checksum pin is not
needed (and is impossible anyway: the CLI depends on a `^` range, so it cannot
know the exact binary hash).

- The Team ID is baked into the CLI source as a constant
  (`CAPGO_APPLE_TEAM_ID`), filled in during implementation from the Apple
  Developer account.
- On verification failure (non-zero exit): hard error identifying the package,
  path, and codesign output. A binary that fails verification is never
  executed and there is nothing to fall back to — this is the desired
  security posture (possible tampering must stop the flow, not degrade it).
- Cost: one `codesign` spawn (~tens of ms) per export invocation — negligible
  against the Keychain prompts that follow.
- `helperPathOverride` (existing test-only option passed programmatically to
  `exportP12FromKeychain`) bypasses the signature check; it is not reachable
  from user input.

## Security model

This section is the source for `cli-helper/SECURITY.md`. It exists primarily to
give a documented, defensible "won't fix, by design" answer to the predictable
low-effort report: *"I can invoke your helper directly and export the user's
keychain!"*

**The macOS Keychain ACL prompt is the security boundary, and macOS — not our
code — enforces it against our binary's code signature.** Exporting a private
key triggers an OS-level "Allow / Always Allow" prompt bound to the calling
binary's signature.

**The helper grants a local attacker nothing they don't already have.** An
attacker who can execute our signed `helper` on the victim's machine already
has local code execution as that user, and can call Apple's own
`SecItemExport` / `/usr/bin/security export` directly. The helper is not a
privilege escalation — it is a worse-for-them version of tools already on the
box.

**Why we don't authenticate the caller (it's neither feasible nor valuable):**
- The parent process is `node dist/index.js`; **node is signed by the user's
  Node install, not by Capgo** — there is no Capgo signature on the parent to
  pin.
- A shared secret would live in readable JS in the npm tarball.
- Parent-PID checks are TOCTOU-racy and subject to PID reuse.

**The one narrow residual exposure:** after the user clicks "Always Allow", the
cached ACL grant is bound to our binary, so a *separate malicious local
process* could invoke our helper and ride that grant to export without a fresh
prompt. We accept this, documented, because closing it fully requires dropping
"Always Allow" (re-prompting on every export) and the attacker already has
equivalent access by the reasoning above.

**Anti-footgun gate (explicitly NOT a security boundary).** The sensitive
`keychain-export` subcommand refuses to run unless:
1. the internal handshake flag `--invoked-by capgo-cli` is present, and
2. stdout is not a TTY (the CLI always pipes it).

A failed gate emits `{"ok":false,"errorCode":"FORBIDDEN_CALLER",...}` and exits
non-zero **without** touching the Keychain. This stops casual, accidental, and
naive-script invocation. It does **not** stop a determined local attacker (who
reads the flag straight out of the open-source CLI) — and SECURITY.md says so
in plain language. It is defense-in-depth and a clear "you bypassed a speed
bump, not a boundary" marker, nothing more.

`SECURITY.md` also states the reporting expectation: invoking the helper is
equivalent to the caller invoking Apple's keychain APIs, which any local
process with the user's privileges can already do; reports demonstrating only
that are out of scope by design.

### Code removed from the CLI

- `compileSwiftHelper`, `ensureSwiftHelper`, `resolveSwiftSourcePath`, and the
  tmp-dir binary cache (`compiledHelperPath`) in `macos-signing.ts`.
- `precompileSwiftHelper` and `isHelperCached` exports, and the
  "compiling helper" step in the onboarding UI that calls them.
- The `.swift`-copy-into-`dist/` step in `cli/build.mjs` (source no longer
  ships in the npm tarball).

Build changes in `cli/build.mjs`:

- Mark both helper packages as `external` in `Bun.build` so they resolve from
  `node_modules` at runtime instead of being bundled.
- Add `define: { __CAPGO_ALLOW_HELPER_ENV_OVERRIDE__: 'false' }` to the
  release build (and `'true'` under `NODE_ENV=development`) so the env
  override is dead-code-eliminated from the npm artifact.

The helper's success/failure stdout contract (one line of JSON: `ok`,
`p12Path`, `errorCode`, `osStatus`, …) is unchanged except for the new
`FORBIDDEN_CALLER` error code (anti-footgun gate); the CLI invokes it with the
`keychain-export` subcommand + `--invoked-by capgo-cli` handshake (see
Security model). `exportP12FromKeychain`'s JSON parsing is otherwise untouched.

## CI pipeline — `.github/workflows/publish_cli_helper.yml`

Trigger: `workflow_dispatch` with a required `version` input (e.g. `1.0.0`),
run from the GitHub Actions UI or `gh workflow run`. Single job on
`macos-latest` (both arches cross-compile on one runner; no artifact passing).
The run validates the version is semver, then drives the steps below, and at
the end creates the `cli-helper-<version>` git tag + GitHub release.

1. **Build** (per arch):
   - `swiftc src/helper.swift -framework Security -O -target arm64-apple-macos11 -o dist/helper-arm64`
   - `swiftc src/helper.swift -framework Security -O -target x86_64-apple-macos10.15 -o dist/helper-x64`
2. **Sign**: create a throwaway keychain for the job; import the Developer ID
   Application cert from secrets `DEVELOPER_ID_CERT_BASE64` (.p12) +
   `DEVELOPER_ID_CERT_PASSWORD`; then per binary:
   `codesign --sign "Developer ID Application: <team>" --options runtime --timestamp <binary>`.
   Hardened runtime and secure timestamp are notarization requirements. The
   helper needs no entitlements (non-sandboxed CLI tool using Security
   framework keychain APIs).
3. **Notarize** (per binary): `ditto -c -k` into a zip, then
   `xcrun notarytool submit <zip> --key <p8 from APPLE_KEY_CONTENT> --key-id $APPLE_KEY_ID --issuer $APPLE_ISSUER_ID --wait`
   with a timeout. On rejection, dump `notarytool log` into the job output.
   Bare executables cannot be stapled — expected and acceptable: npm-installed
   files carry no quarantine xattr, and the notarization ticket is available
   online when Gatekeeper does evaluate.
4. **Verify**: `codesign --verify --strict` per binary; assert signing
   authority is the Developer ID cert; run the same designated-requirement
   `codesign --verify -R` check the CLI performs at runtime; smoke-run the
   arm64 binary with no subcommand and assert non-zero exit + `INVALID_ARGS`
   JSON envelope on stdout (the anti-footgun gate guards only the
   `keychain-export` subcommand, so a bare invocation reaches `INVALID_ARGS`).
5. **Publish**: `prepare-publish.mjs` takes the dispatched `version` input,
   stamps both manifests, copies each binary into its package dir, then
   `npm publish --provenance --access public` for both packages back-to-back
   after all gates pass.
6. **Tag + GitHub release**: `softprops/action-gh-release` with
   `tag_name: cli-helper-<version>` (the action creates the tag on the
   dispatched commit), both binaries attached as release assets.

Required workflow permissions: `contents: write`, `id-token: write`
(provenance).

## Apple setup (one-time, user-guided)

Already in place: Apple Developer team; App Store Connect API key secrets
(`APPLE_KEY_ID`, `APPLE_ISSUER_ID`, `APPLE_KEY_CONTENT`).

To do:

1. Create a **Developer ID Application** certificate in the Apple Developer
   portal (Certificates → + → Developer ID Application). Requires the
   **Account Holder** role (Apple policy for Developer ID certs). Export as
   `.p12` with a password; add GitHub secrets `DEVELOPER_ID_CERT_BASE64` and
   `DEVELOPER_ID_CERT_PASSWORD`. Record the team's **Apple Team ID** (the
   `subject.OU` of the cert) — it becomes the `CAPGO_APPLE_TEAM_ID` constant
   in the CLI source for runtime signature verification.
2. Verify the existing App Store Connect API key has **Developer role or
   higher** (required by `notarytool`); validate with a dry-run submission.
3. One full local sign + notarize cycle on a Mac before wiring CI, to validate
   the cert, the key, and the exact command set.

## Error handling

- Helper resolution failures are **hard errors** with specific, actionable
  messages:
  - Package missing (e.g. installed with `--no-optional`, or pnpm config
    skipping optional deps): name the exact package for the user's arch and
    instruct reinstalling with optional dependencies enabled (or
    `npm i @capgo/cli-keychain-darwin-<arch>` directly).
  - Unsupported arch (`process.arch` not `arm64`/`x64`): state that no helper
    exists for this architecture (covers no real Mac today).
  - Signature verification failure: report package, path, and codesign
    output; instruct reinstalling. Never executes the binary.
- Release ordering: the CLI release that adds `optionalDependencies` and
  removes the compile path ships **after** helper 1.0.0 is live on npm.
- No partial publishes: both packages publish at the end of the workflow,
  after both binaries pass signing, notarization, and verification gates.
- Notarization flakiness is contained to helper releases (rare), never blocks
  CLI releases.

## Testing

- **Unit** (rework `cli/test/test-macos-signing.mjs`; cross-platform, no real
  Keychain): resolution order — env override wins in dev builds; fake package
  dir resolves; missing package → hard error naming the arch package;
  non-executable file → hard error; signature-check failure (mocked codesign
  exit ≠ 0) → hard error, binary never spawned; signature-check pass executes
  the package binary. Tests covering the deleted compile path are removed.
- **Release-artifact assertion** (in `publish_cli.yml` after the build step):
  fail the CLI release if `dist/index.js` contains the string
  `CAPGO_KEYCHAIN_HELPER_PATH` — proves the env-override branch was
  dead-code-eliminated from the npm artifact.
- **CI smoke** (in helper workflow): signed arm64 binary runs with invalid
  args → non-zero exit + `INVALID_ARGS` JSON envelope (proves the hardened-
  runtime-signed binary executes). Additionally run the same
  designated-requirement `codesign --verify -R` check the CLI will perform at
  runtime, so a cert/team mismatch is caught at release time, not at user
  runtime.
- **Signature checks** (in workflow): `codesign --verify --strict`; authority
  check; notarization "Accepted" status.
- **Manual acceptance** (once per first release): npm-install a release
  candidate on a Mac, run the onboarding export flow, confirm no "compiling
  helper" step and successful P12 export; cover x64 via Intel Mac or Rosetta.
- **Missing-package regression**: install with `--no-optional`, confirm the
  export flow fails with the actionable install-guidance error (not a crash).
- **Anti-footgun gate** (Swift, run in helper CI): `helper keychain-export …`
  without `--invoked-by capgo-cli` → `FORBIDDEN_CALLER` + non-zero exit + no
  Keychain access; the same with a forced-TTY stdout → `FORBIDDEN_CALLER`. The
  happy path (handshake present, piped stdout) is exercised by the manual
  acceptance run since it needs a real Keychain identity.
- **SECURITY.md presence**: `cli-helper/SECURITY.md` exists and states the
  boundary (macOS Keychain ACL) and the out-of-scope reporting expectation.

## Benefits recap

- No Xcode Command Line Tools requirement — at all.
- No first-run compile delay; "compiling helper" UI step deleted, along with
  the entire runtime-compilation code path (less code, smaller attack surface).
- Developer ID signature is stable across releases → Keychain "Always Allow"
  decisions persist across CLI upgrades (UX improvement over today).
- The CLI only ever executes a binary whose Apple-validated signature chains
  to Capgo's team — npm provenance + notarization + runtime requirement check
  give a verifiable supply chain for a binary that reads users' keychains.

## Future: native notifications & UI (.app bundle)

> **STATUS:** The `Capgo.app` bundle described here is **now implemented** (see
> the AMENDMENT under "Goal"). The helper ships *inside* the signed bundle
> today. What remains future is only the **notification / SwiftUI window code** —
> the bundle that would host it already exists. Read the paragraphs below as the
> rationale for the bundle (delivered) plus the not-yet-built UI on top of it.

Recorded so the path is understood and the cheap-now decisions are captured.
The helper ships inside a signed, hidden (`LSUIElement`) `Capgo.app`; a later
subcommand that needs a macOS notification or a small SwiftUI panel builds on
that existing bundle.

**Why a bundle is required for notifications.** `UNUserNotificationCenter`
requires a bundle identifier; a bare executable has none and the call fails. A
branded notification (Capgo name + icon) therefore needs a `Capgo.app` with an
`Info.plist` (`CFBundleIdentifier`, `CFBundleName`, `CFBundleIconFile`) and a
`Capgo.icns`. Renaming the bare binary to `capgo` does **not** help — the
displayed name/icon come from the bundle, not the filename.

**Staying invisible.** Set `LSUIElement = true` (accessory activation policy):
no Dock icon, no Cmd-Tab entry, no menu bar — yet it can post notifications and
*show a window when needed*. An accessory app keeps **no Dock icon even while a
window is open** (Dock presence tracks the activation policy, not window
visibility). Caveats: windows don't auto-focus (call
`NSApp.activate(ignoringOtherApps: true)` + `makeKeyAndOrderFront`), there's no
app menu bar, and you can optionally flip to `.regular` while a window is up for
focus-grabbing at the cost of a brief Dock-icon flash. Pure headless work
(today's keychain export) never touches AppKit, so it's invisible regardless.

**No Gatekeeper "downloaded from the internet" prompt.** Two independent
reasons, both holding for a bundle exactly as for the bare binary: (1) npm /
bun / pnpm do not set the `com.apple.quarantine` xattr, and (2) the CLI
`execve`s the inner binary directly (`Capgo.app/Contents/MacOS/capgo`), never
`open Capgo.app` — the first-launch Gatekeeper dialog is a LaunchServices/`open`
behavior, not an exec one. The only path that would prompt is a user manually
downloading the GitHub release asset in a browser and double-clicking it — and
a notarized, **stapled** bundle passes even then. (Stapling is a bonus bundles
get that bare executables can't.)

**Decision baked in now (cheap now, expensive later):** the sign step pins a
stable code-signing identifier `app.capgo.cli.helper` (`codesign --identifier`).
macOS keys the Keychain "Always Allow" grant to the code's designated
requirement, which includes the identifier — so a future `Capgo.app` reusing
the same `CFBundleIdentifier` preserves every user's grant across the
bare-binary → bundle migration. Without this, the migration would silently
reset everyone's "Always Allow" once.

**When built, this would add:** a bundle-assembly step in `build.sh`
(`Capgo.app/Contents/{MacOS/capgo, Info.plist, Resources/Capgo.icns}`), bundle
signing + notarization + stapling, npm `files: ["Capgo.app"]`, a CLI resolver
change to `…/Capgo.app/Contents/MacOS/capgo`, and (for notifications) a one-time
`UNUserNotificationCenter` authorization prompt branded "Capgo". The runtime
`codesign -R` requirement and the stable identifier carry over unchanged.

## Out of scope (now)

- Building the `.app` bundle / native UI (see Future section above).
- Stapling the bare executable (impossible for bare executables; not needed for
  npm distribution since npm doesn't quarantine).
- Windows/Linux variants (helper is macOS-only by nature).
