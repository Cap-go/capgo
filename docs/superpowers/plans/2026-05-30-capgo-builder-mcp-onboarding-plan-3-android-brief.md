# Capgo Builder MCP Onboarding — Plan 3 brief: Android credentials

> **Status: DESIGN BRIEF, not yet a full TDD plan.** Before executing, run `superpowers:writing-plans` to expand this into bite-sized TDD tasks (like Plans 1 & 2). This brief front-loads the survey + design decisions so that expansion is fast and the executor has zero ambiguity. **Recommended: do this in a fresh session** — Plan 3 is multi-module and benefits from clean context.

## Progress (2026-05-30)

- ✅ **Keystore step** — `decideAndroid` + `android-keystore` `auto` step; wiring reuses `generateKeystore` + `generateRandomPassword`. Committed.
- ✅ **Provisioning (existing service account — NO OAuth)** — per the scope decision to drop OAuth, the Android flow is: keystore → **provide service-account JSON** (`human_gate`, by **file path** — never pasted) → **validate** (`validateServiceAccountJson`) + **save** (`updateSavedCredentials` with keystore base64 + `PLAY_CONFIG_JSON`) → `done`. Invalid JSON re-prompts via `android-service-account-invalid`. Verified: build (`tsc`) + 33 unit tests + MCP smoke green. **Android credentials now reach a buildable state.**
- ❌ **OAuth / GCP-generate / Play-invite-via-API — dropped for v1** (explicit decision: no OAuth). The "generate a service account via Google sign-in" path can be added later; `oauth-google`/`gcp-api`/`play-api` remain available and headless.
- ➡️ **Next:** Plan 4 (iOS credentials) and Plan 5 (build → first build). With Android creds saved, `capgo_request_build` can produce a real Android build.

**Goal:** Drive the **Android** credential flow through the onboarding engine — keystore → Google sign-in → GCP service account → Play invite → validate → save — reaching saved Android build credentials, reusing the existing `cli/src/build/onboarding/android/*` modules.

**Key finding from the survey:** the Android core logic is **already headless** — nothing in `android/*.ts` (outside `android/ui/`) imports `ink`/`react`/`@clack`. So Plan 3 *reuses* these modules directly; no extraction/refactor needed.

---

## Reuse map (verified signatures)

| Engine step | Reuse | Signature (verified) | Kind |
|-------------|-------|----------------------|------|
| `keystore-generating` | `generateKeystore`, `generateRandomPassword` (`android/keystore.ts`) | `generateKeystore(opts: { alias, storePassword, keyPassword, dname: { commonName, organizationName?, countryCode? }, validityYears?, keySize? }): { p12Base64, p12Bytes, alias, notAfter }` — **pure, sync** | `auto` |
| `google-sign-in` | `runOAuthFlow` (`android/oauth-google.ts:504`) | starts a `127.0.0.1` loopback server, `open(authUrl)`s the browser, resolves with tokens (`GoogleOAuthTokens`). **Blocking + opens browser.** | `auto` (browser-driven) |
| `gcp-provisioning` | `generateProjectId(appId)`, `createProject`, `enableService`, `ensureServiceAccount`, `createServiceAccountKey`, `pollOperation` (`android/gcp-api.ts`) | all take `accessToken`; pure async API | `auto` |
| `play-developer-id` | `extractDeveloperId(input)`, `isLikelyDeveloperId` (`android/play-api.ts`) | the user supplies their Play developer id | `human_gate` |
| `play-invite` | `inviteServiceAccount(args)` (`android/play-api.ts:163`) | invites the SA to the Play account | `auto` |
| `sa-validating` | `validateServiceAccountJson(opts)` (`android/service-account-validation.ts:383`) | `ValidationResult` | `auto` |
| `saving-credentials` | `updateSavedCredentials(...)` (`build/credentials.ts:352`) | persists `BuildCredentials` (android: keystore base64, alias, passwords, play config JSON) locally | `auto` |
| persistence/resume | `loadAndroidProgress`/`saveAndroidProgress` (`android/progress.ts`), `AndroidOnboardingProgress` (`android/types.ts`) | progress shape already exists | — |

`AndroidOnboardingProgress` fields (from `types.ts`): `keystoreMethod`, `keystoreAlias`, `keystoreStorePassword`, `keystoreKeyPassword`, `keystoreCommonName`, `serviceAccountMethod`, `serviceAccountJsonPath`, `completedSteps: { keystoreReady, googleSignInComplete, serviceAccountProvisioned, … }`, `_keystoreBase64`.

---

## Design decisions to bake into the full plan

1. **`platformChosen('android')` enters the Android sub-flow** instead of returning `credentials-not-implemented`. Add an Android branch keyed off the engine `phase: 'credentials'` + `platform: 'android'`, driven by an Android resume/decision function mirroring `getAndroidResumeStep` (which already exists and is unit-tested).

2. **Keystore = pure `auto`.** The drive-loop executor (built in Plan 2) calls `generateKeystore` with `generateRandomPassword()` for store/key passwords and `dname.commonName = appId`. Persist via `saveAndroidProgress` (`completedSteps.keystoreReady`) AND stage into build credentials. No human, no network.

3. **Google sign-in = browser-driven `auto`, with a pre-gate.** Because `runOAuthFlow` **blocks** while opening the browser + waiting on the loopback callback:
   - First return a `human_gate`-style "ready" directive: *"I'm about to open your browser for Google sign-in — approve there, then I'll continue automatically."* `next` = call `next_step`.
   - On that `next_step`, the executor invokes `runOAuthFlow` (blocking). **Open question:** MCP client tool-call timeouts — confirm the client allows a multi-minute tool call, or add a configurable timeout + a "re-open browser / retry" recovery result. Do **not** split the loopback across two tool calls (the server must stay up for the redirect).
   - Token (refresh + access) is held in `AndroidOnboardingProgress` (`_oauthRefreshToken`, mirrors existing fields) — a secret, so persisted to the secure progress file, never returned in the result.

4. **GCP provisioning = `auto` chain** using the OAuth access token: `generateProjectId(appId)` → `createProject`/`enableService` (poll with `pollOperation`) → `ensureServiceAccount` → `createServiceAccountKey` (this yields the service-account JSON used as the Play config). All coalesced by the drive loop.

5. **Play developer id = `human_gate`.** The user pastes/【provides their Play developer id (non-secret identifier → fine for chat); parse with `extractDeveloperId`. Then `inviteServiceAccount` (`auto`).

6. **Validate + save = `auto`.** `validateServiceAccountJson` then `updateSavedCredentials` with the android `BuildCredentials` (keystore base64/alias/passwords + play config JSON). End state `kind: done` for the credentials phase → hands to the Build phase (Plan 5).

7. **New `EngineDeps` (android).** Add injected deps so the flow stays unit-testable with fakes (mirror Plan 1/2):
   - `generateKeystore(appId) => Promise<{ alias, storePassword, keyPassword, p12Base64 }>` (wraps the pure fn + random passwords)
   - `runGoogleOAuth() => Promise<{ ok: true, accessToken, refreshToken, email } | { ok: false, error }>` (wraps `runOAuthFlow`)
   - `provisionGcp(appId, accessToken) => Promise<{ ok: true, serviceAccountJson } | { ok: false, error }>`
   - `invitePlay(developerId, serviceAccountEmail, accessToken) => Promise<{ ok: boolean, error? }>`
   - `validateServiceAccount(json) => Promise<{ ok: boolean, error? }>`
   - `saveAndroidCredentials(appId, creds) => Promise<void>`
   - `loadAndroidProgress(appId)` / `saveAndroidProgress(appId, p)`
   Real impls in `onboarding-tools.ts buildDeps`; fakes in the test file.

---

## Suggested task breakdown (to expand via writing-plans)

1. Android branch in `platformChosen` + a pure `decideAndroid(facts, androidProgress)` decider (states: keystore → oauth-ready → oauth-running → gcp → play-id → play-invite → validate → save → done). **Pure; unit-tested with fabricated progress** (mirror `getAndroidResumeStep` tests).
2. Extend the drive-loop executor for the Android `auto` steps (keystore, gcp, play-invite, validate, save) + the OAuth browser-driven step. Tests with fakes.
3. Google sign-in pre-gate + blocking `runGoogleOAuth` execution + timeout/retry recovery result. Tests.
4. Play developer-id `human_gate` (collect + `extractDeveloperId`) + `inviteServiceAccount`. Tests.
5. Wire the real android deps into `buildDeps` (`onboarding-tools.ts`); typecheck; build; integration smoke.

**Test convention:** same as Plans 1–2 — grow `cli/test/test-mcp-onboarding.mjs` (or add `test-mcp-onboarding-android.mjs`), `bun test/...`, register the `test:*` script + append to the aggregate `"test"`.

---

## Open questions for the full plan

- **OAuth tool-call timeout** (decision #3) — confirm client behavior; design the timeout + retry result.
- **Where the keystore is written to disk** vs kept in-memory/base64 only — check how `request build` and `updateSavedCredentials` expect the android keystore (path vs base64). The journey says "stored safely on your machine."
- **Reuse `android/progress.ts` directly, or mirror its state into the engine's own model?** Leaning: reuse `loadAndroidProgress`/`saveAndroidProgress` and have `decideAndroid` consume `AndroidOnboardingProgress` (so resume matches the Ink wizard's behavior and the existing `getAndroidResumeStep` tests stay the source of truth).
- **`updateSavedCredentials` exact arg shape / `BuildCredentials` fields** — read `build/credentials.ts` around line 352 + the `BuildCredentials` type before writing Task 5's code.
