# Build Pre-Scan — Design

**Date:** 2026-06-06
**Status:** Approved design, pending implementation plan
**Owner:** CLI (`cli/src/build/prescan/`)

## Problem

Most cloud-build failures are user-preventable and statically detectable, yet they surface only after zip + upload + runner dispatch + minutes of build time — and often with the real error buried (or invisible, e.g. fastlane pre-boot crashes). Production data from the 209 most recent builder jobs with retained logs:

| Failure signature | Hits |
|---|---|
| provisioning profile problems | 96 |
| "expired" (certs/profiles) | 60 |
| missing `cordova.variables.gradle` (skipped `cap sync`) | 55 |
| "No variants exist" (bun isolated linker / unsynced plugins) | 51 |
| wrong P12/keystore password | 7 |

Goal: catch these **before** the build is requested, greenlight-style (RevylAI/greenlight is the structural reference: parallel scanners, severity-tagged findings, sub-second, JSON for CI).

## Decisions (locked during brainstorming)

1. **Integration: both** — a standalone `capgo build prescan [appId]` command **and** an automatic run inside `build request` before zipping/uploading.
2. **Scope: local + remote** — offline file checks plus Capgo-API checks (apikey permission, app exists). Remote checks are *skipped with a visible notice* when offline or no apikey.
3. **Blocking model:**
   - `ERROR` findings always abort (auto-fail).
   - `WARNING` findings: interactive → prompt "proceed / exit and fix"; non-interactive → print and proceed.
   - `--fail-on-warnings` flag promotes warnings to fatal (CI usage).
   - `--prescan-ignore-fatal` (on `build request`; `--ignore-fatal` on the standalone command): **diagnostic mode** — the scan still runs and the full report is printed, but nothing blocks and warnings don't prompt. Unlike `--no-prescan`, the user still sees every finding. Mutually exclusive with `--fail-on-warnings` (the CLI rejects the combination).
   - `--no-prescan` on `build request` skips the scan entirely (emergency escape hatch).
4. **Output: terminal + `--json`** — findings are structured objects from day one.
5. **Architecture: Approach A** — check-registry engine inside the CLI (not a separate package, not server-side). A server-side "deep scan" tier is an explicit v2 candidate.

## Architecture

```
cli/src/build/prescan/
├── engine.ts          # runPrescan(ctx, checks) → PrescanReport; parallelizes independent checks
├── types.ts           # Check, Finding, ScanContext, PrescanReport, Severity
├── context.ts         # buildScanContext(): parses capacitor config, loads credentials,
│                      #   locates native projects, optional supabase client
├── report.ts          # terminal reporter (grouped by severity, fix hints) + JSON reporter
├── prompt.ts          # interactive proceed/exit-and-fix gate for warnings
├── checks/
│   ├── shared/        # apikey-permission, app-exists, credentials-saved,
│   │                  #   cap-sync-stale, node-linker-layout, bundle-id-consistency
│   ├── ios/           # p12-opens, p12-expiry, profile-expiry, profile-bundle-match,
│   │                  #   profile-type-vs-mode, cert-profile-pairing, targets-covered,
│   │                  #   infoplist-sanity, asc-key-valid
│   ├── android/       # keystore-opens, keystore-expiry, cordova-vars-present,
│   │                  #   gradle-props-heuristics, play-sa-json, flavor-exists,
│   │                  #   agp8-package-attr
│   └── android-manifest/  # 31 checks ported from Android Lint + manifest-merger
│       ├── parse.ts       # one XML parse shared by all manifest checks
│       ├── fatal/         # 17 fatal checks (see inventory)
│       └── warn/          # 14 warning checks
└── index.ts           # registry: CHECKS list; prescanCommand() for CLI wiring
```

### Core types

```ts
type Severity = 'error' | 'warning' | 'info'

interface Finding {
  id: string            // e.g. 'ios/cert-profile-pairing'
  severity: Severity
  title: string         // one-line, user-facing
  detail?: string       // what we found, with file paths/values
  fix?: string          // imperative fix instruction
  docsUrl?: string
}

interface Check {
  id: string
  platforms: ('ios' | 'android')[]   // or both
  remote?: boolean                    // requires supabase client; skipped offline
  appliesTo?: (ctx: ScanContext) => boolean  // e.g. play-sa-json only when Play configured
  run: (ctx: ScanContext) => Promise<Finding[]>
}

interface ScanContext {
  appId: string
  platform: 'ios' | 'android'
  projectDir: string
  config: CapacitorConfig            // via existing getConfig()
  credentials?: LoadedCredentials    // via existing credentials.ts loaders
  distributionMode?: 'app_store' | 'ad_hoc'
  androidFlavor?: string
  supabase?: SupabaseClient          // undefined → remote checks skipped
  fs: { /* thin readFile/exists wrappers for testability */ }
}
```

### Engine behavior

- Checks run in parallel (they are independent; each does its own small file reads). The shared AndroidManifest XML parse and the credential loads happen once in `buildScanContext` / `android-manifest/parse.ts`, not per-check.
- A check that *throws* produces an `info` finding `prescan/check-crashed` (never blocks the build because the scanner itself is buggy) — the scanner must never be worse than no scanner.
- Remote checks with no `supabase` client emit one collective `info` finding: "N remote checks skipped (offline / no apikey)".
- Hard time budget: 10 s overall; checks racing past it are cancelled and reported as skipped. Target < 2 s typical.

### Reuse (no new heavy dependencies)

- `mobileprovision-parser.ts` — already extracts expiry, team ID, profile type, cert SHA-1s.
- `pbxproj-parser.ts` — signable targets + bundle IDs.
- `node-forge` (already in package.json, currently unused) — P12 open/expiry/SHA-1; PKCS12 keystores. JKS keystores: parse header + alias table directly (format is documented; read-only needs no crypto) — fall back to `keystore-opens` = skipped with info if parsing fails.
- `assertCliPermission` / `cli_check_permission` RPC — remote permission check.
- Info.plist + AndroidManifest: one small XML parser (`fast-xml-parser`, ~no deps) added as the single new dependency.

## CLI surface

```
capgo build prescan [appId]
  --platform <ios|android>     # required (or resolved like build request)
  --path <dir>                 # project dir, default cwd
  -a, --apikey <key>           # enables remote checks
  --android-flavor <name>
  --ios-dist <app_store|ad_hoc>
  --json                       # structured report to stdout, exit code semantics below
  --fail-on-warnings           # warnings exit non-zero / abort build
  --ignore-fatal               # diagnostic mode: report everything, exit 0, never block
  -v, --verbose                # show passing checks too

capgo build request …          # unchanged surface, plus:
  --no-prescan                 # skip the automatic scan entirely
  --prescan-ignore-fatal       # scan + report, but never block the build
  --fail-on-warnings
```

**Exit codes (standalone):** 0 = clean, warnings-accepted, or `--ignore-fatal`; 1 = errors found; 2 = warnings found with `--fail-on-warnings`. `--json` always prints the full report regardless of exit code. `--ignore-fatal`/`--prescan-ignore-fatal` and `--fail-on-warnings` together are rejected as contradictory.

**Auto-run placement in `build request`:** after appId/platform/credential resolution (so ctx is complete), **before** `zipDirectory` — nothing is uploaded if prescan errors.

## Check inventory (53)

Severity: E = error (fatal), W = warning (prompt), E/W = threshold-split. L/R = local/remote.

### Cross-platform (6)

| id | validates | sev | l/r |
|---|---|---|---|
| shared/apikey-permission | apikey valid + `app.build_native` on appId (RBAC RPC) | E | R |
| shared/app-exists | appId exists in an org the key can access | E | R |
| shared/credentials-saved | credentials exist for platform + distribution mode requirements met | E | R |
| shared/cap-sync-stale | webDir build exists; package.json Capacitor plugins reflected in native project | E | L |
| shared/node-linker-layout | bun isolated / pnpm symlink layout breaking `../node_modules/@capacitor/*` resolution | E | L |
| shared/bundle-id-consistency | capacitor appId ↔ pbxproj PRODUCT_BUNDLE_IDENTIFIER ↔ gradle applicationId | W | L |

### iOS (9)

| id | validates | sev | l/r |
|---|---|---|---|
| ios/p12-opens | P12 opens with saved password (node-forge) | E | L |
| ios/p12-expiry | cert expired = E; expires <30 days = W | E/W | L |
| ios/profile-expiry | each provisioning profile, same split | E/W | L |
| ios/profile-bundle-match | profile app identifier matches bundle ID (wildcard-aware) | E | L |
| ios/profile-type-vs-mode | profile type matches requested distribution mode | E | L |
| ios/cert-profile-pairing | P12 cert SHA-1 ∈ profile DeveloperCertificates (top failure: 96 hits) | E | L |
| ios/targets-covered | every signable pbxproj target covered by provisioning map | E | L |
| ios/infoplist-sanity | CFBundleVersion/ShortVersion present (presence-only: `$(MARKETING_VERSION)`-style build-setting refs are valid); URL schemes RFC-1738 valid (no underscores, #2431); purpose strings non-empty/non-placeholder | E/W | L |
| ios/asc-key-valid | .p8 parses as EC key; key-ID/issuer-ID format (when app_store without --output-upload) | E | L |

### Android core (7)

| id | validates | sev | l/r |
|---|---|---|---|
| android/keystore-opens | keystore (JKS/PKCS12) opens, alias exists | E | L |
| android/keystore-expiry | signing cert validity (Play: ≥ Oct 2033 for new apps) | W | L |
| android/cordova-vars-present | cordova.variables.gradle exists when Cordova plugins installed (55 hits) | E | L |
| android/gradle-props-heuristics | -Xmx vs module count; parallel off with >30 modules; workers.max=1 + parallel=true conflict | W | L |
| android/play-sa-json | service-account JSON: parses, type=service_account, private_key + client_email | E | L |
| android/flavor-exists | --android-flavor exists as productFlavor in build.gradle | E | L |
| android/agp8-package-attr | `package="…"` in manifest alongside gradle `namespace` (AGP 8+ hard failure) | E | L |

### AndroidManifest pack (31) — ported from Android Lint (`platform/tools/base` detectors: ManifestDetector.kt, SecurityDetector.java, ManifestTypoDetector.java, ExportedFlagDetector.kt, PermissionErrorDetector.kt) + AGP manifest-merger failure modes

Key research insight: lint "Fatal" ≠ build failure. The **merger-level** checks (xml-valid, tools-ns, merge-conflict-attrs, minsdk-below-plugins, agp8-package-attr) are not covered by lint at all and are the most frequent Capacitor build killers — they are the highest-value rows.

**Fatal (17):** manifest-xml-valid (well-formed, one `<application>`) · exported-with-filter (intent-filter w/o explicit `android:exported`, targetSdk ≥ 31; MAIN/LAUNCHER must be `true`) · manifest-typo (edit-distance ≤ 3 vs ~30 valid tags) · namespace-typo · missing-prefix · wrong-parent · multiple-uses-sdk · duplicate-activity · unique-permission · manifest-resource-ref · tools-ns-missing · merge-conflict-attrs (allowBackup/label/theme/appComponentFactory/usesCleartextTraffic without tools:replace) · minsdk-below-plugins · hardcoded-debuggable · mock-location · expired-target-sdk (below Play minimum) · icon-resolves

**Warning (14):** expiring-target-sdk/old-target-api · gradle-overrides · version-fields (versionCode int literal, versionName literal, both present in manifest or gradle) · app-icon-declared (+ mipmap not drawable) · manifest-order · duplicate-uses-feature · data-extraction-rules · exported-unprotected (+ grant-uri path="/") · permission-typos (system/custom near-miss, known-invalid values, reserved redeclaration, signature-level never-granted) · query-all-packages · coarse-fine-location · fgs-type-and-permission (targetSdk ≥ 34) · deeplink-filters (malformed data tags, autoVerify web+custom split, missing autoVerify, unique data attributes) · cleartext-traffic

Merged-manifest awareness: targetSdk/version checks treat `build.gradle`/`variables.gradle` as authoritative, manifest as fallback (Capacitor convention).

### Consciously excluded from v1

TV/Wear/ChromeOS form-factor checks; Play policy "insights" needing Console context (surfaced as docs links only when the relevant permission is present); code-scope analysis (MissingPermission call sites — greenlight-style codescan = v2); App Store content compliance (greenlight exists); live App Store Connect / Play Developer API validation (v2 "deep scan" tier); network_security_config.xml deep validation; deprecated/legacy detectors.

## Error handling

- Scanner bugs must never block a legitimate build: per-check try/catch → `info` finding; engine-level failure → log + proceed as if `--no-prescan` (with a visible warning).
- Unreadable/missing files that a check needs: that's a *finding* (usually the error the check exists for), not a crash.
- Remote check network failure: downgraded to `info` "could not verify (network)" — never blocks offline users.

## Testing

- **Unit per check:** fixture-driven — each check gets `fixtures/<check-id>/{pass,fail-*}/` minimal project trees. Target: every E-severity check has at least pass + fail fixtures.
- **Parser tests:** real-world samples — expired .mobileprovision, PKCS12 + JKS keystores with known passwords, manifests from actual Capacitor templates (old AGP 7 style with `package=`, new AGP 8 style).
- **Engine tests:** severity aggregation, warning-prompt gating (interactive vs not), `--fail-on-warnings`, `--ignore-fatal` (reports but exits 0 / build proceeds; rejected when combined with `--fail-on-warnings`), JSON shape snapshot, check-crash isolation, remote-skip behavior.
- **Regression suite seed:** every failure class from the June 4–5 saga gets a fixture (TutorialBuild1 permission case, cordova vars missing, bun linker, workers.max conflict, underscore URL scheme).

## Rollout

1. Ship `build prescan` standalone first (one release) — zero risk to existing flows; gather false-positive reports.
2. Next release: auto-run in `build request` (warnings prompt; errors block) once the standalone command has baked.
3. Track findings via existing CLI telemetry (`sendEvent`): finding ids fired, build proceeded/aborted — measures prevented failures and false-positive pressure.

## v2 candidates (explicitly deferred)

Server-side "deep scan" job (real runner environment, greenlight `verify` analogy) · live ASC/Play API credential validation · network_security_config validation · codescan tier · auto-fix (`prescan --fix` for mechanical fixes like adding `android:exported`).
