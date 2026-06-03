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
the two failure modes **early**, and — when the project would build the wrong
app — **gate** the user until they fix it, without us editing their project
files or creating Apple resources in v1.

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
- **`PRODUCT_BUNDLE_IDENTIFIER` and `capacitor.config.appId` may legitimately
  differ.** `capacitor.config.appId` is the **Capgo lookup key** (channels, OTA)
  and is irrelevant to Apple signing; only the Release `PRODUCT_BUNDLE_IDENTIFIER`
  is signed and must match the App Store app. The codebase already decouples them
  via `iosBundleIdOverride`. → We **never** ask the user to change
  `capacitor.config.appId`; the only thing that must match the chosen App Store
  app is `PRODUCT_BUNDLE_IDENTIFIER` (Release).
- **Onboarding's credential setup can always complete.** Cert + profile creation
  only need the bundle ID *registered as an identifier* (which `ensureBundleId`
  auto-creates); they do **not** need an ASC *app* to exist. The ASC app only
  matters at **TestFlight upload time**, i.e. only for **`app_store` mode**.
  `ad_hoc` (`cli/src/build/onboarding/ui/steps/ios-import.tsx:132` — "Ad-hoc (no
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

## v1 scope decision: detect + guide, never auto-edit

v1 **never edits the user's files or creates Apple resources** — but it does
**gate** on a real bundle-ID divergence:

- **Bundle-ID mismatch (Problem 1):** the user picks the intended App Store app;
  if it differs from the Release build ID we **gate Continue** until the user
  fixes `PRODUCT_BUNDLE_IDENTIFIER` themselves (we re-detect each attempt). We
  **never** edit `pbxproj`, and we **never** touch `capacitor.config.appId`.
- **App does not exist (Problem 2):** warn (with the registered-vs-unregistered
  sub-state) and let the user proceed; **do not** call `POST /v1/apps`.

Documented seams are left for two future opt-ins: a Trapeze/hand-coded
`PRODUCT_BUNDLE_IDENTIFIER` rewriter ("fix it for me"), and an "offer to create
the app" flow. Neither is built now.

## Design

### Source of truth (remote-informed, Release-anchored)

- The bundle ID **wired into Apple-side work** (`ensureBundleId`, profile,
  provisioning map, `iosBundleIdOverride`) is always the **Release build ID**.
  Combined with the divergence gate, the user only proceeds once that build ID
  matches the App Store app they intend to ship to.
- App Store Connect data is **authoritative for truth** (which apps exist) and
  drives the warnings, the picker, and the divergence gate — but in v1 it never
  triggers silent file edits or Apple-resource creation.

### New verification step

Add a remote-verification step that runs **after `verifying-key` succeeds**
(ASC token available), **only in `app_store` mode**. It extends the existing
`redirectIfMismatch` seam rather than replacing the local `confirm-app-id`
machinery.

1. Fetch **both** ASC endpoints **in parallel** (`Promise.all`): `GET /v1/apps`
   (→ `bundleId` + `name`, used for the picker) and `GET /v1/bundleIds` (→
   registered identifier strings, used only as a diagnostic — see the no-match
   branch). On failure, see step 4.
2. Resolve the **Release** build bundle ID (reuse `detectIosBundleIds`,
   Release-anchored; exclude debug-only suffix variants).
3. Branch:
   - **Exact match** (Release build ID == an ASC app's bundle ID): print a
     one-line confirmation, e.g.
     `✓ Building "Foo" (com.foo.app) — matches your App Store app.` No prompt.
     Continue. (Also the all-agree case.)
   - **No match, account has apps (Problem 1):** show a picker listing the
     **real App Store apps** (name + bundle ID, marked as existing) plus a
     "my project is correct as-is / none of these" option. The user picks the
     intended app.
     - If the picked app's bundle ID ≠ the Release build ID → **gate the
       Continue action** (see "Divergence gate" below). We never edit files; the
       user fixes `PRODUCT_BUNDLE_IDENTIFIER` (Release) themselves and the gate
       re-detects on each Continue. `capacitor.config.appId` is left untouched.
     - If the user picks "none of these / my build ID is correct" → fall to
       Problem 2 handling.
   - **No app matches the build ID (Problem 2):** use the `/v1/bundleIds`
     diagnostic to sharpen the warning into one of two sub-states:
     - *Identifier already registered (present in `/v1/bundleIds`) but no app
       record* → "The identifier `com.foo.app` exists in your Apple account but
       has no App Store listing; create the app in App Store Connect for
       `app_store` delivery."
     - *Identifier not registered at all* → "`com.foo.app` is not registered in
       your Apple account — onboarding will create a **brand-new identifier**.
       If that's a typo or the wrong ID, fix it now." (Directly addresses the
       original silent-creation concern.)
     Problem 2 is **not gated** — there is no local file fix (the resolution is
     creating the app, which is deferred); the user may proceed (and create the
     app in App Store Connect themselves or ship ad-hoc). `ad_hoc` is unaffected.
4. **On ASC fetch failure** (auth / rate-limit / network): show a visible
   warning — "Couldn't reach App Store Connect to verify your app; continuing
   without remote verification." — and proceed. The pre-existing local
   `confirm-app-id` logic is unchanged and still runs; there is no special
   degrade path to maintain.

### Divergence gate (Problem 1)

The gate is enforced **on the Continue action** — there is no separate "press R
to retry" (choosing Continue *is* the re-check):

- Each time the user chooses **Continue**, re-run detection **fresh from disk**
  (re-read `pbxproj`/`Info.plist`; do **not** reuse the memoized initial
  detection at `app.tsx:256`). If `PRODUCT_BUNDLE_IDENTIFIER` (Release) now
  matches the chosen App Store app → proceed.
- If it still diverges, **block** and show a warning box with the exact edit:
  "Your project still builds `com.foo.wrong`. Edit `PRODUCT_BUNDLE_IDENTIFIER`
  (Release) to `com.foo.real` in Xcode, then choose Continue again.
  (`capacitor.config.appId` can stay as-is.)"
- **Escalate on repeated unfixed attempts.** Track an attempt counter. Each
  blocked Continue must look *visibly different* from the previous one so the
  user never thinks the CLI is stuck — e.g. shift the box border colour, add an
  `(attempt N)` marker, and surface the concrete detected file path and the
  exact `wrong → right` values. Do **not** reprint the identical warning (that
  reads as "nothing happened").
- The user is never trapped: cancelling/exiting onboarding (the wizard's
  standard exit) is always available. There is **no "continue anyway" override**
  — proceeding past the gate requires the file to actually be fixed.

### Persistence / resume

Reuse the existing `iosBundleIdOverride` + `iosBundleIdContextAppId` progress
fields (`cli/src/build/onboarding/types.ts`). Because the divergence gate only
lets the user past once `PRODUCT_BUNDLE_IDENTIFIER` (Release) matches the chosen
App Store app, the wired-in value is always a build ID the project actually
produces. Resume must not re-prompt when nothing changed.

## Components / boundaries

- **`apple-api.ts`** — add `listApps(token)` (→ `{ bundleId, name }[]`, for the
  picker) and `listBundleIds(token)` (→ registered identifier strings, for the
  diagnostic), both using the existing `ascFetch`. The caller invokes them **in
  parallel** (`Promise.all`). Pure data fetches.
- **`bundle-id-detector.ts`** — extend (or add a sibling) so divergence can be
  computed against a remote app list, Release-anchored, with debug-suffix
  exclusion. Keep the pure/synchronous local detection intact; remote data is
  passed in (no network inside the detector — keeps it unit-testable). Expose a
  fresh-from-disk re-detection path for the gate (no memoization).
- **`app.tsx` state machine** — add the remote-verification step wired into the
  post-`verifying-key` `redirectIfMismatch` fan-out, `app_store` mode only, with
  the branches above. Implements the divergence gate: re-detect fresh from disk
  on each Continue (bypassing the memoized detection at `app.tsx:256`), an
  attempt counter, and an escalating warning box. On ASC fetch failure it warns
  and proceeds.
- **`types.ts`** — extend the `OnboardingStep` union and `STEP_PROGRESS`/
  `getPhaseLabel` for the new step; reuse existing progress fields.

## Analytics (PostHog)

First-class telemetry so the new step shows up on the Builder dashboard (project
`696572`). Use `trackEvent` with `channel: 'bundle'` (matching `builder-cta.ts`),
always including `appId`, `orgId`, and
`tags: { step: 'ios-app-verify', platform: 'ios', mode: 'app_store', ... }`.
**Always set `step`** — the Builder dashboard has a null-`step` gotcha (filtered
via `JSONExtractString`), so an unset `step` drops the event from funnels.

Events:

- **`iOS App Verify Shown`** — step entered (app_store mode). tags: `app_count`,
  `bundle_id_count`.
- **`iOS App Verify Result`** — classification. tags: `result` ∈ {`exact-match`,
  `divergence`, `problem2-identifier-exists`, `problem2-unregistered`,
  `no-apps-in-account`, `fetch-failed`}, `app_count`, `bundle_id_count`.
- **`iOS App Verify Picked`** — user chose an app in the picker. tags:
  `matches_build_id` (bool).
- **`iOS App Verify Gate Blocked`** — a Continue was blocked by the divergence
  gate. tags: `attempt` (N).
- **`iOS App Verify Fixed`** — re-detect passed after the user edited the file.
  tags: `attempts` (total before success).
- **`iOS App Verify Cancelled`** — user exited onboarding from the gate. tags:
  `attempt`.

All events fire best-effort (`void trackEvent(...)`) and must never block or
throw into the wizard.

## Error handling

- ASC fetch failure (auth/rate-limit/network) → visible warning, proceed
  (pre-existing local checks unchanged).
- `ad_hoc` mode → skip the remote check entirely.
- Empty app list → treated as Problem 2 (warn, not gated).
- Problem 1 divergence → gate Continue until the file is fixed (re-detect each
  attempt); exit/cancel always available.
- Never throw out of the verification step in a way that aborts onboarding
  unexpectedly.

## Testing

- **Unit (pure):** the extended detector — exact match, divergence with apps,
  no apps, debug-suffix exclusion, Release-anchoring, dedup/ordering. Follows
  the existing `cli/test/test-bundle-id-detector.mjs` style.
- **Unit:** `listApps` and `listBundleIds` response parsing (mock `ascFetch`),
  including the parallel fetch and the two Problem-2 sub-states (identifier
  registered vs. not registered).
- **Branch/decision tests:** the branch classifier (exact-match / divergence /
  Problem-2 sub-states / no-apps / fetch-failed) + `ad_hoc` skip as a pure
  decision function (mirrors `decideBuilderCtaSurface` /
  `shouldBlockIncompatibleUpload` in `builder-cta.ts`).
- **Gate logic (pure):** given (chosen app bundle ID, freshly-detected Release
  build ID, attempt N) → `{ proceed | block, escalationLevel }`. Covers
  fixed-on-attempt-2 (proceed) and still-broken (block + higher escalation).
- **Analytics:** assert the events above fire with the expected properties
  (incl. a non-null `step`), following `cli/test/test-onboarding-telemetry.mjs`.
- Wire a `test:` script entry in `cli/package.json` and the aggregate `test`
  chain, matching the existing onboarding test pattern.

## Out of scope (v1)

- Android remote verification (API cannot enumerate apps).
- Editing `pbxproj` (Trapeze or hand-coded) — deferred opt-in. `capacitor.config`
  is never touched.
- Creating the App Store Connect app (`POST /v1/apps`) — deferred opt-in.
- `ad_hoc`-mode remote checks.

## Open questions for implementation plan

- Exact placement of the new step relative to `creating-certificate` (before
  cert creation is ideal so a wrong ID is caught earliest).
- The precise Ink rendering of the escalating warning box (border colour ramp,
  attempt marker, file path surfacing) — behaviour is specified above; the
  visual treatment is an implementation detail.
