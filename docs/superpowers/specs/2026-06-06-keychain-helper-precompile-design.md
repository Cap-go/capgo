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
- produces a fresh ad-hoc-signed binary per CLI version, so macOS Keychain
  "Always Allow" ACL decisions do **not** persist across CLI upgrades
  (ACLs are tied to the calling binary's code signature).

## Goal

Ship precompiled, Developer-ID-signed, notarized helper binaries as separate
macOS-only npm packages, resolved at runtime by the CLI, with the existing
swiftc compile path retained as fallback.

## Decisions (settled during brainstorming)

| Decision | Choice |
| --- | --- |
| Source location | New top-level `cli-helper/` dir in the capgo monorepo; **Swift source moves there** (`cli-helper/src/keychain-export.swift`) as single source of truth |
| Package shape | Per-arch packages (esbuild style): `@capgo/cli-keychain-darwin-arm64`, `@capgo/cli-keychain-darwin-x64` |
| Install mechanism | Both listed in `@capgo/cli` `optionalDependencies` with `^` range; `os`/`cpu` fields make npm/bun/pnpm install at most one |
| Fallback | Keep existing chain: cached tmp binary → swiftc compile from bundled source (still requires Xcode CLT) |
| Min macOS | x64 slice: macOS 10.15 (oldest macOS that runs Node 20, the CLI's floor); arm64 slice: macOS 11.0 |
| Versioning | Independent semver, starting 1.0.0; release tag `cli-helper-X.Y.Z`; released **only when helper source changes**, not per CLI release |
| Pipeline | Tag-triggered GitHub Actions workflow on `macos-latest`: build → codesign → notarize → verify → npm publish with provenance |
| Signing | Developer ID Application certificate; hardened runtime + secure timestamp; notarized via `notarytool` with existing App Store Connect API key secrets |
| Binary trust | CLI verifies the package-resolved binary's code signature (Developer ID + Capgo Team ID designated requirement) before executing it; failure falls through to swiftc with a warning |
| Env override | `CAPGO_KEYCHAIN_HELPER_PATH` exists in dev builds only — stripped from npm release builds via build-time define + dead-code elimination |

## Architecture

### Repository layout

```
cli-helper/
├── src/
│   └── keychain-export.swift         # moved from cli/src/build/onboarding/
├── npm/
│   ├── darwin-arm64/package.json     # @capgo/cli-keychain-darwin-arm64
│   └── darwin-x64/package.json       # @capgo/cli-keychain-darwin-x64
├── scripts/
│   ├── build.sh                      # swiftc per-arch builds
│   ├── sign-and-notarize.sh          # codesign + notarytool submit --wait
│   └── prepare-publish.mjs           # stamps tag version, copies binaries into npm/*/
└── README.md
```

### Package manifests

```json
{
  "name": "@capgo/cli-keychain-darwin-arm64",
  "version": "1.0.0",
  "description": "Precompiled macOS (Apple Silicon) keychain-export helper for @capgo/cli",
  "os": ["darwin"],
  "cpu": ["arm64"],
  "files": ["keychain-export"],
  "license": "Apache 2.0"
}
```

(`-x64` variant identical with `"cpu": ["x64"]`.)

- The binary ships as a plain executable `keychain-export` at the package root.
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
   the release artifact is an arbitrary-binary-execution vector.
2. Precompiled package:
   `createRequire(import.meta.url).resolve('@capgo/cli-keychain-darwin-' + archSuffix + '/keychain-export')`
   where `archSuffix` maps `process.arch` `arm64`→`arm64`, `x64`→`x64`; any
   other arch skips this step. Wrapped in try/catch; verify the file exists
   and is executable, **then verify its code signature** (below) before use.
   On hit: use directly (no tmp copy, no compile); `isHelperCached()` returns
   true so the UI skips the "compiling helper" step.
3. Cached tmp binary at `$TMPDIR/capgo-keychain-export-v{version}` (existing).
4. swiftc compile from bundled `.swift` source (existing; needs Xcode CLT).

### Signature verification of the precompiled binary

Before executing a package-resolved binary (step 2), the CLI verifies it was
signed by the Capgo team using a `codesign` designated-requirement check:

```
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
- On verification failure (non-zero exit): log a warning naming the package
  and path, skip the binary, and fall through to step 3/4 — local compilation
  of the bundled, auditable source is the safe degradation.
- Cost: one `codesign` spawn (~tens of ms) per export invocation — negligible
  against the Keychain prompts that follow.
- `helperPathOverride` (existing test-only option passed programmatically to
  `exportP12FromKeychain`) bypasses the signature check; it is not reachable
  from user input.

Build changes in `cli/build.mjs`:

- Mark both helper packages as `external` in `Bun.build` so they resolve from
  `node_modules` at runtime instead of being bundled.
- Add `define: { __CAPGO_ALLOW_HELPER_ENV_OVERRIDE__: 'false' }` to the
  release build (and `'true'` under `NODE_ENV=development`) so the env
  override is dead-code-eliminated from the npm artifact.
- The `.swift` copy into `dist/` now sources from
  `../cli-helper/src/keychain-export.swift`.

Path updates for the source move:

- `resolveSwiftSourcePath()` dev-mode candidate points at
  `cli-helper/src/keychain-export.swift`.
- Tests referencing the old path are updated.

The helper's stdout contract (one line of JSON: `ok`, `p12Path`,
`errorCode`, `osStatus`, …) is unchanged; `exportP12FromKeychain` parsing is
untouched.

## CI pipeline — `.github/workflows/publish_cli_helper.yml`

Trigger: push of tags matching `cli-helper-[0-9]*`. Single job on
`macos-latest` (both arches cross-compile on one runner; no artifact passing).

1. **Build** (per arch):
   - `swiftc src/keychain-export.swift -framework Security -O -target arm64-apple-macos11 -o keychain-export-arm64`
   - `swiftc src/keychain-export.swift -framework Security -O -target x86_64-apple-macos10.15 -o keychain-export-x64`
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
   authority is the Developer ID cert; smoke-run the arm64 binary with invalid
   args and assert non-zero exit + `INVALID_ARGS` JSON envelope on stdout.
5. **Publish**: `prepare-publish.mjs` reads the version from the tag, stamps
   both manifests (failing fast on mismatch), copies each binary into its
   package dir, then `npm publish --provenance --access public` for both
   packages back-to-back after all gates pass.
6. **GitHub release**: same `softprops/action-gh-release` pattern as
   `publish_cli.yml`, with both binaries attached as release assets.

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

- Each runtime resolution step falls through silently to the next — except a
  **signature verification failure**, which falls through with a logged
  warning (possible tampering is worth surfacing). Only when all steps fail
  does the user see an error — the existing swiftc/Xcode-CLT message,
  extended to mention reinstalling with optional dependencies enabled.
- No partial publishes: both packages publish at the end of the workflow,
  after both binaries pass signing, notarization, and verification gates.
- Notarization flakiness is contained to helper releases (rare), never blocks
  CLI releases.

## Testing

- **Unit** (extend `cli/test/test-macos-signing.mjs`; cross-platform, no real
  Keychain): resolution order — env override wins in dev builds; fake package
  dir resolves before swiftc path; missing package falls through;
  non-executable file falls through; signature-check failure (mocked codesign
  exit ≠ 0) falls through with warning; signature-check pass executes the
  package binary.
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
- **Fallback regression**: install with `--no-optional`, confirm the swiftc
  path still engages.

## Benefits recap

- No Xcode CLT requirement for the overwhelmingly common path.
- No first-run compile delay; "compiling helper" UI step disappears.
- Developer ID signature is stable across releases → Keychain "Always Allow"
  decisions persist across CLI upgrades (UX improvement over today).
- npm provenance + notarization give a verifiable supply chain for a binary
  that reads users' keychains.

## Out of scope

- Removing the swiftc fallback (revisit in a future major).
- Stapling (impossible for bare executables; not needed for npm distribution).
- Windows/Linux variants (helper is macOS-only by nature).
