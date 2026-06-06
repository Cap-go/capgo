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

## Decisions (settled during brainstorming)

| Decision | Choice |
| --- | --- |
| Source location | New top-level `cli-helper/` dir in the capgo monorepo; **Swift source moves there** (`cli-helper/src/keychain-export.swift`) as single source of truth |
| Package shape | Per-arch packages (esbuild style): `@capgo/cli-keychain-darwin-arm64`, `@capgo/cli-keychain-darwin-x64` |
| Install mechanism | Both listed in `@capgo/cli` `optionalDependencies` with `^` range; `os`/`cpu` fields make npm/bun/pnpm install at most one |
| Fallback | **None.** The runtime swiftc compile path and tmp-binary cache are deleted. Missing/unverifiable binary → hard error with install guidance |
| Min macOS | x64 slice: macOS 10.15 (oldest macOS that runs Node 20, the CLI's floor); arm64 slice: macOS 11.0 |
| Versioning | Independent semver, starting 1.0.0; release tag `cli-helper-X.Y.Z`; released **only when helper source changes**, not per CLI release |
| Pipeline | Tag-triggered GitHub Actions workflow on `macos-latest`: build → codesign → notarize → verify → npm publish with provenance |
| Signing | Developer ID Application certificate; hardened runtime + secure timestamp; notarized via `notarytool` with existing App Store Connect API key secrets |
| Binary trust | CLI verifies the package-resolved binary's code signature (Developer ID + Capgo Team ID designated requirement) before executing it; failure is a hard error |
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
   the release artifact is an arbitrary-binary-execution vector. This is also
   the dev bootstrap path: before the npm packages exist (or when iterating on
   the Swift source), developers compile locally with one documented `swiftc`
   command and point the override at the result.
2. Precompiled package:
   `createRequire(import.meta.url).resolve('@capgo/cli-keychain-darwin-' + archSuffix + '/keychain-export')`
   where `archSuffix` maps `process.arch` `arm64`→`arm64`, `x64`→`x64`.
   Wrapped in try/catch; verify the file exists and is executable, **then
   verify its code signature** (below) before use.
3. Anything else — unsupported arch, package not installed, file missing, or
   signature verification failure — is a **hard error** (see Error handling).
   There is no compilation fallback.

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
- On verification failure (non-zero exit): hard error identifying the package,
  path, and codesign output. A binary that fails verification is never
  executed and there is nothing to fall back to — this is the desired
  security posture (possible tampering must stop the flow, not degrade it).
- Cost: one `codesign` spawn (~tens of ms) per export invocation — negligible
  against the Keychain prompts that follow.
- `helperPathOverride` (existing test-only option passed programmatically to
  `exportP12FromKeychain`) bypasses the signature check; it is not reachable
  from user input.

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

## Benefits recap

- No Xcode Command Line Tools requirement — at all.
- No first-run compile delay; "compiling helper" UI step deleted, along with
  the entire runtime-compilation code path (less code, smaller attack surface).
- Developer ID signature is stable across releases → Keychain "Always Allow"
  decisions persist across CLI upgrades (UX improvement over today).
- The CLI only ever executes a binary whose Apple-validated signature chains
  to Capgo's team — npm provenance + notarization + runtime requirement check
  give a verifiable supply chain for a binary that reads users' keychains.

## Out of scope

- Stapling (impossible for bare executables; not needed for npm distribution).
- Windows/Linux variants (helper is macOS-only by nature).
