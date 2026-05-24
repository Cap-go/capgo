# Android onboarding: import existing service account JSON

**Date:** 2026-05-21
**Status:** Approved — ready for implementation plan
**Area:** `cli/src/build/onboarding/android/`

## Problem

The Capgo CLI's `build init` Android onboarding currently has one path for setting
up Google Play service-account credentials: a fully automated Google OAuth flow
that signs the user in, picks/creates a GCP project, creates a brand-new service
account, generates a JSON key, and invites the SA to the user's Play Console
developer account.

Users who already manage their own service account (because they use fastlane
`supply` outside Capgo, have a corporate GCP setup, or simply prefer to keep
secrets self-managed) have no way to plug their existing credentials in via
`build init`. They have to fall back to `build credentials save`, which bypasses
the entire onboarding TUI and offers no validation feedback.

The existing keystore phase already supports this pattern — the
`keystore-method-select` step lets the user choose **existing** or **generate**.
We want the same affordance for the service account.

## Goals

- Add an "I have my own service account JSON" path to the Android onboarding TUI.
- Use the macOS native file picker (filtered to `.json`) when running on macOS,
  with a manual-path fallback on other platforms — mirrors the existing keystore
  flow.
- Validate the imported SA against the user's Play Console app *before* saving
  credentials, so failures surface during onboarding (not at first build).
- Soft-fail gracefully: if validation can't complete (offline, SA not invited
  yet, wrong package), let the user save anyway, retry with a different file,
  or fall back to the OAuth path.
- Do not regress the existing OAuth path or the keystore fork.

## Non-goals

- Ask the user for a Play Console developer ID. Fastlane's `supply` does not need
  one — it authenticates with the SA JSON and scopes all calls by `packageName`.
  See "Why no developer ID" below.
- Support importing a partial credential bundle (e.g. SA only, keystore still
  generated). The keystore fork is independent and already covers that case.
- Migrate the existing OAuth path to share code paths with the import path.

## Why no developer ID

The current OAuth flow asks for the Play Console developer ID because Capgo
**creates** a fresh SA and calls
`androidpublisher.developers.{developerId}.users.create` to invite it to the
user's Play Console developer account
([`play-api.ts`](../../../cli/src/build/onboarding/android/play-api.ts)).
That invite is a one-time provisioning step.

For an **imported** SA the user has already performed the invite themselves in
Play Console → Users and permissions. From then on, every upload call is scoped
by `packageName` only — Google resolves which developer account owns the package
on its side. Fastlane's `supply` confirms this:

- `supply/lib/supply/client.rb` authenticates with
  `Google::Auth::ServiceAccountCredentials.make_creds(json_key_io: …, scope: …)`
  and then calls `client.insert_edit(package_name)`,
  `client.list_edit_bundles(package_name, edit_id)`,
  `client.commit_edit(package_name, edit_id, …)` etc.
- `supply/lib/supply/options.rb` exposes `package_name`, `json_key`,
  `json_key_data`, `issuer`, etc. — **no** `developer_id` /
  `developer_account_id` option.

So for imports the developer ID would only be useful as a validation aid, and
even then `edits.insert(packageName)` is a strictly better check (it tests the
same auth path fastlane will take at build time).

## Flow

```text
keystore phase (unchanged: existing / generate)
  ↓
service-account-method-select   ← NEW fork
  ├─ "Set it up for me via Google" ─→ existing OAuth path (unchanged)
  └─ "I have my service account JSON" ─→ import path:
        android-package-select          (reused: confirm packageName)
        sa-json-existing-path           (NEW: picker-or-manual chooser)
        ├─ "Open file picker"  ─→ sa-json-existing-picker (macOS only)
        └─ "Type the path"     ─→ text input
        sa-json-validating              (NEW: shape → token → edits.insert/delete)
        ├─ ok       ─→ saving-credentials (existing)
        └─ failed   ─→ sa-json-validation-failed (NEW: soft-warn recovery)
                       ├─ "Try a different SA file"      ─→ sa-json-existing-path
                       ├─ "Save anyway (skip validation)" ─→ saving-credentials
                       └─ "Set up via Google instead"     ─→ google-sign-in
```

## State additions

### `AndroidOnboardingStep` (new variants)

```typescript
| 'service-account-method-select'
| 'sa-json-existing-path'
| 'sa-json-existing-picker'
| 'sa-json-validating'
| 'sa-json-validation-failed'
```

Existing `android-package-select` gains a new outbound edge: when
`serviceAccountMethod === 'existing'` it routes to `sa-json-existing-path`
instead of `gcp-setup-running`.

### `AndroidOnboardingProgress` (new fields)

```typescript
serviceAccountMethod?: 'existing' | 'generate'
serviceAccountJsonPath?: string
serviceAccountValidationSkipped?: boolean
```

`serviceAccountMethod` is the source of truth for resume routing. Absent on
legacy progress files (created before this field existed) → resume defaults to
`generate` for backward compatibility, exactly like the iOS `setupMethod` field.

### `ANDROID_STEP_PROGRESS` and `getAndroidPhaseLabel`

The existing OAuth phase labels stay unchanged. The new steps map to:

- `service-account-method-select` → `'Step 2 of 4 · Service account'`
- `sa-json-existing-path`, `sa-json-existing-picker`, `sa-json-validating`,
  `sa-json-validation-failed` → `'Step 3 of 4 · Service account'`

Progress percentages: `service-account-method-select` = 22,
`sa-json-existing-path` = 28, `sa-json-existing-picker` = 28,
`sa-json-validating` = 70, `sa-json-validation-failed` = 70 (same as the OAuth
path's `gcp-setup-running` so the bar doesn't jump back).

## Validation module

New file: `cli/src/build/onboarding/android/service-account-validation.ts`

```typescript
export type ValidationResult
  = | { ok: true, serviceAccountEmail: string, projectId: string }
    | { ok: false, kind: 'shape-error', message: string }
    | { ok: false, kind: 'token-error', message: string }
    | { ok: false, kind: 'no-app-access', message: string, serviceAccountEmail: string }
    | { ok: false, kind: 'network-error', message: string }

export async function validateServiceAccountJson(args: {
  jsonBytes: Buffer
  packageName: string
  signal?: AbortSignal
}): Promise<ValidationResult>
```

### Algorithm

1. **Shape check** — `JSON.parse`, then confirm:
   - `type === 'service_account'`
   - non-empty `private_key`, `client_email`, `project_id`, `token_uri`
   Failure ⇒ `shape-error`.

2. **Token exchange** — build a signed JWT (using `node:crypto.createSign` with
   the SA private key), POST to `token_uri` with `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer`
   and `scope=https://www.googleapis.com/auth/androidpublisher`. Failure ⇒
   `token-error` with Google's error message.

3. **App-access check** — POST
   `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/{packageName}/edits`
   with empty JSON body and the bearer token.
   - 200 ⇒ grab `editId`, then DELETE
     `applications/{packageName}/edits/{editId}`. Cleanup is best-effort: log
     warnings on DELETE failure but treat the overall result as ok (the draft
     edit auto-expires after 7 days regardless).
   - 403 / 404 / 401 ⇒ `no-app-access`. Message includes the SA email and
     packageName plus the actionable hint: "Invite this SA in Play Console →
     Users and permissions → grant access to package X".
   - Network failure / non-2xx / 5xx ⇒ `network-error`.

The function takes an `AbortSignal` so the React UI can cancel mid-flight (e.g.
user hits Ctrl+C). Both fetch calls forward the signal.

## File picker

Add to `cli/src/build/onboarding/file-picker.ts`:

```typescript
export function openServiceAccountJsonPicker(): Promise<string | null> {
  return openMacFilePicker(
    'POSIX path of (choose file of type {"json"} with prompt "Select your Google Play service account JSON")',
  )
}
```

UX mirrors the keystore picker exactly:

- **macOS** — `sa-json-existing-path` shows a `Select` with two options:
  - "📂 Open file picker" → `sa-json-existing-picker`
  - "📝 Type the path" → falls through to text input
  Picker cancellation falls back to text input.
- **Non-macOS** — `sa-json-existing-path` renders a `FilteredTextInput` straight
  away, with the "drag a file into this window" hint.

Resolved path is `existsSync`-checked before transitioning to
`sa-json-validating`, same as the keystore path step.

## Saving credentials

Both the validation-success transition and the "save anyway" transition must
populate the same in-progress field before jumping to `saving-credentials`:

- Read the SA JSON file bytes from `serviceAccountJsonPath`, base64-encode,
  write into `progress._serviceAccountKeyBase64`. This is the same field the
  OAuth path uses, so the existing `saving-credentials` code path picks it up
  unchanged and emits `PLAY_CONFIG_JSON` (already wired through
  `cli/src/schemas/build.ts`).
- Set `CredentialFile.PLAY_CONFIG_JSON_PATH` to the user-selected file path so
  the credential save record points back to the source file.
- The existing `saving-credentials` step handles disk write, atomic semantics,
  and the rest of the downstream flow (CI secrets detection, ask-build,
  request).

No changes to `cli/src/schemas/build.ts`.

## Failure recovery UI

`sa-json-validation-failed` step:

```text
⚠️  Service account validation failed
<error message tailored to the failure kind>

What would you like to do?
  🔄  Try a different service account file
  💾  Save credentials anyway (validation may have transient causes)
  🆕  Set up a new service account via Google
```

- "Try different file" → `sa-json-existing-path` (state preserved: package name
  pick is still valid).
- "Save anyway" → set `serviceAccountValidationSkipped: true` in progress, add a
  yellow banner log entry, jump to `saving-credentials`.
- "Set up via Google" → set `serviceAccountMethod: 'generate'` in progress, jump
  to `google-sign-in`. The keystore phase is already complete by this point so
  the OAuth flow picks up cleanly.

## Resume behaviour

`loadAndroidProgress` returns the progress record. Resume routing already lives
in `cli/src/build/onboarding/android/progress.ts`. New rules:

- If `serviceAccountMethod === 'existing'`:
  - If `_serviceAccountKeyBase64` is set (validation passed) → resume at
    `saving-credentials`.
  - Else if `serviceAccountJsonPath` is set → resume at `sa-json-validating`.
  - Else if `androidPackageChosen` is set → resume at `sa-json-existing-path`.
  - Else → resume at `service-account-method-select` (re-pick the fork).
- If `serviceAccountMethod === 'generate'` or absent → existing rules apply.

`serviceAccountValidationSkipped` is read at `saving-credentials` to gate the
banner log; it does not affect routing.

## Telemetry

Hook into the existing onboarding event channel used by `setLog()` /
`pushEvent()`. New events:

- `onboarding-android-sa-method-existing` / `…-sa-method-generate`
- `onboarding-android-sa-validation-success` / `…-token-error` /
  `…-no-app-access` / `…-network-error` / `…-shape-error`
- `onboarding-android-sa-recovery-retry` / `…-save-anyway` / `…-fallback-oauth`

These mirror the existing OAuth-step events so we can compare funnel completion
between paths.

## Files touched

| File | Change |
|------|--------|
| `cli/src/build/onboarding/android/service-account-validation.ts` | **NEW** — validation module |
| `cli/src/build/onboarding/file-picker.ts` | Add `openServiceAccountJsonPicker` |
| `cli/src/build/onboarding/android/types.ts` | New step variants, progress fields, phase labels |
| `cli/src/build/onboarding/android/progress.ts` | Resume routing for new states |
| `cli/src/build/onboarding/android/ui/app.tsx` | New step blocks, transitions, file-picker effect |

No backend, no schema changes, no migrations.

## Testing

### Unit

- `service-account-validation.test.ts`:
  - shape error: missing `private_key`, wrong `type`, malformed JSON
  - token error: mock `token_uri` returns 401 with `invalid_grant`
  - no-app-access: mock `edits.insert` returns 403; assert error message names
    the SA email and packageName
  - happy path: mock `edits.insert` 200 → mock `edits.delete` 200; assert
    `ok: true` with extracted email/projectId
  - network error: mock fetch rejects with `TypeError` (DNS failure)
  - cleanup-best-effort: mock `edits.insert` 200 → `edits.delete` 500;
    overall result still `ok: true`, warning logged

- Snapshot test on `service-account-method-select` UI to lock the copy.

### Resume / integration

- Test fixtures for `AndroidOnboardingProgress` at each new step; assert
  `getAndroidResumeStep` returns the expected step.
- Test that `serviceAccountValidationSkipped: true` survives a save/load round
  trip and surfaces the banner on resume.

### Manual / e2e (macOS only)

- Walk the full happy path with a real SA JSON and a real test app.
- Walk the no-app-access path with an SA that's been revoked from the test app.
- Walk the recovery options (retry, save-anyway, fallback to OAuth).
- Confirm the file picker filters to `.json` and that the cancel path falls
  through to text input.

## Risks & mitigations

- **`edits.insert` side effects** — Creates a draft edit on the user's Play
  Console. Mitigation: immediate `edits.delete`. Worst case (delete fails) the
  draft auto-expires in 7 days and is invisible to most Play Console views.
- **Network flakiness during validation** — Mitigated by the "save anyway"
  recovery option. The user can proceed and let the build surface the real
  error.
- **Progress field collision on resume** — Legacy progress files don't have
  `serviceAccountMethod`. Default to `'generate'` on absent so existing in-flight
  onboardings continue on the OAuth path they started on.
- **SA JSON file relocation between selection and validation** — `existsSync`
  check at path-input time + re-read at validation time. If the file is gone at
  validation time, surface as `shape-error` ("Could not read SA JSON: file not
  found").
