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
API key (`.p8`), use App Store Connect to verify the app identity and **never let
onboarding pass the step in a state that will fail the `app_store` build later**.
When the project would build the wrong app (or no app exists yet), **gate** the
user and **verify the fix via the API** before continuing — without us editing
their project files or auto-creating Apple resources (the ASC API cannot create
apps anyway; see below).

## Key constraints (discovered, load-bearing)

- **Apple vs Google asymmetry.** ASC API can enumerate the account
  (`GET /v1/apps`, `GET /v1/bundleIds`). The Google Play Developer API has **no
  list-all-apps endpoint** (per-package model). → **This feature is iOS only.**
  Android onboarding is unchanged.
- **The ASC API cannot create an app record.** `POST /v1/apps` returns
  `403 FORBIDDEN_ERROR`: *"The resource 'apps' does not allow 'CREATE'. Allowed
  operations are: GET_COLLECTION, GET_INSTANCE, UPDATE."* App creation is
  **web-only** (appstoreconnect.com). The API *can* create **bundle IDs**
  (`ensureBundleId` already does) and *read* apps — so our only lever for the
  "no app" case is: send the user to the web page and **verify via the API** that
  the app now exists.
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
- **Distribution mode.** This whole step runs **only in `app_store` mode** (the
  create-new default and import-app_store). `ad_hoc`
  (`cli/src/build/onboarding/ui/steps/ios-import.tsx:132` — "Ad-hoc (no
  TestFlight upload)") **skips the step entirely** — so no branch below mentions
  ad-hoc; by the time we are here, the build is app_store and the app must exist.
- **Debug vs Release.** The Release-config bundle ID is the **authoritative**
  build ID used for the comparison, the gate, and all Apple-side work — pbxproj
  parsing must always resolve Release (never silently substitute a Debug value
  when a Release config exists). It already prefers Release — see
  `test-bundle-id-detector.mjs:35` — but tighten the guarantee and extend the
  tests (e.g. a Debug ID that diverges from Release by more than a `.debug`
  suffix). **"Harden to Release" means Release is authoritative, not that Debug
  is discarded:** the parser already collects every `{config, value}` pair
  internally, so we still **expose the Debug value** (or a `debugReleaseDiffer`
  flag) — used *only* to print the Debug ≠ Release awareness note, never to gate.
  When no Release config can be resolved, the step warns and skips gating rather
  than gating on a Debug fallback. No `.debug`/suffix heuristics.
- **Lean dependencies.** The CLI deliberately hand-parses native files with
  small regexes (`pbxproj-parser.ts`, `bundle-id-detector.ts`) — no plist
  library, no Trapeze. v1 adds **no** native-file-editing dependency.

## v1 scope decision: detect + verify-by-API gate, never auto-edit/auto-create

v1 **never edits the user's files and never auto-creates Apple resources** — but
it **gates and verifies via the API** so onboarding can't pass into a state that
fails the build:

- **Wrong build ID (Problem 1):** the user picks the intended App Store app; if
  it differs from the Release build ID we **gate** until the user fixes
  `PRODUCT_BUNDLE_IDENTIFIER` and the API confirms it. The gate offers an
  **"Update PRODUCT_BUNDLE_IDENTIFIER for me"** action that rewrites the Release
  build id in `pbxproj` to the chosen app and re-checks; the user may also edit it
  by hand. We **never** touch `capacitor.config.appId`, and only
  `PRODUCT_BUNDLE_IDENTIFIER` assignments equal to the current build id change.
- **App does not exist (Problem 2):** we **offer to open** the App Store Connect
  create-app page and **gate** until the API confirms an app exists for the build
  ID. We do **not** call `POST /v1/apps` (the API forbids it).

The Path A "fix it for me" rewriter is now implemented (hand-coded, no Trapeze
dependency): `replaceBundleIdInPbxproj` (pure) + `writeReleaseBundleId` in
`pbxproj-parser.ts`, wired into the gate. It edits only `pbxproj`
`PRODUCT_BUNDLE_IDENTIFIER` assignments matching the current build id.

## Design

### The single invariant

To pass this step (always `app_store` mode), one thing must be true:

> **An App Store Connect app exists whose `bundleId` == the Release build ID.**

Everything below is just *why* the invariant is unmet and *which* action resolves
it. The gate re-checks the invariant **via the API** on every Continue.

### Source of truth (remote-verified, Release-anchored)

- The bundle ID **wired into Apple-side work** (`ensureBundleId`, profile,
  provisioning map, `iosBundleIdOverride`) is always the **Release build ID**.
  The gate guarantees the user only proceeds once an ASC app exists for it.
- App Store Connect data is **authoritative** (what exists) and is what we
  re-poll to confirm the user actually did the required action. In v1 we never
  silently edit files or auto-create resources.

### New verification step

Runs **after `verifying-key` succeeds** (ASC token available), **only in
`app_store` mode**. Extends the existing `redirectIfMismatch` seam rather than
replacing the local `confirm-app-id` machinery.

1. Fetch **both** ASC endpoints **in parallel** (`Promise.all`): `GET /v1/apps`
   (→ `bundleId` + `name`, for the picker + invariant check) and
   `GET /v1/bundleIds` (→ registered identifiers, diagnostic only). On failure,
   see step 5.
2. Resolve the **Release** build bundle ID via the hardened `parsePbxprojBundleId`
   (always Release; no debug/suffix heuristics). If no Release config can be
   resolved, skip gating and warn (step 5). **If the Debug-config bundle ID
   differs from Release, print a one-line informational note** (e.g. "Note:
   Debug builds `com.foo.app.debug`, Release builds `com.foo.app` — Capgo Builder
   uses the Release ID `com.foo.app`."). Awareness only — never gates.
3. Evaluate the invariant:
   - **Satisfied** (an ASC app's bundle ID == the Release build ID): print
     `✓ Building "Foo" (com.foo.app) — matches your App Store app.` No prompt.
     Continue.
   - **Not satisfied** → enter the **verification gate** (step 4).
4. **Verification gate.** Show the situation and the resolution path, then block
   Continue until the invariant holds (re-checked via the API on each Continue —
   see "Verification gate" below). Two resolution paths, chosen by sub-case:
   - **Account has apps, none match the build ID** → likely a wrong build ID.
     Show a picker of the **real App Store apps** (name + bundle ID) plus a
     "None of these — my build ID is correct, create a new app" option.
     - User picks an existing app whose bundle ID ≠ the build ID → **Path A (fix
       the build ID):** instruct "Edit `PRODUCT_BUNDLE_IDENTIFIER` (Release) to
       `com.foo.real` in Xcode." On Continue, re-detect from disk; pass when the
       build ID matches that app.
     - User picks "create a new app for my build ID" → **Path B (create the app)**.
   - **No apps in account, or the user chose Path B** → **Path B (create the
     app):** "No App Store app exists for `com.foo.app`."
     - First, **register the identifier** (idempotent `ensureBundleId` for the
       Release build ID) so it is selectable in the ASC new-app form. The
       `/v1/bundleIds` diagnostic just tells us whether this registration already
       happened (sharpens the wording: "identifier already exists" vs. "will be
       registered").
     - Offer **[Open App Store Connect to create the app]** — opens the new-app
       page via `open` **once, when the user explicitly chooses it** (the API
       can't create the app, so this is manual).
     - On Continue, **re-poll `GET /v1/apps`**; pass once an app with
       `bundleId == com.foo.app` exists. **Never auto-re-open the browser** — if
       the app still isn't found, *ask* before re-opening (see the gate).
5. **On ASC fetch failure** (auth / rate-limit / network): show a visible warning
   — "Couldn't reach App Store Connect to verify your app; continuing without
   remote verification." — and proceed. We can't verify the invariant on a
   transient failure, and blocking on it would trap the user; the pre-existing
   local `confirm-app-id` logic still runs. (The gate only blocks on a *known*
   unmet invariant, never on an unknown one.)

### Verification gate

The gate is enforced **on the Continue action** — there is no separate "press R
to retry" (choosing Continue *is* the re-check). The same mechanics apply to both
resolution paths:

- Each **Continue** re-evaluates the invariant **live**:
  - Path A re-reads `pbxproj`/`Info.plist` **fresh from disk** (do **not** reuse
    the memoized initial detection at `app.tsx:256`) and re-checks the build ID
    against the chosen app.
  - Path B re-fetches `GET /v1/apps` and checks for an app matching the build ID.
  - If satisfied → proceed.
- If still unmet, **block** and show a warning box naming the exact next action:
  - **Path A:** the precise `wrong → right` `PRODUCT_BUNDLE_IDENTIFIER` edit
    (noting `capacitor.config.appId` can stay as-is).
  - **Path B:** **do not re-open the browser automatically.** Ask instead — e.g.
    "Still no App Store app for `com.foo.app`. Re-open the create-app page?" —
    with choices like **Re-open page** / **I've created it — re-check** /
    **Cancel**. The browser opens only if the user picks "Re-open page";
    "re-check" just re-polls; everything else stays on the gate.
- **Escalate on repeated unmet attempts.** Track an attempt counter; each blocked
  Continue must look *visibly different* from the previous one (shift the box
  border colour, add an `(attempt N)` marker, surface the concrete file path /
  the bundle ID being polled) so the user never thinks the CLI is stuck. Do
  **not** reprint the identical warning.
- The user is never trapped: cancelling/exiting onboarding (the wizard's standard
  exit) is always available. There is **no "continue anyway" override** —
  proceeding requires the invariant to actually hold.

### Persistence / resume

Reuse the existing `iosBundleIdOverride` + `iosBundleIdContextAppId` progress
fields (`cli/src/build/onboarding/types.ts`). Because the gate only lets the user
past once an ASC app exists for the Release build ID, the wired-in value is always
a build ID that both the project produces and the App Store has. Resume must not
re-prompt when nothing changed (re-run the invariant check on resume; if it now
holds, don't gate).

## Components / boundaries

- **`apple-api.ts`** — add `listApps(token)` (→ `{ bundleId, name }[]`, for the
  picker + invariant + Path B re-poll) and `listBundleIds(token)` (→ registered
  identifier strings, diagnostic), both using the existing `ascFetch`. The caller
  invokes them **in parallel** (`Promise.all`). Pure data fetches. (`ensureBundleId`
  already exists and is reused for Path B registration.)
- **`bundle-id-detector.ts`** — keep/extend the low-level parse that returns the
  bundle ID for **each** build config (Release **and** Debug). A resolver returns
  the **Release** value as the authoritative build ID (never a Debug value when
  Release is present; deterministic main-target pick); the Debug value (or a
  `debugReleaseDiffer` flag) is returned **alongside** and used only for the
  awareness note. Expose a fresh-from-disk re-detection path for Path A of the
  gate (no memoization). Keep the pure/synchronous local detection intact; remote
  data is passed in (no network inside the detector — keeps it unit-testable).
- **`app.tsx` state machine** — add the verification step wired into the
  post-`verifying-key` `redirectIfMismatch` fan-out, `app_store` mode only.
  Implements the invariant check and the gate: Path A re-detects fresh from disk
  on each Continue (bypassing the memoized detection at `app.tsx:256`); Path B
  re-polls `GET /v1/apps` on each Continue and offers to open the create-app
  page; both share the attempt counter + escalating warning box. On ASC fetch
  failure it warns and proceeds.
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

- **`iOS App Verify Shown`** — step entered. tags: `app_count`, `bundle_id_count`,
  `debug_release_differ` (bool).
- **`iOS App Verify Result`** — invariant classification. tags: `result` ∈
  {`exact-match`, `wrong-build-id`, `no-app-identifier-exists`,
  `no-app-unregistered`, `no-apps-in-account`, `fetch-failed`}, `app_count`,
  `bundle_id_count`.
- **`iOS App Verify Picked`** — user chose an app in the picker. tags:
  `matches_build_id` (bool), `chose_create_new` (bool).
- **`iOS App Verify Create App Opened`** — user opened the ASC create-app page
  (Path B). tags: `attempt`.
- **`iOS App Verify Gate Blocked`** — a Continue was blocked. tags: `attempt`,
  `path` (`fix-build-id` | `create-app`).
- **`iOS App Verify Passed`** — invariant satisfied after the gate. tags:
  `attempts` (total), `path`.
- **`iOS App Verify Cancelled`** — user exited onboarding from the gate. tags:
  `attempt`, `path`.

All events fire best-effort (`void trackEvent(...)`) and must never block or
throw into the wizard.

## Error handling

- ASC fetch failure (auth/rate-limit/network) → visible warning, proceed (we
  can't verify a transient failure; pre-existing local checks still run).
- `ad_hoc` mode → step is skipped entirely (never reached).
- No Release config resolvable → warn, skip gating (don't gate on a Debug value).
- Unmet invariant → gate Continue (Path A or B); re-verify via API each attempt;
  exit/cancel always available.
- `open` (create-app page) failure → print the URL so the user can open it
  manually; keep gating.
- Never throw out of the verification step in a way that aborts onboarding
  unexpectedly.

## Testing

- **Unit (pure):** the hardened `parsePbxprojBundleId` — always picks Release
  over Debug (incl. a Debug ID that diverges by more than a `.debug` suffix) and
  the no-Release-config case — plus the extended detector (exact match, wrong
  build ID, dedup/ordering, Debug value exposed). Extends the existing
  `cli/test/test-bundle-id-detector.mjs`, which already covers Release-over-Debug
  at line 35.
- **Unit:** `listApps` and `listBundleIds` response parsing (mock `ascFetch`),
  including the parallel fetch.
- **Invariant/decision tests (pure):** classify (exact-match / wrong-build-id /
  no-app-identifier-exists / no-app-unregistered / no-apps-in-account /
  fetch-failed), mirroring `decideBuilderCtaSurface` / `shouldBlockIncompatibleUpload`
  in `builder-cta.ts`.
- **Gate logic (pure):** given (invariant inputs, path, attempt N) →
  `{ proceed | block, escalationLevel }`. Path A: fixed-on-attempt-2 proceeds,
  still-wrong blocks with higher escalation. Path B: app-appears-on-re-poll
  proceeds, still-absent blocks.
- **Analytics:** assert the events above fire with the expected properties (incl.
  a non-null `step`), following `cli/test/test-onboarding-telemetry.mjs`.
- Wire a `test:` script entry in `cli/package.json` and the aggregate `test`
  chain, matching the existing onboarding test pattern.

## Out of scope (v1)

- Android remote verification (API cannot enumerate apps).
- Trapeze (or any native-config dependency) — the `pbxproj` auto-fix is
  hand-coded; `capacitor.config` is never touched.
- Auto-creating the App Store Connect app — **impossible** via the API
  (`apps` is GET/UPDATE only); we open the web page and verify by re-polling.
- `ad_hoc`-mode remote checks.

## Open questions for implementation plan

- Exact placement of the new step relative to `creating-certificate` (before cert
  creation is ideal so a wrong/missing app is caught earliest; note Path B calls
  `ensureBundleId` here, which the create-new path also calls later — idempotent).
- The precise Ink rendering of the escalating warning box (border colour ramp,
  attempt marker, file path / polled bundle ID surfacing) — behaviour is
  specified above; the visual treatment is an implementation detail.
- Re-poll cadence / debounce for Path B (it re-polls only on Continue, so this is
  user-driven — confirm no background polling is wanted).
