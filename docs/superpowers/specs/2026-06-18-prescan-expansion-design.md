# Prescan Expansion Design Spec

Date: 2026-06-18
Branch: `wolny/build-prescan`
Status: implementation-ready (TDD each check)

Merges four research streams (Android manifest pack, Android gradle/project pack,
remote store-access reuse, conditional-enablement matrix) into one buildable plan.
Current registry: **22 checks** (`registry.ts:12-19`). Target after expansion:
**44 checks** (+22 net). See the cut list for what was rejected and why.

All checks obey the existing engine contracts:
- Per-check budget **10s** (`DEFAULT_CHECK_TIMEOUT_MS`, `engine.ts:6`), enforced by `Promise.race` in `runIsolated` (`engine.ts:64-87`). The race resolves a timeout Finding but does **not** abort in-flight work — remote checks must pass their own `timeoutMs`/`AbortController` well under 10s.
- Every `run()` and `appliesTo()` is already wrapped in crash isolation (`engine.ts:30-42`, `73-86`): a throw downgrades to an `info` `prescan/check-crashed` finding, never blocks a build. So a malformed manifest/gradle file degrades, not aborts.
- `remote: true` is skipped **only when `!ctx.supabase`** (`engine.ts:44-45`). This is the wrong predicate for Google/Apple network checks — see "Remote store-access" below for why those use `appliesTo` + self-classified network degradation instead of `remote: true`.
- `Finding.title/detail/fix` are printed to the terminal and `--json` (captured in CI logs): **never** put credential material in them (`types.ts:12-16`).

---

## 1. Parsing infrastructure

### Decision: regex + a tiny shared scanner. Do NOT re-add `fast-xml-parser`.

`ios-plist.ts:6-11` documents the prevailing convention: object-mode XML parsers lose sibling order, so full-tree parsing buys nothing for the shallow attribute/tag inspection these checks do, and `fast-xml-parser` was already removed. Capacitor's `AndroidManifest.xml` is small (~30-80 lines), single-file, hand-shaped from a known template. A targeted regex + one element scanner covers every manifest check. No new npm dependency.

### New shared helper file: `cli/src/build/prescan/manifest.ts`

Sibling to `gradle.ts`. Parsed **once** in the manifest checks (each check calls the cached readers; readers memoize per `projectDir` like the P12 cache in `ios-certs.ts:53-80`). Exports:

- `readAndroidManifest(projectDir): { raw: string, path: string } | null` — reads `android/app/src/main/AndroidManifest.xml` via `readTextIfExists`.
- `stripXmlComments(raw): string` — removes `<!-- ... -->` so typo/duplicate/exported scans don't trip on commented-out elements.
- `scanElements(raw): Array<{ tag, attrs: Record<string,string>, start, end, rawOpenTag }>` — single global tag regex `/<([a-zA-Z][\w:-]*)((?:\s+[\w:.-]+\s*=\s*"[^"]*")*)\s*\/?>/g` + attr sub-regex `/([\w:.-]+)\s*=\s*"([^"]*)"/g`. **This is the one primitive** consumed by the typo, missing-prefix, exported, duplicate-component, multiple-uses-sdk, debuggable, mock-location, query-all-packages, exported-unprotected and deep-link checks — keeps each check ~20 lines and avoids ~12 redundant regex passes.
- `hasNamespaceXmlns(raw)` — detect `xmlns:android="http://schemas.android.com/apk/res/android"` and `xmlns:tools`.
- `applicationBlock(raw): { openTag, body, start, end } | null` — slice between `<application ...>` and `</application>` (XML analogue of `extractBraceBlock`).
- `MANIFEST_VALID_TAGS: Set<string>` — the 32 Android Lint valid tags (manifest, application, activity, activity-alias, service, provider, receiver, instrumentation, intent, meta-data, action, category, data, uses-permission, uses-permission-sdk-23, permission, permission-tree, permission-group, uses-feature, uses-library, uses-native-library, uses-sdk, uses-configuration, supports-screens, compatible-screens, supports-gl-texture, grant-uri-permission, path-permission, queries, package, profileable, property).
- `editDistance(a, b, max): number` — bounded Levenshtein capped at 3 (Android Lint's `Lint.isEditableTo(tag, valid, 3)`). Search `cli/src` for an existing edit-distance util first; only add this 15-line version if none exists. **No string-distance npm package.**
- Re-export `SCHEME_RE` from `ios-plist.ts` (or move it to a tiny shared `xml-grammar.ts`) so the deep-link scheme check uses the exact same RFC-3986 grammar as the iOS scheme check.

### New shared helper for gradle: extend `cli/src/build/prescan/gradle.ts`

- `stripGradleComments(source): string` — remove block `/* ... */`, line `// ...`. **Required** because `gradleApplicationId` today (`gradle.ts:39-42`) would match a commented `// applicationId` line. Harden `gradleApplicationId` to comment-strip first.
- `variablesGradle(projectDir): Record<string, number>` — parse `android/variables.gradle` `ext { name = <int> }` into a key→number map (regex each `name = <int>` inside the `ext{...}` body). Needed because the canonical Capacitor template puts SDK literals in `variables.gradle` and `app/build.gradle` only references `rootProject.ext.*`.
- `resolveSdk(projectDir, dim): number | null` — prefer literal in comment-stripped `app/build.gradle` (`/<dim>(?:Version)?\s*[=\s]\s*(\d+)/`), then `variablesGradle`, then `<uses-sdk android:<dim>Version>` from the manifest. Returns `null` (skip the dimension) when unresolved. Shared by the SDK-floor gradle check and the manifest min/target-SDK checks so they agree.

Reuse existing `extractBraceBlock` + `childBlockNames` (`android-project.ts:138-190`) for flavor/dimension parsing.

---

## 2. NEW checks — final table

### Group A — Android manifest (new file `checks/android-manifest.ts`)

| id | platform | severity | local/remote | appliesTo (exact) | detection (concrete) | fix |
|---|---|---|---|---|---|---|
| `android/manifest-well-formed` | android | error | local | `ctx => readAndroidManifest(ctx.projectDir) !== null` | On comment-stripped raw: count non-self-closed `<application` opens vs `</application>`; flag if opens !== 1. Also flag gross structural breakage: `<application>` never closed before `</manifest>`, a second `<manifest`, or missing `</manifest>`. Only fire on these high-confidence breakages; no full XML validator. | Manifest must have exactly one `<application>` nested in `<manifest>`; remove the duplicate/extra block or close the unclosed tag. |
| `android/manifest-tag-typo` | android | error | local | manifest present | `scanElements` tag names (comment-stripped). For each tag NOT in `MANIFEST_VALID_TAGS` and NOT containing `:` (skip namespaced/custom), `editDistance` against each valid tag; if min distance is 1..3 flag with nearest suggestion. distance>3 → ignore (never guess). | Rename the misspelled tag to the suggested valid manifest element. |
| `android/manifest-namespace-uri` | android | error | local | manifest present | On `<manifest ...>` open tag: require `xmlns:android="http://schemas.android.com/apk/res/android"` present and the URI **exactly** equal (flag near-miss URIs). If any `android:`-prefixed attribute is used but `xmlns:android` absent → error. If `tools:` attributes used but `xmlns:tools="http://schemas.android.com/tools"` absent → error. | Declare the exact `xmlns:android` (and `xmlns:tools` when `tools:` attrs used) URI on `<manifest>`. |
| `android/manifest-missing-prefix` | android | error | local | manifest present | For a hardcoded allowlist of always-android-namespaced attrs (`name, exported, label, icon, theme, permission, authorities, debuggable, allowBackup, targetSdkVersion, minSdkVersion, value`) on the elements they belong to, flag the **bare** attribute (no `android:` and no other `xxx:` prefix) via the `scanElements` attrs map. Skip anything ambiguous/custom. | Prefix with `android:` (e.g. `android:name`, `android:exported`). |
| `android/manifest-exported-missing` | android | error | local | `ctx => resolveSdk(ctx.projectDir,'targetSdk') === null || resolveSdk(...) >= 31` (treat unknown as >=31 for modern Capacitor) | For each `<activity\|service\|receiver>`, slice body to matching close tag; if body contains `<intent-filter` and the open tag has no `android:exported=`, emit error. Additionally: the MAIN+LAUNCHER activity must have `android:exported="true"` (LAUNCHER with `false`/missing is an install/launch failure). | Add `android:exported="true"` to launcher/deep-link components and `="false"` to internal components that have intent-filters. |
| `android/manifest-multiple-uses-sdk` | android | error | local | manifest present | Count `<uses-sdk` in comment-stripped raw; flag if > 1. | Keep at most one `<uses-sdk>`; prefer setting SDKs in `android/variables.gradle`. |
| `android/manifest-duplicate-component` | android | error | local | manifest present | From `scanElements`, collect `android:name` per element type (activity, service, receiver, provider). Normalize relative names (leading `.` / bare) against package/applicationId so `.MainActivity` == `com.x.MainActivity`. Flag any name appearing >=2x within the same type (activity-alias shares the activity namespace). **Skip if package/applicationId unresolvable** (don't guess). | Remove the duplicate declaration; each component `android:name` must be unique. |
| `android/manifest-unique-permission` | android | error | local | manifest present | Collect `android:name` from all `<permission>` + `<permission-group>`; flag any name declared >1x. (Custom permissions only — `uses-permission` dupes are harmless.) | Declare each custom `<permission>` name exactly once. |
| `android/manifest-hardcoded-debuggable` | android | error | local | manifest present | In `<application>` open tag find `android:debuggable=`. `="true"` → error (Play rejects debuggable release uploads); `="false"` → warning (redundant; Gradle owns this). | Remove `android:debuggable` from the manifest; the release build type sets it automatically. |
| `android/manifest-mock-location` | android | error | local | manifest present | `uses-permission` `android:name` == `android.permission.ACCESS_MOCK_LOCATION` → error. | Remove the test-only `ACCESS_MOCK_LOCATION` permission. |
| `android/manifest-exported-unprotected` | android | warning | local | manifest present | For each exported `<service\|receiver\|provider>` (explicit `android:exported="true"`, OR has intent-filter on pre-31 target) with no `android:permission=` → warning. For `<provider>`: also flag `android:grantUriPermissions="true"` + `<grant-uri-permission android:path="/">` or `pathPattern=".*"`. **Exclude activities** (exported activities are normal). | Add `android:permission` to the exported component, or set `android:exported="false"`; narrow over-broad grant-uri paths. |
| `android/manifest-query-all-packages` | android | warning | local | manifest present | `uses-permission` `android:name` == `android.permission.QUERY_ALL_PACKAGES` → warning + Play package-visibility `docsUrl`. | Use a scoped `<queries>` element, or justify via Play's permission-declaration form. |
| `android/manifest-deeplink-valid` | android | warning | local | `ctx => manifest contains a VIEW+BROWSABLE intent-filter` | For each `<intent-filter>` with `action VIEW` + `category BROWSABLE`, inspect child `<data>`: (a) `android:autoVerify="true"` but scheme not http/https; (b) http(s)+autoVerify with no `android:host`; (c) `android:scheme` failing `SCHEME_RE`. Only the unambiguous structural errors; keep warning. | Give deep-link `<data>` a valid lowercase RFC-3986 scheme + host; only use `autoVerify` on http/https filters with a host. |

(13 manifest checks. The SDK-policy checks below were consolidated into the gradle group to avoid duplicate target/min-SDK reporting across two files.)

### Group B — Android gradle/project (extend `checks/android-project.ts`, plus SDK checks)

| id | platform | severity | local/remote | appliesTo (exact) | detection (concrete) | fix |
|---|---|---|---|---|---|---|
| `android/applicationid-present` | android | error | local | `ctx => appBuildGradle(ctx.projectDir) !== null` | Comment-strip `app/build.gradle`. Live assignment `/(^|[\s;{(])applicationId\s*[=(\s]["'][\w.]+["']/` → OK. Else if `extractBraceBlock(gradle,'productFlavors')` exists AND its comment-stripped body contains `applicationId`/`applicationIdSuffix` → OK (flavor-provided). Else error. (Harden `gradleApplicationId` to comment-strip — today it matches the commented line.) | Add `applicationId "your.app.id"` to defaultConfig (or per flavor); must match the Capacitor appId. |
| `android/capacitor-build-gradle-applied` | android | error | local | `ctx => appBuildGradle(ctx.projectDir) !== null` | Comment-strip gradle. (a) contains `/apply\s+from:\s*["']capacitor\.build\.gradle["']/`? (b) `android/app/capacitor.build.gradle` exists? apply present + file missing → error (run `cap sync`). apply absent → error. Both present → OK. | Run `npx cap sync android`; ensure `app/build.gradle` has `apply from: 'capacitor.build.gradle'`. |
| `android/gradle-wrapper-present` | android | error | local | `ctx => existsSync(join(ctx.projectDir,'android'))` | `readTextIfExists(android/gradle/wrapper/gradle-wrapper.properties)`. null → error (wrapper missing). Else if `!/^distributionUrl=\S+/m` → error (no distributionUrl). Optionally enrich detail by checking `android/gradlew` exists. | Restore the wrapper: `npx cap sync android` or `gradle wrapper`; commit `android/gradle/wrapper/` + `android/gradlew`. |
| `android/flavor-dimensions` | android | error | local | `ctx => appBuildGradle(ctx.projectDir) !== null AND a comment-stripped productFlavors block with >=1 parsed flavor exists` | `block = extractBraceBlock(gradle,'productFlavors')`; `flavors = childBlockNames(block).filter(n=>n!=='dimension')`; empty → OK (exotic DSL). `hasTopLevelDimensions = /flavorDimensions?\s*[=(\s]["']/` on comment-stripped gradle → OK if present. Else for each flavor `extractBraceBlock(block,name)` test `/(^|[\s;{])dimension\s+["']/`; if ANY flavor lacks `dimension` AND no top-level `flavorDimensions` → error listing the flavors. | Add `flavorDimensions "default"` and give every flavor `dimension "default"`. |
| `android/google-services-file` | android | error | local | `ctx => appBuildGradle non-null AND an UNGUARDED com.google.gms.google-services apply is detected (comment-stripped)` | Find `/(apply\s+plugin:\s*["']com\.google\.gms\.google-services["']\|id\s*[('"]+com\.google\.gms\.google-services)/`. Walk backward over comment-stripped text; require surrounding `try{}`/`if(){}` brace-depth == 0 (unguarded). Guarded (template's `try{ if(servicesJSON.text){ apply ... }}`) → OK. Unguarded AND `!existsSync(android/app/google-services.json)` → error. (Optionally cross-check package.json for `@capacitor-firebase/*` to enrich detail.) | Add `android/app/google-services.json` (gitignored — must be supplied to the cloud build), or remove the unconditional gms apply. |
| `android/local-properties-committed` | android | warning | local | `ctx => existsSync(join(ctx.projectDir,'android','local.properties'))` | Parse via `/^(sdk\|ndk)\.dir\s*=\s*(.+)$/m`. If a value is absolute (`/` or `^[A-Za-z]:\\`) → warning. **Echo only the KEY**, never the path: `detail: 'local.properties pins an absolute sdk.dir'`. | Remove `android/local.properties` from VCS and gitignore it; the cloud builder sets its own SDK location. |
| `android/sdk-floors` | android | warning | local | `ctx => resolveSdk yields a numeric value for at least one of min/target/compile` | Resolve compileSdk/targetSdk/minSdk via `resolveSdk` (gradle literal > variables.gradle > manifest). compileSdk<34 OR targetSdk<34 OR minSdk<23 → one warning per violated floor with the detected number. Unresolved dimension → skip silently. **Never error** (floors evolve). | Raise in `variables.gradle`: compileSdkVersion>=34, targetSdkVersion>=34, minSdkVersion>=23. |
| `android/target-sdk-play` | android | error\|warning | local | `ctx => resolveSdk(ctx.projectDir,'targetSdk') !== null` | Resolve targetSdk. Constants (hardcoded with comment + `docsUrl`): `PLAY_TARGET_MIN_AVAILABLE=34`, `PLAY_TARGET_MIN_SUBMIT=35` (new app + any update, effective 2025-08-31), `LATEST_STABLE=35`. target<34 → **error** (cannot publish/stay available). 34<=target<35 → **error when `willUploadToPlay(ctx)`** else **warning** (behind on platform behavior, approaching enforcement). target>=35 → OK. Single check, single finding (mutually exclusive severities) to avoid double-reporting. | Set `targetSdkVersion = 35` in `android/variables.gradle`. |
| `android/min-sdk-capacitor` | android | error | local | `ctx => Capacitor major AND minSdk both resolvable` | Resolve Capacitor major from package.json (`@capacitor/core`/`@capacitor/android`). Floor map: Cap6→22, Cap7→23, Cap8→24, unknown/newer→24. Resolve minSdk via `resolveSdk`. If minSdk < floor → error. Skip if either unresolvable. | Raise `minSdkVersion` in `android/variables.gradle` to at least the Capacitor floor (e.g. 23 for Cap7). |
| `android/version-fields` | android | warning\|error | local | `ctx => appBuildGradle(ctx.projectDir) !== null` | Capacitor convention: versionCode/Name in `app/build.gradle` defaultConfig. Check `/versionCode\s+\S+/` and `/versionName\s+["']/` (accept a gradle variable/function as PRESENT — don't require an int literal); fall back to manifest `android:versionCode`/`android:versionName`. versionCode in NEITHER → warning, **escalate to error when `willUploadToPlay(ctx)`** (store rejects). versionName missing in both → warning. `skipBuildNumberBump` does not change the presence requirement. | Set `versionCode` (integer) + `versionName` in `android/app/build.gradle` defaultConfig (or via CLI build-number bump). |

(10 gradle/project checks.)

### Group C — Remote store-access (new file `checks/store-access.ts`)

| id | platform | severity | local/remote | appliesTo (exact) | detection (concrete) | fix |
|---|---|---|---|---|---|---|
| `android/play-sa-access` | android | error/info | **not `remote`** (network via own AbortController) | `ctx => willUploadToPlay(ctx)` | Import `validateServiceAccountJson` from `../../onboarding/android/service-account-validation.js` (`:389`). `jsonBytes = Buffer.from(ctx.credentials!.PLAY_CONFIG_JSON,'base64')`; `packageName = gradleApplicationId(ctx.projectDir) ?? ctx.config?.appId ?? ctx.appId`. Call with `timeoutMs: 7000` + a `signal` from an own `AbortController` firing at ~7s. Map: `ok:true`→[]; `no-app-access`→error (reuse `result.message`, contains SA email + package = not secrets); `token-error`→error (terse, do not echo message); `network-error`→info; `shape-error`→info or skip (the local `android/play-sa-json` owns shape). | Invite the service-account email in Play Console → Users and permissions (the validator's message names the exact email + package). |
| `ios/asc-key-access` | ios | error/warning/info | **not `remote`** (network via own AbortController) | `ctx => willUploadToAppStore(ctx)` | Add a thin shared helper `assertAscAccess({ keyId, issuerId, p8Pem, bundleId?, signal?, timeoutMs? })` next to `apple-api.ts` that composes `generateJwt` (`apple-api.ts:14`) + a signal-aware `/v1/apps?filter[bundleId]=<id>&limit=1` call and returns a Play-validator-shaped union. In the check: decode `APPLE_KEY_CONTENT` → PEM (`forge.util.decode64`); `keyId=APPLE_KEY_ID`, `issuerId=APPLE_ISSUER_ID`; `bundleId` from pbxproj (`findSignableTargets`/`readPbxproj` already used in `shared.ts:126-132`); `timeoutMs ~7000`. Map: 401/403→error (reuse `verifyApiKey`'s copy + its `FORBIDDEN.REQUIRED_AGREEMENTS_MISSING_OR_EXPIRED` branch, `apple-api.ts:121`); 2xx but bundle id absent from results→warning; network/5xx→info. | App Store Connect rejected the API key — check Key ID / Issuer ID / .p8 and that the key has Admin/Developer access (or sign the pending agreement). |

(2 remote store-access checks.)

**Total NEW: 13 + 10 + 2 = 25 checks. Registry after expansion: 22 + 25 = 47.**
(If an implementer drops a borderline manifest check during TDD — e.g. `manifest-deeplink-valid` proves too FP-prone — the net stays within the 18-26 target. Recommended floor to keep: all error-severity checks; warning-severity manifest checks are the first cut candidates.)

---

## 3. The two upload predicates

Add to a new `cli/src/build/prescan/upload-intent.ts` (imported by `store-access.ts` and `android-project.ts`):

```ts
import type { ScanContext } from './types'

// Play upload requires the SA JSON to reach the builder. --no-playstore-upload
// deletes PLAY_CONFIG_JSON upstream (request.ts:1393-1396) BEFORE prescan runs
// (gate at request.ts:1597), so its mere presence in the merged set is the exact
// upload signal. Zero new ScanContext fields required.
export function willUploadToPlay(ctx: ScanContext): boolean {
  return ctx.platform === 'android' && Boolean(ctx.credentials?.PLAY_CONFIG_JSON)
}

// iOS upload requires app_store mode AND the complete ASC API key triplet.
// ad_hoc never uploads; a partial triplet never uploads. Default undefined→app_store
// (build request normalizes to app_store before the gate; for standalone scans the
// over-eager direction is safe because the triplet check below still gates it).
export function willUploadToAppStore(ctx: ScanContext): boolean {
  if (ctx.platform !== 'ios')
    return false
  const mode = ctx.distributionMode ?? 'app_store'
  if (mode !== 'app_store')
    return false
  const c = ctx.credentials
  return Boolean(c?.APPLE_KEY_ID && c?.APPLE_ISSUER_ID && c?.APPLE_KEY_CONTENT)
}
```

### ScanContext additions: NONE required.

Both predicates read fields the context already carries:
- `ctx.credentials` — populated from `mergedCredentials` at the gate (`request.ts:1620`) and from `mergeCredentials` standalone (`context.ts:32-33`).
- `ctx.distributionMode` — already on `ScanContext` (`types.ts:30`); populated from `options.iosDistribution` at the gate (via `iosDist`, `request.ts:1622`) / `--ios-dist` / saved `CAPGO_IOS_DISTRIBUTION` (`context.ts:44`).
- `ctx.platform` — already present (`types.ts:25`).

This works **because prescan runs after** the `--no-playstore-upload` deletion (`request.ts:1393` < gate `1597`) and after `CAPGO_IOS_DISTRIBUTION` is normalized to `app_store` on the build-request path.

### Optional future-proofing (do NOT ship now)

Only if the gate ever moves *before* the L1393 deletion: add one optional field `playstoreUpload?: boolean` to `ScanContext` (`types.ts`) and `BuildScanContextArgs` (`context.ts:9-19`), thread it at the gate call site (`request.ts:1616-1625` → add `playstoreUpload: options.playstoreUpload`) and through `PrescanCommandOptions` (`command.ts:14-32`) + `buildScanContext` (`context.ts:25-48`), default `undefined→true`, then `willUploadToPlay = ... && ctx.playstoreUpload !== false && Boolean(...PLAY_CONFIG_JSON)`. **Not required today.** `buildMode === 'debug'` likewise needs no predicate gate (builder/fastlane handles debug+creds edge cases).

---

## 4. Remote store-access — reuse, auth, secrets, budget

### Reuse decisions

- **Play (`android/play-sa-access`): reuse `validateServiceAccountJson` as-is.** No extraction needed — it is pure, dependency-injected, never throws, and returns a precise discriminated union. Located `cli/src/build/onboarding/android/service-account-validation.ts:389`. Internally: `parseServiceAccountKey` (`:68`) → `signSaAssertion` RS256 JWT (`:116`, `jsonwebtoken`) → `exchangeJwtForAccessToken` raw fetch (`:164`) → `probeAppAccess` (`:280`) which does `POST {androidpublisher}/applications/{packageName}/edits` (best-effort `DELETE` after, edit auto-expires in 7 days). HTTP 401/403/404 at the probe → `kind:'no-app-access'`. This is fastlane `supply`'s auth path: passes here ⇒ passes at build.
- **Apple (`ios/asc-key-access`): compose, no single drop-in exists.** Use `generateJwt` (`apple-api.ts:14`, ES256, `aud: appstoreconnect-v1`, wants the **decoded PEM string**) + an app-access probe. `verifyApiKey` (`apple-api.ts:100`) is the closest existing probe (`GET /certificates?limit=1`, throws `AppleApiHttpError` with `.status`/`.code`, has the agreements branch at `:121`); `listApps` (`:636`) does unfiltered `/apps`. Extract a thin `assertAscAccess(...)` next to `apple-api.ts` doing `generateJwt` + a **signal-aware** `GET /v1/apps?filter[bundleId]=<id>&limit=1`, returning a Play-validator-shaped union so the prescan check and (optionally) the onboarding verify-key step can share it and not drift.

### Auth approach

- Both hand-roll JWT + `fetch` (deps confirmed in `cli/package.json`: `jsonwebtoken ^9.0.3`, `node-forge ^1.4.0`). **No `googleapis`/`google-auth-library`.** Play = RS256 SA-JWT → OAuth token → `edits.insert` probe. Apple = ES256 key-JWT → `/apps` probe.

### `remote` flag: do NOT set it on either check

The engine's `remote: true` skips only when `!ctx.supabase` (`engine.ts:44-45`) — the wrong predicate, since these talk to Google/Apple, not Capgo's Supabase. Instead:
- Gate intent-to-upload via `appliesTo` (`willUploadToPlay`/`willUploadToAppStore`), which already has crash isolation and runs before the remote-skip filter.
- Self-classify offline/transport failures as `info` (the Play validator already returns `network-error`; the Apple helper returns a `network` kind), so an offline scan degrades cleanly to non-blocking notices rather than silently skipping.

### Secret-handling rules (mandatory)

- **Never** put `PLAY_CONFIG_JSON`, `APPLE_KEY_CONTENT`, `APPLE_KEY_ID`, `APPLE_ISSUER_ID` raw values in `Finding.title/detail/fix` (`types.ts:12-16`, `ios-certs.ts:168-170`).
- Play validator only surfaces `client_email`/`project_id`/Google error strings — safe to print. `no-app-access` message (SA email + package) is safe.
- For `token-error`, keep the finding terse; do not echo the validator message verbatim if unsure.
- Reused `apple-api.ts`/`service-account-validation.ts` log to the internal support bundle via `appendInternalLog` + `safeHeaders` (response-header allowlist; `Authorization` never logged) — inherited for free.
- Engine `sanitizeCrashDetail` (`engine.ts:14-17`) redacts 40+ char base64 runs and caps 200 chars — a backstop, not a license to leak.

### 10s budget + offline rules

- Pass `timeoutMs: 7000` (Play) and a 7s `AbortController` (Apple) so the network fetch aborts cleanly **before** the engine's 10s `Promise.race`. The race resolves a timeout Finding but does not cancel in-flight fetches — only the check's own signal does.
- `ascFetch` (`apple-api.ts:59`) currently has no AbortSignal/timeout. The cleanest fix is to add an optional `signal` param to `ascFetch` (benefits onboarding too) and route the new helper through it; the fallback is a local signal-aware `fetch` in the helper. Add the optional `signal`.

### Precise "no access" → ERROR mapping

| Probe outcome | Finding severity | id |
|---|---|---|
| Play token valid, package 401/403/404 (`kind:'no-app-access'`) | **error** | `android/play-sa-access` |
| Play key rejected at token endpoint (`kind:'token-error'`) | error | `android/play-sa-access` |
| Play transport/5xx/abort/timeout (`kind:'network-error'`) | info | `android/play-sa-access` |
| Play `shape-error` | info or skip (local `play-sa-json` owns it) | `android/play-sa-access` |
| Apple 401/403 (incl. agreements branch) | **error** | `ios/asc-key-access` |
| Apple 2xx but project bundle id absent from `/apps` | warning | `ios/asc-key-access` |
| Apple network/5xx/abort/timeout | info | `ios/asc-key-access` |

---

## 5. File / registry plan

### New files
- `cli/src/build/prescan/manifest.ts` — shared manifest parse primitives (section 1).
- `cli/src/build/prescan/upload-intent.ts` — `willUploadToPlay` / `willUploadToAppStore` (section 3).
- `cli/src/build/prescan/checks/android-manifest.ts` — Group A (13 checks).
- `cli/src/build/prescan/checks/store-access.ts` — Group C (2 checks).
- `cli/src/build/onboarding/apple-access.ts` (or inline in `apple-api.ts`) — `assertAscAccess(...)` helper.

### Extended files
- `cli/src/build/prescan/gradle.ts` — add `stripGradleComments`, `variablesGradle`, `resolveSdk`; harden `gradleApplicationId` to comment-strip.
- `cli/src/build/prescan/checks/android-project.ts` — add Group B local checks (`applicationid-present`, `capacitor-build-gradle-applied`, `gradle-wrapper-present`, `flavor-dimensions`, `google-services-file`, `local-properties-committed`, `sdk-floors`, `target-sdk-play`, `min-sdk-capacitor`, `version-fields`).
- `cli/src/build/onboarding/apple-api.ts` — add optional `signal` to `ascFetch`.

### `registry.ts` changes
Add imports for the 13 manifest checks, 10 new android-project checks, 2 store-access checks, and append all 25 to `ALL_CHECKS`. Keep grouping comments by platform/domain (manifest block, gradle block, store-access block) consistent with the existing layout (`registry.ts:12-19`).

### Count
22 existing + 25 new = **47 total checks**.

---

## 6. Cut list (researched, rejected)

| Candidate | Reason |
|---|---|
| `manifest-xml-valid` full XML validator | Out of scope; only high-confidence structural breakage flagged via `manifest-well-formed`. A real validator is FP-prone on hand-shaped manifests and adds a dependency we removed (`fast-xml-parser`). |
| `release signingConfig referenced` | Canonical Capgo template ships NO release signing block; the cloud builder injects signing via env-var keystore. Flagging its absence is a guaranteed false positive. |
| `duplicate plugin application` (gradle) | No real cloud-build failure mode observed; high FP risk against generated `apply` lines. |
| `missing/empty applicationId` (separate) | Merged into `android/applicationid-present`. |
| bundleId mismatch (manifest) | Already covered by `shared/bundle-id-consistency` (`shared.ts:107`). |
| AGP package= conflict (separate) | Already covered by `android/agp8-package-attr` (`android-project.ts:227`). |
| module-count / heap (separate) | Already covered by `android/gradle-props-heuristics` (`android-project.ts:49`). |
| `manifest-app-icon-resolves` | Cut: generated/flavor-specific resources make on-disk resolution FP-prone; low signal vs. the noise it would create. Reconsider only if support data shows missing-icon build failures. |
| Separate `manifest-target-sdk-below-play` + `manifest-target-sdk-old` + gradle `target-sdk` | Consolidated into one gradle-group `android/target-sdk-play` check (single resolver, single finding, severity escalates on upload intent) to eliminate cross-file double-reporting. |
| Separate manifest min-SDK vs gradle min-SDK | Consolidated: min-SDK-vs-Capacitor lives in gradle group (`android/min-sdk-capacitor`); SDK floors in `android/sdk-floors`. Manifest `<uses-sdk>` is only a fallback source inside `resolveSdk`. |
| Gating `play-sa-json` / `asc-key-valid` on upload predicates | Keep both broad (format checks are cheap and useful even on the boundary / partial-triplet / ad_hoc-with-key setups). No change to their current `appliesTo`. |
