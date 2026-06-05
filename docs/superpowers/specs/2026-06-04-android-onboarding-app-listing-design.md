# Android Onboarding — App Existence Check via Play Developer Reporting API

**Date:** 2026-06-04
**Status:** Design — pending review
**Scope:** Capgo CLI — `build init` (Android), the **OAuth / "generate" service-account path only**
**Branch:** `wolny/android-onboarding-app-listing` (off `origin/main`)

## Problem

The Android onboarding picks the Play **package name** at `android-package-select` purely from local Gradle (`findAndroidApplicationIds` → `applicationId` literals). Nothing checks that an app with that package actually **exists in the user's Play Console** — so a typo'd/flavored/stale `applicationId` flows through, the SA gets invited/granted for a package Play doesn't have, and the failure only surfaces later (the build/publish or the SA grant) instead of during onboarding. This is the Android analog of the iOS [verify-app] gap (PR #2397).

The iOS feature could only *probe* and never *list* on Android — that was wrong: the **Google Play Developer Reporting API** (`playdeveloperreporting.googleapis.com`) has `apps:search`, which **does** enumerate the apps the caller can see. (The Play *Developer* API / `androidpublisher` that `supply` uses has no list — that's the source of the long-standing "no list-apps" belief.)

## Goal

On the OAuth path, after Google sign-in, list the user's real Play apps and reconcile them against the Gradle `applicationId`(s):
- **Gradle id matches a real Play app → don't pose the question** (auto-confirm the package, like iOS exact-match).
- **Gradle id matches no Play app → inform the user**, iOS-style, and surface the real apps so they can pick the right one.

…without ever enabling the Reporting API on the user's *service account* — the listing happens **only via the user's OAuth token**. The import (custom-SA) path has no OAuth, so it keeps today's Gradle-only flow with a warning that verification was skipped.

## Key constraints (discovered / load-bearing)

- **`apps:search` is real and official.** `GET https://playdeveloperreporting.googleapis.com/v1beta1/apps:search` → `{ apps: [{ name: "apps/<pkg>", packageName, displayName }], nextPageToken }`. "Searches for Apps accessible by the user." Paginated (`pageSize` ≤ 1000, `pageToken`). It is a **separate API** from `androidpublisher` — different host, must be enabled in the Cloud project (done), single scope `https://www.googleapis.com/auth/playdeveloperreporting`.
- **The scope is NON-sensitive.** Confirmed in this project's Cloud Console Data Access page: `playdeveloperreporting` and `androidpublisher` are listed under **non-sensitive scopes** (only `cloud-platform` is sensitive, already verified). So adding it needs **no Trust & Safety review / demo video** — just include it in the consent screen (done) and the requested scopes.
- **OAuth-only, by design.** We use the **user's** OAuth access token (apps "accessible by the user" → the signed-in developer sees their whole account, sidestepping the SA account-level-vs-app-level grant ambiguity). We deliberately do **not** enable the Reporting API on, or grant the reporting scope to, the user's service account. → Verification runs **only on the `serviceAccountMethod === 'generate'` (Google sign-in) path.**
- **Backend scope dependency.** OAuth client config comes from the backend (`/private/config/builder` → `scopes[]`, default `androidpublisher`). To get `playdeveloperreporting` granted, the backend must add it to `scopes[]`. The CLI also lists scopes in `OAUTH_SCOPES_FOR_ONBOARDING` (`app.tsx:179`). **The reporting scope must be OPTIONAL** — `findMissingScopes`/`MissingScopesError` must NOT fail sign-in if it wasn't granted (old backend, user on a Workspace that restricts it, etc.); instead degrade to warn-and-skip.
- **Play can't create apps via API either.** Like iOS (`POST /v1/apps` forbidden), an Android app record requires the **first build uploaded / app created in Play Console (web)**. So the "no app" branch can only **open Play Console + inform** — never auto-create. See [[google-play-console-api-gaps]].
- **Authoritative id = the Gradle `applicationId`** (what the build produces & publishes), exactly as the Release `PRODUCT_BUNDLE_IDENTIFIER` is on iOS. `apps:search` tells us whether a real Play app exists for it. There may be **multiple** `applicationId`s (flavors) — `findAndroidApplicationIds` already returns a list.

## Design

### New API helper

`cli/src/build/onboarding/android/reporting-api.ts` (or extend `play-api.ts`):
- `parseAppsSearchResponse(json): { packageName: string, displayName: string }[]` — pure, tolerant (mirrors iOS `parseAppsResponse`).
- `listPlayApps(accessToken): Promise<{ packageName, displayName }[]>` — `GET …/v1beta1/apps:search?pageSize=1000`, follow `nextPageToken` up to a sane cap, `Authorization: Bearer <user OAuth token>`. Pure parser is unit-tested; the fetch is thin.

### Reuse the iOS pure classifier

The iOS `app-verification.ts` (`classifyAppVerification`, `evaluateGate`) is already on `main`. Reuse `classifyAppVerification({ releaseBundleId: gradleId, apps, registeredBundleIds: [] })` → `exact-match | wrong-build-id | no-app-*`. Android has no "registered identifier" concept, so pass `[]` (collapses no-app-* into the unregistered branch). Keep the decision logic shared; Android just feeds Gradle ids instead of a Release bundle id.

### Verification layer on `android-package-select` (generate path only)

When entering `android-package-select` AND `serviceAccountMethod === 'generate'`:
1. Detect Gradle ids (`findAndroidApplicationIds`, already done) **and** fetch `listPlayApps(await ensureAccessToken())` in the existing effect.
2. Reconcile ("expand the Gradle list") and route to a resolution path:
   - **Exactly one Gradle id and it's in `apps` → auto-select it and skip the picker** (don't pose the question). `addLog('✓ Building "<name>" (<pkg>) — matches your Play Store app.')` and continue to `gcp-setup-running`.
   - **Account has apps but the build's id matches none → Path A picker.** Render the picker enriched with the real Play apps (annotated `✓ in Play Console` + `displayName`), the Gradle ids, "type a different package name", and a **"Create a new app in Play Console" → Path B** entry. Picking a real Play app whose `packageName` ≠ the build's Gradle id offers the **Trapeze auto-rename** (Path A below).
   - **No apps in the account at all → Path B (create app).**
3. The chosen/renamed package still flows into `androidPackageChosen` / SA grant exactly as today.

### Path A — auto-rename the Android project (Trapeze)

Hand-editing an Android `applicationId` to match a Play app is genuinely hard — it spans `build.gradle` (`applicationId`), the `namespace`, the manifest/package + source dirs, then needs `cap sync`. "Retype it yourself" is a non-starter. So when the user picks a real Play app whose `packageName` differs from the build's Gradle id, offer **"Rename my Android project to `<pkg>` for me"**, powered by **Trapeze** (`@trapezedev/project`):

```ts
const project = new MobileProject('.', { android: { path: 'android' } })
await project.load()
await project.android?.setPackageName(appId)
const gradle = await project.android?.getGradleFile('app/build.gradle')
await gradle?.setApplicationId(appId)
await gradle?.setNamespace(appId)
await project.commit()
```

**Trapeze is NOT bundled** (the CLI stays lean — same reasoning as the iOS pbxproj rewriter being hand-coded; Trapeze is a heavy dep). It's installed **on demand** into a temp dir only when the user opts in. Orchestrated sequence:

1. **Prepare** — `mkdtemp`; write a tiny `package.json` (`type: module`) + `rename.mjs` (the script above, reading `<appId>` from `argv`); `npm install @trapezedev/project@<pinned>` in the temp dir (spinner: "Preparing the project renamer…"). Node resolves the import from `<tmp>/node_modules`; run the script with **cwd = the user's project** so `MobileProject('.')` targets it.
2. **Close Android Studio (gate).** Editing the Gradle/native files while Android Studio holds them open risks a half-written project / Studio clobbering the change on its next sync. So detect it and **block until closed**:
   - **macOS:** `pgrep -f "Android Studio"` (best-effort). If running → "Please quit Android Studio — this continues automatically once it's closed" and re-check ~every 1s until gone.
   - **Other OSes:** can't reliably detect → one-time "Close Android Studio if it's open" confirm, then proceed.
3. **Run** the rename (`node <tmp>/rename.mjs <pkg>`, cwd = project); capture stdout/stderr.
4. **Verify** it took — re-read `findAndroidApplicationIds(androidDir)` and confirm it now contains `<pkg>`. If not, surface the script output and fall back to manual instructions (never claim success).
5. **`npx cap sync`** (cwd = project; spinner) to keep Capacitor's native/config state consistent after the package change. Non-zero exit is surfaced but non-fatal (the rename is the load-bearing part).
6. **Re-reconcile** → the Gradle id now matches the Play app → proceed (mirrors iOS Path A's re-check passing).

Loader + attempt feedback mirror iOS — each step shows a spinner; failures warn rather than silently no-op; cancel/back always available.

> ⚠ `setNamespace(appId)` aligns the namespace with the applicationId. For a standard Capacitor app these already match; for a project that *intentionally* keeps `namespace ≠ applicationId`, this is more aggressive than strictly necessary (only `setApplicationId` is required for the Play-app match). See Open questions.

### Path B — create the app in Play Console

Offer **"Open Play Console to create this app"** → opens `https://play.google.com/console`; the user creates the app there. Then re-poll `apps:search` (loader + attempt counting + ask-before-reopen, same mechanics as iOS) to detect it.

**Android-specific caveat:** two separate facts here, with different confidence —

- **Documented (`androidpublisher`):** a never-published package returns `404 "Package not found"` from `edits.insert`, and the *first* AAB upload for a new package must be done via the web/Play Console (the publishing API can't bootstrap a brand-new package). Evidence: gradle-play-publisher #75 ("the first upload of an APK needs to be done through the web interface") and #836/#979 (raw 404 logs); Codemagic's troubleshooting docs. This is about the **publishing** API, not `apps:search`.
- **UNVERIFIED (`apps:search`):** whether the Reporting API lists a *Draft* app (created in Play Console, zero releases). We have **no evidence** either way — a Draft might well appear, since `apps:search` returns "apps accessible by the user" and listing ≠ publishing. Do **not** treat "apps:search won't show it until first upload" as fact; it's an open empirical question (create a Draft app → call `apps:search` → observe). See Open questions.

**No automation bypass exists (confirmed 2025–2026).** Nothing creates a *public* Play app or performs/fakes the first upload programmatically: fastlane `supply` (docs: *"you need to have successfully uploaded an APK… at least once"*), gradle-play-publisher (README: *"The first APK or App Bundle needs to be uploaded via the Google Play Console because registering the app with the Play Store cannot be done using the Play Developer API"*), `produce` (iOS-only), Terraform (`hashicorp/google` has no Play resource; the community `googleplay` provider only does users/IAM), and Internal App Sharing (package must already exist) all confirm it. The *only* programmatic create+first-upload is Google's **Custom App Publishing API** (`customApps.create`) — but that produces a **permanently-private managed Google Play** app (enterprise/EMM), never public, so it's not a bypass for normal apps.

Therefore Path B is **inform-only by necessity** (not a soft preference): open Play Console, instruct the user to create the app + upload the first build manually, then proceed/re-check. There is no auto-fix to offer here — unlike Path A (Trapeze rename to an existing, already-uploaded app), which stays fully automatable.

### Import (custom-SA) path — keep Gradle-only, warn

When `serviceAccountMethod === 'existing'`, `android-package-select` keeps **today's Gradle-only picker** unchanged, but shows a one-line warning banner: *"App existence isn't verified on the imported-service-account path (that needs Google sign-in). Proceeding with the package from build.gradle — make sure it exists in Play Console."* No `apps:search` call, no OAuth.

### Graceful degradation (never block onboarding)

If, on the generate path, the reporting scope wasn't granted, the Reporting API is disabled (403), the token can't be refreshed, or the call errors/times out → **warn and fall back to the plain Gradle picker** (same UX as the import path's banner, different reason). A verification failure must never block onboarding. The reporting scope being optional (above) is what makes this safe.

## Scope / config changes

- Add `https://www.googleapis.com/auth/playdeveloperreporting` to `OAUTH_SCOPES_FOR_ONBOARDING` (`app.tsx:179`) **as optional** — exclude it from the required-scope check so its absence degrades gracefully.
- Backend `/private/config/builder` must include it in `scopes[]` for it to actually be requested (coordinate; the CLI tolerates its absence).
- Consent screen already lists it (non-sensitive) — no verification submission needed.

## Telemetry

Mirror iOS, `channel: 'bundle'`, `tags.step: 'android-app-verify'` always set:
- `Android App Verify Shown` — generate path, step entered. tags: `app_count`, `gradle_id_count`.
- `Android App Verify Result` — `result` ∈ `exact-match` / `wrong-build-id` / `no-app` / `multi-gradle` / `scope-missing` / `fetch-failed` / `skipped-import`.
- `Android App Verify Picked` — user chose a package. tags: `matches_play_app` (bool), `source` (gradle | play-app | manual).
- `Android App Verify Auto Fixed` — Trapeze rename completed + verified. tags: `from`, `to`, `cap_sync_ok` (bool), `studio_wait_ms`.
- `Android App Verify Create App Opened` — opened Play Console (Path B). tags: `attempt`.

## Error handling

- Reporting scope missing / 403 / network → warn + Gradle-only fallback (degraded, not blocked).
- `ad_hoc`-equivalent N/A (Android has no ad_hoc); the only fork is generate vs import.
- Never throw out of the verification path into the wizard.

## Testing

- **Unit (pure):** `parseAppsSearchResponse` (well-formed, empty, missing fields, pagination shape).
- **Decision (pure):** reuse/extend `app-verification` tests for the Android inputs — single-match-skip, no-match, multi-Gradle (no auto-skip), empty Play list.
- **Branch:** generate-vs-import gating, and the scope-missing/fetch-failed → fallback path, as a pure decision function.
- **Trapeze rename (pure-testable parts):** the temp-script/`package.json` generation and the post-run **verification** (re-read Gradle ids → contains `<pkg>`), plus the Android-Studio-detection predicate (mock `pgrep` output → running/closed). The actual `npm install` + `node` + `cap sync` spawns are integration-only (mock the spawner in unit tests).
- Wire a `test:` script + aggregate entry, matching the onboarding test pattern.

## Out of scope (v1)

- **Bundling Trapeze in the CLI** — it's installed **on demand** into a temp dir only when the user opts into Path A's auto-rename (keeps the dist lean). The auto-rename itself is **in scope** (see Path A).
- **Enabling the Reporting API on, or granting the reporting scope to, the user's service account** — explicitly excluded; OAuth-token only.
- **Verification on the import (custom-SA) path** — warn + skip.
- **Auto-creating the Play app** — impossible via API (web + first-upload only); Path B opens Play Console and informs.
- **Hard-gating Path B** — Android can't pre-verify a never-uploaded package (first upload bootstraps it), so Path B **informs + allows proceed** rather than blocking. (Open question.)

## Open questions

- **`setNamespace` aggressiveness.** Path A's script sets `applicationId` **and** `namespace` (+ `setPackageName`). Only `applicationId` is strictly required to match the Play app. Setting `namespace`/package is a fuller rename (matches the user-provided working script, fine for standard Capacitor apps) but is more invasive for projects that intentionally keep them different. Confirm we always do the full rename, or make namespace/package opt-in.
- **Is `npx cap sync` needed after the rename?** Trapeze edits the native project directly; `applicationId` doesn't require a sync. It's included to keep Capacitor consistent after a package/namespace change. Confirm keep vs. drop (it's a slow, network-touching step).
- **On-demand Trapeze install fragility.** Path A `npm install @trapezedev/project` mid-onboarding needs npm + network + time. Pin a version; show a spinner; on install failure fall back to manual instructions. Acceptable, or pre-resolve another way (e.g. `npx --package @trapezedev/project`)?
- **Android Studio detection off macOS.** Only macOS gets the `pgrep` auto-detect + poll-until-closed. Linux/Windows get a one-time "close it" confirm. Acceptable for v1?
- **Does `apps:search` list Draft apps? (UNVERIFIED — must test.)** I do not actually know whether a Play app created in the Console with zero releases appears in `apps:search`. The `androidpublisher` first-upload requirement is documented, but that's a different API and I wrongly extrapolated it. Test: create a Draft app → call `apps:search` → observe. The result decides whether Path B can ever gate, or must always inform-and-proceed.
- **Multiple Gradle flavors.** When several `applicationId`s exist and >1 matches a Play app, show the enriched picker (no auto-skip). Confirm vs. picking the shortest/main like iOS.
- **Backend coordination.** The reporting scope must be added to `/private/config/builder`'s `scopes[]` (optional) for this to activate in production; until then the CLI silently degrades. Track as a dependency.
