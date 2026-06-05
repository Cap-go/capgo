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
2. Reconcile ("expand the Gradle list"):
   - **Exactly one Gradle id and it's in `apps` → auto-select it and skip the picker** (don't pose the question). `addLog('✓ Building "<name>" (<pkg>) — matches your Play Store app.')` and continue to `gcp-setup-running`.
   - **Otherwise → render the picker enriched with the real Play apps**: union of Play apps (annotated `✓ in Play Console`, with `displayName`), the Gradle ids, and "type a different package name". If the build's Gradle id matches **no** Play app, show an iOS-style warning box: *"No Play Console app exists for `com.foo.app` — an app_store publish needs one. Create it in Play Console (or upload the first build there); the API can't create it for you."* with an "Open Play Console" action.
3. The chosen package still flows into `androidPackageChosen` / SA grant exactly as today.

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

## Error handling

- Reporting scope missing / 403 / network → warn + Gradle-only fallback (degraded, not blocked).
- `ad_hoc`-equivalent N/A (Android has no ad_hoc); the only fork is generate vs import.
- Never throw out of the verification path into the wizard.

## Testing

- **Unit (pure):** `parseAppsSearchResponse` (well-formed, empty, missing fields, pagination shape).
- **Decision (pure):** reuse/extend `app-verification` tests for the Android inputs — single-match-skip, no-match, multi-Gradle (no auto-skip), empty Play list.
- **Branch:** generate-vs-import gating, and the scope-missing/fetch-failed → fallback path, as a pure decision function.
- Wire a `test:` script + aggregate entry, matching the onboarding test pattern.

## Out of scope (v1)

- **Auto-editing `build.gradle`** (no Android analog of the iOS pbxproj rewriter yet) — the no-match path informs + lets the user pick/retype, but doesn't rewrite `applicationId`. Candidate follow-up.
- **Enabling the Reporting API on, or granting the reporting scope to, the user's service account** — explicitly excluded; OAuth-token only.
- **Verification on the import (custom-SA) path** — warn + skip.
- **Auto-creating the Play app** — impossible via API (web/first-upload only).
- Hard-gating: v1 **informs** (iOS-style warning + enriched picker) rather than hard-blocking, per the request. (Open question below.)

## Open questions

- **Inform vs gate.** iOS hard-gates the no-app case (can't proceed until the invariant holds). The request says "inform" — so v1 informs and lets the user proceed/pick. Confirm whether Android should also hard-gate or stay informational.
- **Multiple Gradle flavors.** When several `applicationId`s exist and more than one matches a Play app, we show the enriched picker (no auto-skip). Confirm that's the desired behavior vs. picking the shortest/main like iOS.
- **Backend coordination.** The reporting scope must be added to `/private/config/builder`'s `scopes[]` for this to activate in production; until then the CLI silently degrades. Track that as a dependency.
