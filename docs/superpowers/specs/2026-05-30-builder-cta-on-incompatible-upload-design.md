# Builder CTA on Incompatible Upload — Design

Date: 2026-05-30
Status: Approved (pending spec review)
Scope: `@capgo/cli` only — no backend changes

## Summary

When `capgo bundle upload` detects an **incompatible** bundle (native dependencies
changed, so a native build is required), surface a contextual call-to-action for
**Capgo Builder**:

- **No build credentials** → offer to **set up the Builder** (`build onboarding`).
- **Has build credentials** → offer to **run a native build now** (`build request`).

The whole feature is client-side. Funnel measurement uses the existing PostHog
telemetry pipeline (`trackEvent` → `/private/events` → PostHog). It also backfills
the currently-missing upload-side compatibility tracking event.

## Motivation

- An incompatible bundle is exactly the moment Capgo Builder solves the user's
  problem: native changes need a new app-store binary, which is what the Builder
  produces and ships.
- The verdict already exists: `isBuildNeeded(finalCompatibility)` in
  `cli/src/build/needed.ts` is `finalCompatibility.some(entry => !isCompatible(entry))`
  — identical to the upload's compatibility result.
- The upload path currently emits **no** compatibility tracking event (only the
  standalone `bundle compatibility` command does), so the day-by-day PostHog graphs
  don't reflect real uploads. This feature closes that gap.

## Trigger

The CTA is evaluated only when **all** hold:

1. Command is `bundle upload`.
2. Compatibility ran and the verdict is **incompatible** (`isBuildNeeded(...) === true`).
   - If `--ignore-metadata-check` was passed, no compatibility check runs, so no CTA.
3. Not currently snoozed (see Snooze).
4. `CAPGO_NO_BUILDER_PROMPT` is not truthy.

Compatible uploads are completely unchanged. The compatibility verdict itself remains
**non-fatal** (this feature does not block uploads).

## Behavior by environment

Interactivity is determined by the existing `canPromptInteractively()` helper
(already imported in `upload.ts`).

### Non-interactive / CI

Print a single warning + ad block, **no prompt**, then continue the upload unchanged:

```text
⚠️  This update changes native code, so it needs a native build to reach users
    on current app-store binaries.
    → Set up Capgo Builder:  npx @capgo/cli build onboarding        (no credentials yet)
    → Or run a native build: npx @capgo/cli build request --platform <ios|android>   (credentials found)
    Docs: https://capgo.app/docs/cli/cloud-build/
```

Show the line that matches the local credential state (onboarding vs build), not both.

### Interactive (TTY)

Shown **once per invocation**. Branch on local credentials.

**No credentials → onboarding CTA**

```text
This update includes native changes, which ship via an app-store build rather than OTA.
Set up Capgo Builder now? (Y/n)
```

- **Yes** → skip the OTA upload and return a `launch-onboarding` action; the CLI
  entry point launches `build onboarding`.
- **No** → confirmation step:

  ```text
  Heads up: this update includes native changes, which ship via an app-store build rather than OTA.
  Skip the Builder for now? (y/N)
  ```

  - **Yes (sure)** → snooze 3 days (this app), then continue the OTA upload.
  - **No (not sure)** → continue the OTA upload, **no snooze** (CTA may appear again next time).

**Has credentials → build CTA**

```text
This update needs a native build. Run one now with Capgo Builder? (Y/n)
```

- **Yes** → skip the OTA upload and return a `launch-build` action; the CLI entry
  point launches `build request`.
- **No** → same confirmation + snooze flow as above.

> Warning copy (option 4, "minimal heads-up") is intentionally low-fear and accurate:
> the OTA update still applies to users whose binary matches; Capgo's
> `min_update_version` gating is what protects older binaries. We do **not** claim
> "this update won't apply to users."

## Credential detection (local)

"Has credentials" = `loadSavedCredentials(appId)` (from `cli/src/build/credentials.ts`)
returns a non-`null` entry for the current `appId`. Credentials live under
`~/.capgo-credentials/` — the same store `build request` reads. No new helper and
no server-side lookup (explicitly out of scope).

## Snooze

- File: `~/.capgo-builder-prompt.json`.
- Shape: `{ [appId]: { snoozedUntil: <ISO8601> } }` (per-app, per-machine).
- Set **only** on a confirmed decline ("sure") → `snoozedUntil = now + 3 days`.
- On each upload, the CTA is suppressed while `now < snoozedUntil` for that app.
- Corrupt/missing file is treated as "not snoozed" (never throws).
- `CAPGO_NO_BUILDER_PROMPT=1` always suppresses the prompt (CI ad still allowed, or
  also suppressed — see Open decisions; default: suppresses everything).

## Accept → skip upload

Because accepting means the user is switching to a native build, the in-progress OTA
upload is abandoned before any zip/upload work:

- `verifyCompatibility` already runs early in `upload.ts`, before the bundle is zipped.
- The CTA is evaluated right after the incompatibility is known.
- On `launch-onboarding` / `launch-build`, the upload function invokes
  `onboardingBuilderCommand` / `requestBuildCommand` and returns early — no zip,
  no upload.

## Tracking (PostHog via existing `trackEvent`)

All events go through `cli/src/analytics/track.ts` → `sendEvent` → `/private/events`
→ PostHog (and LogSnag). They carry the standard global props (cli_version,
node_version, os, is_ci, app_id, org group) automatically.

| Event | Tags |
| --- | --- |
| `Bundle Upload Compatibility Checked` | `result` (compatible/incompatible), `incompatible_count`, `reasons` |
| `Builder CTA Shown` | `surface` (ci/interactive), `mode` (onboarding/build), `incompatible_count` |
| `Builder CTA Accepted` | `mode` |
| `Builder CTA Declined` | `mode`, `sure` (bool) |
| `Builder CTA Snoozed` | `mode`, `days` (3) |

This yields a funnel: incompatible upload → CTA shown → accepted → onboarding/build,
joinable with the existing **Capgo Builder Tracking** dashboard. The
`Bundle Upload Compatibility Checked` event also feeds the day-by-day
compatible-vs-incompatible graphs (previously only fed by the standalone command).

## Code shape (all client-side)

- `cli/src/bundle/builder-cta.ts`
  - `maybePromptBuilderCta(params): Promise<BuilderCtaAction>` where
    `BuilderCtaAction = 'continue' | 'launch-onboarding' | 'launch-build'` (string union).
  - Owns: environment detection, credential branch, prompt copy, confirm + snooze,
    and emitting the `Builder CTA *` events. `interactive` and `confirm` are injected
    by the caller for testability; the pure `decideBuilderCtaSurface` does the gating.
    The whole body is wrapped so it never throws (degrades to `continue`).
- Credential detection: reuse `loadSavedCredentials(appId)` from
  `cli/src/build/credentials.ts` (returns credentials | `null`); no new helper.
- `cli/src/bundle/builder-snooze.ts`
  - `isBuilderPromptSnoozed(appId, now, path?)`, `snoozeBuilderPrompt(appId, days, now, path?)`.
    Reads/writes `~/.capgo-builder-prompt.json`.
- `cli/src/bundle/upload.ts`
  - After `verifyCompatibility`, if incompatible **and not silent**: call
    `maybePromptBuilderCta`. On a launch action, skip the OTA upload and return a
    `builderAction` in the result. The Ink-based launch runs in the CLI entry point
    (`index.ts` → `cli/src/bundle/upload-command.ts`) so this SDK-shared module stays
    free of `ink`. CI path prints the ad and continues.
- Reuse `isBuildNeeded`, `getCompatibilityDetails` from
  `cli/src/build/needed.ts` and `isCompatible` from `cli/src/utils.ts`.

## Testing

- Unit tests (target ≥80% on new modules):
  - `maybePromptBuilderCta` decision matrix: {interactive, CI} × {creds, no-creds} ×
    {accept, decline-sure, decline-unsure} × {snoozed, not snoozed} → expected action
    + expected events. Prompt I/O mocked.
  - Snooze util: set/honor/expire, corrupt file tolerance, per-app isolation.
  - `hasLocalCredentials`: present/absent/malformed credentials file.
- Ensure no regression for compatible uploads and `--ignore-metadata-check`
  (no CTA, no new event other than the compat-checked event when applicable).

## Out of scope (YAGNI)

- No backend changes: no interest/waitlist endpoint, no server-side credential or
  build-usage lookup.
- CTA only in `bundle upload` (not `bundle compatibility` or `build needed`).
- No change to compatibility being non-fatal.
- No persistence beyond the snooze file.

## Decisions (resolved)

- Accept → skip upload and launch the relevant build flow inline.
- Snooze scope: **per-app**, per-machine, 3 days, set only on confirmed decline.
- "Not sure" at the confirm step → continue upload, do not snooze (re-ask next time).
- Warning copy: option 4 (minimal heads-up).
- Architecture: CLI-only, PostHog for tracking, local credential check.

## Open decisions (minor, can finalize in plan)

- Does `CAPGO_NO_BUILDER_PROMPT` also suppress the CI ad, or only the interactive
  prompt? Default assumption: suppresses everything.
- Exact `build request` invocation when launched inline (platform selection / prompt)
  — confirm against `requestBuildCommand`'s current interactive behavior.
