# iOS Onboarding — Remote App Verification (App Store Connect)

**Date:** 2026-06-03
**Status:** Design approved, pending implementation plan
**Scope:** Capgo CLI — `build init` / `build onboarding` wizard, iOS only
**Branch:** `worktree-builder-app-remote-check` (off `wolny/fix-cli-builder-cta-table`)

## Problem

During the Capgo Builder onboarding, the iOS bundle ID used for all Apple-side
work (distribution certificate, provisioning profile, `ensureBundleId`, the
provisioning map) is resolved **purely from local files** — `capacitor.config`
(`config.appId`) and `project.pbxproj` (`PRODUCT_BUNDLE_IDENTIFIER`), compared
against each other by `detectIosBundleIds` (`cli/src/build/onboarding/bundle-id-detector.ts`).
The `confirm-app-id` step (`cli/src/build/onboarding/ui/app.tsx`) only prompts
when those **local** sources disagree.

The local value can be wrong (stale `capacitor.config`, a typo, a dev-tunnel
suffix, a copied project). When it is, two failures occur — both **silent and
late**, only surfacing at TestFlight upload time for `app_store` builds:

1. **Bundle-ID divergence** — the bundle ID the build signs does not match any
   app in the user's App Store Connect (ASC) account. `ensureBundleId` silently
   *registers a brand-new identifier* in the Apple Developer portal, and an
   `app_store` build's TestFlight upload is later rejected.
2. **App does not exist** — there is no ASC *app record* for the bundle ID at
   all, so an `app_store` build has nothing to upload to.

Today nothing checks the **remote truth** (what apps actually exist on Apple)
before committing to a bundle ID.

## Goal

Stop silently trusting the local bundle ID. After the user provides their ASC
API key (`.p8`), use App Store Connect to surface the real app identity, catch
the two failure modes **early with clear guidance**, and let the user pick the
correct app — without ever blocking onboarding or editing their project files in
v1.

## Key constraints (discovered, load-bearing)

- **Apple vs Google asymmetry.** ASC API can enumerate the account
  (`GET /v1/apps`, `GET /v1/bundleIds`). The Google Play Developer API has **no
  list-all-apps endpoint** (per-package model). → **This feature is iOS only.**
  Android onboarding is unchanged.
- **The bundle ID matters for every build, not just onboarding.** Saved
  credentials contain `CAPGO_IOS_PROVISIONING_MAP` (bundle ID → profile,
  `cli/src/build/request.ts:1462-1473`). Every cloud build runs `xcodebuild`,
  which signs the **Release `PRODUCT_BUNDLE_IDENTIFIER` from `pbxproj`** and
  looks up the matching profile in that map. For builds to work, the profile's
  bundle ID and the project's Release build ID **must agree**. There is no
  separate "app ID variable" to set — the build re-derives it from project files
  each time.
- **Onboarding can always continue.** Cert + profile creation only need the
  bundle ID *registered as an identifier* (which `ensureBundleId` auto-creates);
  they do **not** need an ASC *app* to exist. The ASC app only matters at
  **TestFlight upload time**, i.e. only for **`app_store` mode**. `ad_hoc`
  (`cli/src/build/onboarding/ui/steps/ios-import.tsx:132` — "Ad-hoc (no
  TestFlight upload)") never needs it.
- **Distribution mode.** The remote check is relevant only in **`app_store`
  mode** (the create-new default and import-app_store). `ad_hoc` skips it.
- **Debug vs Release.** `parsePbxprojBundleId` already prefers the Release
  config. The comparison must **anchor on the Release build ID** and ignore
  Debug-only IDs (e.g. a `.debug`/`.dev` suffix variant of the Release ID) so a
  debug suffix never false-triggers the picker.
- **Lean dependencies.** The CLI deliberately hand-parses native files with
  small regexes (`pbxproj-parser.ts`, `bundle-id-detector.ts`) — no plist
  library, no Trapeze. v1 adds **no** native-file-editing dependency.

## v1 scope decision: detect + guide only

Both *fix* actions are **guidance-only** in v1:

- **Bundle-ID mismatch (Problem 1):** warn with the exact manual fix; **never**
  edit `pbxproj`/`capacitor.config`.
- **App does not exist (Problem 2):** tell the user to create the app in App
  Store Connect (and note `ad_hoc` works regardless); **do not** call
  `POST /v1/apps`.

Documented seams are left for two future opt-ins: a Trapeze/hand-coded project
rewriter, and an "offer to create the app" flow. Neither is built now.

## Design

### Source of truth (remote-informed, Release-anchored)

- The bundle ID **wired into Apple-side work** (`ensureBundleId`, profile,
  provisioning map, `iosBundleIdOverride`) is always the **Release build ID**.
  This guarantees `ad_hoc` builds and the onboarding test build always work.
- App Store Connect data is **authoritative for truth** (which apps exist) but
  **informational for action** in v1 — it drives warnings and the picker
  contents, not silent file edits.

### New verification step

Add a remote-verification step that runs **after `verifying-key` succeeds**
(ASC token available), **only in `app_store` mode**. It extends the existing
`redirectIfMismatch` seam rather than replacing the local `confirm-app-id`
machinery.

1. Fetch the account's apps from ASC (`GET /v1/apps` → `bundleId` + `name`;
   optionally `GET /v1/bundleIds` for registered-but-no-app identifiers).
2. Resolve the **Release** build bundle ID (reuse `detectIosBundleIds`,
   Release-anchored; exclude debug-only suffix variants).
3. Branch:
   - **Exact match** (Release build ID == an ASC app's bundle ID): print a
     one-line confirmation, e.g.
     `✓ Building "Foo" (com.foo.app) — matches your App Store app.` No prompt.
     Continue. (Also the all-agree case.)
   - **No match, account has apps (Problem 1):** show a picker listing the
     **real App Store apps** (name + bundle ID, marked as existing) plus the
     detected build ID labeled `your project builds this — not found in App
     Store Connect`. The user picks the intended app.
     - If the picked app's bundle ID ≠ the Release build ID: print the precise
       manual fix (update Release `PRODUCT_BUNDLE_IDENTIFIER` and
       `capacitor.config` `appId` to the chosen ID, else TestFlight upload will
       fail), record the intent, and **continue** with the profile created for
       the **actual Release build ID**. (This is the seam for future auto-fix.)
   - **No apps in account, or user keeps a non-existent ID (Problem 2):** warn
     clearly — no ASC app exists for this bundle ID; create it in App Store
     Connect for `app_store` delivery; `ad_hoc` is unaffected. Continue.
4. **Fallback:** any ASC fetch/permission/network failure → silently degrade to
   today's local-only `confirm-app-id` behavior. The remote check never blocks
   onboarding.

### Persistence / resume

Reuse the existing `iosBundleIdOverride` + `iosBundleIdContextAppId` progress
fields (`cli/src/build/onboarding/types.ts`). The wired-in value remains the
Release build ID. If the user's confirmed App Store choice differs from the
build ID, that *intent* is recorded for the warning/seam but does not change the
value used for signing. Resume must not re-prompt when nothing changed.

## Components / boundaries

- **`apple-api.ts`** — add a `listApps(token)` (and optionally
  `listBundleIds(token)`) helper using the existing `ascFetch`. Pure data
  fetch; returns `{ bundleId, name }[]`.
- **`bundle-id-detector.ts`** — extend (or add a sibling) so divergence can be
  computed against a remote app list, Release-anchored, with debug-suffix
  exclusion. Keep the pure/synchronous local detection intact; remote data is
  passed in (no network inside the detector — keeps it unit-testable).
- **`app.tsx` state machine** — add the remote-verification step wired into the
  post-`verifying-key` `redirectIfMismatch` fan-out, `app_store` mode only, with
  the three branches above and graceful fallback.
- **`types.ts`** — extend the `OnboardingStep` union and `STEP_PROGRESS`/
  `getPhaseLabel` for the new step; reuse existing progress fields.

## Error handling

- ASC fetch failure (auth/rate-limit/network) → local-only fallback, no block.
- `ad_hoc` mode → skip the remote check entirely.
- Empty app list → treated as Problem 2 (guide, don't block).
- Never throw out of the verification step in a way that aborts onboarding.

## Testing

- **Unit (pure):** the extended detector — exact match, divergence with apps,
  no apps, debug-suffix exclusion, Release-anchoring, dedup/ordering. Follows
  the existing `cli/test/test-bundle-id-detector.mjs` style.
- **Unit:** `listApps` response parsing (mock `ascFetch`).
- **Branch/decision tests:** the three-way branch + `ad_hoc` skip + fetch-failure
  fallback as a pure decision function (mirrors `decideBuilderCtaSurface` /
  `shouldBlockIncompatibleUpload` in `builder-cta.ts`).
- Wire a `test:` script entry in `cli/package.json` and the aggregate `test`
  chain, matching the existing onboarding test pattern.

## Out of scope (v1)

- Android remote verification (API cannot enumerate apps).
- Editing `pbxproj` / `capacitor.config` (Trapeze or hand-coded) — deferred
  opt-in.
- Creating the App Store Connect app (`POST /v1/apps`) — deferred opt-in.
- `ad_hoc`-mode remote checks.

## Open questions for implementation plan

- Exact placement of the new step relative to `creating-certificate` (before
  cert creation is ideal so a wrong ID is caught earliest).
- Whether to also surface `GET /v1/bundleIds` (registered-but-no-app) in the
  picker, or apps-only for v1 simplicity.
- Telemetry events for the new step (mirror the existing onboarding step
  telemetry).
