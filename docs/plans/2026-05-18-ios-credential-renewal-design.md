# iOS Credential Renewal — Design

**Date:** 2026-05-18
**Status:** Design approved, implementing
**Scope:** Capgo CLI (`@capgo/cli`), `cli/` workspace inside the capgo monorepo

## Summary

Add a `build init --renew` flag (plus a "Renew expired credentials" action in the existing `build credentials manage` TUI) that re-issues an iOS distribution certificate and its Capgo-created provisioning profiles using the saved App Store Connect API key. The renew flow auto-detects what's expiring (default threshold: 30 days), reuses the onboarding Ink UI and Apple-API helpers, and gracefully falls back to the onboarding `.p8` input chain if the saved API key is rejected.

## Motivation

iOS distribution certificates expire after 1 year. When they expire, the user can no longer ship builds, and every provisioning profile bound to the expired cert is also invalidated. Today the user must either run the full `build init` onboarding again (which is designed for fresh setup and asks too many questions) or piece together the Apple Developer portal steps manually. Both paths are friction-heavy. A single command that says "renew what's expiring" closes the gap.

## Non-Goals

1. **Android renewal.** Android keystores are valid for 25+ years. The Play OAuth refresh-token flow stays where it lives.
2. **Automatic renewal during `build request`.** Renew remains a deliberate, user-initiated operation.
3. **Renewal of user-imported (non-Capgo-named) provisioning profiles.** The plan flags them, warns about them, but does not attempt to re-issue them via Apple's API.
4. **Renewal of `.p8` API key, Team ID, Issuer ID, Key ID.** These don't time-expire on Apple's side; rejection triggers a fallback to the onboarding input flow.
5. **Cross-app bulk renewal.** Renew operates on one app at a time.
6. **Backward-compatibility shim for the legacy `BUILD_PROVISION_PROFILE_BASE64` format.** Renew refuses on legacy creds and points the user at `build credentials migrate`.
7. **Separate `--cert-only` / `--profile-only` flags.** Auto-detect handles asymmetric cases naturally.
8. **Rollback / backup of pre-renew credentials.**
9. **Per-step telemetry funnel.** One `Credentials renewed` event with summary tags is enough.

## User-facing surface

### Primary entry point: `build init --renew`

```bash
npx @capgo/cli build init --renew                       # auto-detect app from capacitor.config
npx @capgo/cli build init --renew --appId com.foo.bar   # explicit app
npx @capgo/cli build init --renew --force               # renew everything, skip expiry check
npx @capgo/cli build init --renew --days 60             # set "expiring soon" threshold (default 30)
npx @capgo/cli build init --renew --dry-run             # print the plan, take no action
npx @capgo/cli build init --renew --local               # operate on local .capgo-credentials.json instead of global
```

`--platform` defaults to `ios` in renew mode. `--platform android --renew` prints "not applicable" and exits zero.

### Secondary entry point: `build credentials manage`

The existing `pickAction` menu (View / Add / Export / Delete / Back / Quit) gets a new "Renew expired credentials" item. Selecting it switches the same Ink runtime into renew mode for the picked app.

## Behavior

### Step A — Load saved state
Auto-detect app ID from `capacitor.config` (or `--appId`). Load saved iOS credentials via `loadSavedCredentials(appId, local)`. If none exist or iOS section is missing → render `renew-no-credentials` screen, exit 1.

### Step B — Inspect expiry
- Parse `BUILD_CERTIFICATE_BASE64` (P12). Extract the embedded X.509 cert's `notAfter` date via new `extractCertExpiry(p12Base64, password)` helper in `csr.ts`.
- For each entry in `CAPGO_IOS_PROVISIONING_MAP`, base64-decode and parse with `parseMobileprovisionFromBase64`, which gains a new `expirationDate: Date` field on its return type (mobileprovision plist's `ExpirationDate` key).

### Step C — Compute the renewal plan
Pure function `computeRenewPlan(saved, appId, { thresholdDays, force })` returns:

```typescript
interface RenewPlan {
  appId: string
  cert: {
    needsRenewal: boolean
    currentExpiry: Date
    reason: 'expired' | 'expiring' | 'forced' | 'ok'
  }
  profiles: Array<{
    bundleId: string
    name: string
    needsRenewal: boolean
    currentExpiry: Date
    reason: 'expired' | 'expiring' | 'forced' | 'cert-renewed' | 'ok' | 'skipped-non-capgo'
    isCapgoCreated: boolean   // name matches `Capgo ${appId} AppStore`
  }>
  hasAnythingToRenew: boolean
}
```

A profile gets `needsRenewal = true` if expired, expires within `thresholdDays`, `force`, OR cert is being renewed.

A profile gets `reason: 'skipped-non-capgo'` and `needsRenewal: false` if name doesn't match the `Capgo ${appId} AppStore` convention.

### Step D — Show plan, ask to confirm
Render a table:

```
Renewal plan for com.example.app:

  Certificate
    Current expiry: 2026-06-14 (in 27 days)        → RENEW (expiring within 30d)

  Provisioning profiles (1 of 2 will be auto-renewed):
    com.example.app          2026-06-14            → RENEW (cert renewed)
    com.example.app.widget   2027-01-04 (manual)   → SKIP — user-imported, regenerate manually

Continue? [Y/n]
```

`--dry-run` exits here. When the cert is being renewed AND there are user-imported profiles in the map, the confirm prompt's default flips from Yes to No, an `Alert` warning is rendered above it, and the user must explicitly select Yes to proceed.

### Step E — Verify API key, fall back if rejected
Generate JWT from saved `.p8` + `APPLE_KEY_ID` + `APPLE_ISSUER_ID`, call `verifyApiKey`. On 401/403, route into onboarding chain: `api-key-instructions` → `p8-method-select` → `input-p8-path` → `input-key-id` → `input-issuer-id` → `verifying-key`. After successful re-verification, jump to Step F. Progress file tracks this so a resume doesn't re-prompt.

### Step F — Execute the cert renewal (if needed)
1. Generate fresh CSR.
2. `revokeCertificate` on the old cert (detected by matching saved P12 serial against `listDistributionCerts` results — if no match, skip).
3. `createCertificate(token, csrPem)` — on `CertificateLimitError`, reuse `cert-limit-prompt`, auto-suggest matching-serial cert at top.
4. `createP12(certContent, privateKeyPem, password)` with the existing default P12 password (or the user's saved password).
5. Persist new `BUILD_CERTIFICATE_BASE64` in the in-progress plan.

### Step G — Execute profile renewals
For each profile flagged `needsRenewal = true`:
1. `ensureBundleId(token, bundleId)` — re-registers if deleted.
2. `findCapgoProfiles(token, appId)` + `deleteProfile` for existing profiles with our naming convention.
3. `createProfile(token, bundleIdResourceId, certificateId, appId)` — on `DuplicateProfileError`, reuse `duplicate-profile-prompt`, default-to-delete phrasing.
4. Persist each successful profile into the progress file as it completes.

Render progress in `renew-creating-profiles`: progress bar with "Renewing profile N of M: `<bundleId>`…".

### Step H — Persist
`updateSavedCredentials(appId, 'ios', renewedFields, local)`. Delete onboarding progress file on success.

### Step I — Completion summary + optional build
Render `renew-complete`:

```
✅ Renewed for com.example.app
   Certificate: valid until 2027-05-18 (was 2026-06-14)
   Profiles renewed: 1
     - com.example.app
   Profiles skipped: 1
     - com.example.app.widget (user-imported — re-generate manually)

Run a test build now? [Y/n]
```

`Y` hands off to `requestBuildInternal` exactly like onboarding.

## Flow — Ink UI screens

`OnboardingApp` gets a `mode: 'init' | 'renew'` prop. ~80% of screens, helpers, and state are shared.

| # | Step | Source | Description |
|---|------|--------|-------------|
| 1 | `renew-analyzing` | new | "Inspecting saved credentials…" |
| 2 | `renew-no-credentials` | new | Terminal error. Exit 1. |
| 3 | `renew-nothing-to-do` | new | "Cert and all profiles valid for >30d. Use --force to renew anyway." Exit 0. |
| 4 | `renew-plan` | new | Plan table + confirm prompt. |
| 5 | `verifying-key` | reused | Verifies saved API key; falls through on 401/403. |
| 6 | `api-key-instructions` → `verifying-key` chain | reused | Only entered on rejected key. |
| 7 | `renew-revoking-cert` | new | "Revoking expiring cert…" — only when cert being renewed. |
| 8 | `creating-certificate` + `cert-limit-prompt` | reused | Generates CSR, calls Apple, handles cert limit. |
| 9 | `renew-creating-profiles` | new | Progress bar over profile list. |
| 10 | `duplicate-profile-prompt` | reused | Default-to-delete phrasing. |
| 11 | `renew-saving` | new | "Saving updated credentials…" — `updateSavedCredentials`, deletes progress file. |
| 12 | `renew-complete` | new | Summary + "Run a test build now?" prompt. |
| — | `error` | reused | Error + recovery advice + support bundle. |

Skipped in renew mode: `welcome`, `platform-select`, `adding-platform`, `credentials-exist`, `backing-up`.

**Progress file:** Uses existing `~/.capgo-credentials/onboarding/<appId>.json` with new `mode: 'renew'` field. `getResumeStep` extended.

## Code organization

### Files to add

```
cli/src/build/onboarding/
  renew-detection.ts          Pure plan computation
  renew-execution.ts          Orchestrator (revoke → CSR → cert → profiles → save)
  ui/
    renew-plan.tsx            Plan table screen
    renew-progress.tsx        Multi-profile progress screen
    renew-complete.tsx        Completion summary
```

### Files to extend

```
cli/src/build/onboarding/
  types.ts                    Add renew-specific OnboardingStep values; add mode field to OnboardingProgress
  progress.ts                 Extend getResumeStep
  command.ts                  Accept renew option; pass mode='renew' to OnboardingApp
  apple-api.ts                Add listProfiles (broader than findCapgoProfiles)
  csr.ts                      Add extractCertExpiry(p12Base64, password)
  mobileprovision-parser.ts   Return expirationDate
  ui/app.tsx                  Accept mode prop, branch screens, wire new renew steps

cli/src/build/
  credentials-manage.ts       Add 'renew' to pickAction menu; render OnboardingApp with mode='renew' on select

cli/src/
  index.ts                    Add --renew, --force, --days, --dry-run options to build init
```

## Edge cases

| Scenario | Behavior |
|----------|----------|
| No saved iOS creds | `renew-no-credentials`. Exit 1. |
| Saved `.p12` corrupt | `error` screen, recovery: "Run `build init`." Exit 1. |
| Missing P12_PASSWORD | Try DEFAULT_P12_PASSWORD then empty string. If still fails, treat as corrupt. |
| Legacy `BUILD_PROVISION_PROFILE_BASE64` without map | Refuse, point to `build credentials migrate`. |
| Map empty `{}` | Renew cert only (if needed). Summary notes empty map. |
| Saved API key rejected (401/403) | Fall through to onboarding p8 input chain. |
| `CertificateLimitError` | Reuse `cert-limit-prompt`. Auto-suggest matching-serial cert at top. |
| `DuplicateProfileError` | Reuse `duplicate-profile-prompt`, default-to-delete. |
| Network failure mid-profile-loop | Progress file persisted per profile; resume picks up at next unfinished one. |
| Proactive revoke succeeds but `createCertificate` fails | Re-running recovers — saved P12 serial no longer matches, treated as "no old cert," proceed to fresh create. |
| Apple 429 | Surface error, recovery advice, no auto-retry. |
| User-imported profile + cert renewed | Plan prompt default flips to No, warning rendered. |
| `--dry-run` | Exit after plan screen. |
| All valid for >threshold | `renew-nothing-to-do`. Suggest `--force`. Exit 0. |
| User cancels at confirm | Clean exit, progress file deleted. |
| Ctrl+C mid-flow | Progress file retains last step. Re-run resumes. |
| Bundle ID deleted from App Store Connect | `ensureBundleId` re-registers. |
| Insufficient API key permissions | 403 on cert creation. Recovery: "Key needs Admin or Developer role." |

## Telemetry

Single `Credentials renewed` event via `sendEvent`:

```typescript
{
  channel: 'credentials',
  event: 'Credentials renewed',
  icon: '🔄',
  user_id: orgId,
  tags: {
    'app-id': appId,
    'platform': 'ios',
    'storage': options.local ? 'local' : 'global',
    'triggered-from': 'init-flag' | 'manage-menu',
    'cert-renewed': boolean,
    'profiles-renewed': number,
    'profiles-skipped-non-capgo': number,
    'fell-back-to-key-input': boolean,
  },
  notify: false,
}
```

Wrapped in the same silently-ignore try/catch as existing `Credentials saved`.

## Testing strategy

### Unit tests
- `test-renew-detection.mjs` — table-driven (cert expiry offset, profile expiry offsets, threshold, force) → expected `RenewPlan`. Includes user-imported profile naming detection.
- `test-extract-cert-expiry.mjs` — generates a P12 with known expiry, asserts the helper extracts it.
- `test-mobileprovision-parser.mjs` — extended to assert `expirationDate` field.

### Integration tests (mocked Apple API)
- `test-renew-execution.mjs` — mocks `verifyApiKey`, `revokeCertificate`, `createCertificate`, `ensureBundleId`, `findCapgoProfiles`, `deleteProfile`, `createProfile`. Asserts call sequences and error paths.

## Migration / rollout

Strictly additive. No DB / server-side / shared-protocol changes. The `mode` field on `OnboardingProgress` is backward-compatible (missing = `'init'`).
