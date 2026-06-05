# Design: `--fail-on-incompatible` flag for `bundle upload`

- **Date:** 2026-05-31
- **Status:** Approved (design); ready for implementation plan
- **Scope:** Capgo CLI only (`cli/`)

## Problem

When `npx @capgo/cli bundle upload` detects that a bundle's native dependencies
are incompatible with the channel's currently-live version, it prints a warning
table and an "app store update may be required" message — and then **uploads the
bundle anyway with exit code 0**. In CI this silently ships an OTA update that
cannot actually take effect without a native (app-store) build, and the pipeline
reports success.

There is no flag today that makes the command **refuse the upload and exit
non-zero** when compatibility is bad. This spec adds one.

## Current behavior (reference)

- `verifyCompatibility()` — [`cli/src/bundle/upload.ts:137`](../../../cli/src/bundle/upload.ts) — loads the
  channel's live version and compares native packages. It returns a
  `compatibility.result` of `'compatible' | 'incompatible' | 'skipped'`
  (`summarizeUploadCompatibility`, [`cli/src/bundle/compatibility.ts:166`](../../../cli/src/bundle/compatibility.ts)).
  - The real check only runs when the channel exists, has a version with
    `native_packages`, and `--ignore-metadata-check` is **not** set.
  - When the channel is new / has no remote native metadata, the check is
    **skipped** with a warning (`result === 'skipped'`).
- In the main upload flow — [`cli/src/bundle/upload.ts:905`](../../../cli/src/bundle/upload.ts) —
  `incompatible = compatibility.result === 'incompatible'`. When incompatible and
  not silent, it shows the Capgo Builder CTA (`maybePromptBuilderCta`,
  [`cli/src/bundle/builder-cta.ts:73`](../../../cli/src/bundle/builder-cta.ts)):
  - **Interactive:** prompts "start a native build?". Accept → returns
    `{ skipped: true, reason: 'NATIVE_BUILD', builderAction }` and the command
    launches the build flow. Decline/cancel → falls through and **uploads OTA**.
  - **CI / non-interactive:** prints a one-line Builder ad, returns `'continue'`,
    and **uploads OTA**.
- Option validation lives in `checkValidOptions()` —
  [`cli/src/bundle/upload.ts:1429`](../../../cli/src/bundle/upload.ts) — and uses `uploadFail()` (which
  `log.error`s then `throw`s) for mutually-exclusive flags.
- A thrown error propagates to the top-level handler —
  [`cli/src/index.ts:1115`](../../../cli/src/index.ts) — which logs the message and calls `exit(1)`.
- `uploadBundle()` — [`cli/src/bundle/upload.ts:1508`](../../../cli/src/bundle/upload.ts) — wraps the
  internal upload in a try/catch that, in an interactive TTY, offers a generic
  **"Would you like to retry the upload?"** prompt on any error.

## Goals

1. Add a `--fail-on-incompatible` flag to `bundle upload`.
2. When set and the bundle is **confirmed incompatible**, abort the upload before
   any write (no DB row, no file upload, no channel change) and exit non-zero.
3. Preserve the interactive Capgo Builder "escape hatch": accepting a native
   build is still allowed; only declining causes the failure.
4. Make the flag tamper-resistant: refuse to run together with
   `--ignore-metadata-check`.

## Non-goals (YAGNI)

- **No SDK or MCP option.** CLI-only. `sdk.uploadBundle()` and the
  `capgo_upload_bundle` MCP tool are unchanged. (May be mirrored in a future
  change per the CLI's AGENTS.md alignment rule.)
- **No config-file or environment-variable default.** The behavior is opt-in per
  invocation via the flag only.
- **No change** to compatible uploads or to the "skipped check" (new channel / no
  remote metadata) path — those still upload as today (fail-open on unverifiable).

## Resolved design decisions

| Decision | Choice | Rationale |
|---|---|---|
| What triggers failure | **Confirmed incompatibility only** (`result === 'incompatible'`). Skipped/unverifiable still uploads with a warning. | Matches the literal ask; avoids surprising failures on a channel's first-ever upload where there is no baseline to compare against. |
| Bypass protection | **Reject `--fail-on-incompatible` + `--ignore-metadata-check` together.** | `--ignore-metadata-check` disables exactly the check this flag enforces; allowing both would silently defeat the safety net. |
| Flag name | **`--fail-on-incompatible`** | Self-documenting; matches the common `--fail-on-X` CLI convention. Makes the "exit non-zero" behavior obvious in `--help`. |
| Scope | **CLI only** | Smallest surface; SDK/MCP can follow later if there is demand. |
| Interactive UX | **Escape hatch.** CI → fail immediately. Interactive → offer the Builder CTA; accept → native build path, decline/cancel → fail. | Keeps the helpful "here's how to fix it" affordance in a terminal while still enforcing the gate when the user opts out. |

## Behavior specification

| Situation | Today | With `--fail-on-incompatible` |
|---|---|---|
| Compatible | upload, exit 0 | upload, exit 0 (no change) |
| Check skipped (new channel / no remote metadata) | upload + warn, exit 0 | upload + warn, exit 0 (no change) |
| Incompatible — **CI / non-interactive** | warn + Builder ad, upload, exit 0 | **error, exit 1, nothing uploaded** (no promotional ad) |
| Incompatible — **interactive TTY** | prompt Builder; decline → upload OTA | prompt Builder; **accept → native build path; decline/cancel → exit 1** |
| `--fail-on-incompatible` + `--ignore-metadata-check` | n/a | **rejected at validation, exit 1**, before any network call |

**Invariant:** the failure check sits immediately after `verifyCompatibility()`
returns (and the interactive CTA resolves), which is *before* any version row is
created, any file is uploaded, or any channel is repointed. A blocked upload
leaves Capgo Cloud unchanged.

## Implementation plan

All changes are within `cli/`.

### 1. Schema — `cli/src/schemas/bundle.ts`

Add to `optionsUploadSchema` (near [line 31](../../../cli/src/schemas/bundle.ts)):

```ts
failOnIncompatible: z.boolean().optional(),
```

`OptionsUpload` is inferred from this schema, so the type updates automatically.

### 2. Flag registration — `cli/src/index.ts`

On the `bundle upload` command (alongside `--ignore-metadata-check`,
[line 202](../../../cli/src/index.ts)):

```ts
.option('--fail-on-incompatible', `Fail the upload (exit non-zero) instead of uploading when the bundle is incompatible with the channel's current native packages. In an interactive terminal you can still choose a native build; declining fails. Cannot be combined with --ignore-metadata-check.`)
```

Commander maps `--fail-on-incompatible` → `options.failOnIncompatible`.

### 3. Mutual-exclusion guard — `cli/src/bundle/upload.ts` `checkValidOptions`

Add (near [line 1429](../../../cli/src/bundle/upload.ts)):

```ts
if (options.failOnIncompatible && options.ignoreMetadataCheck) {
  uploadFail('You cannot use --fail-on-incompatible together with --ignore-metadata-check — the metadata check is exactly what --fail-on-incompatible enforces. Remove one of them.')
}
```

`checkValidOptions` runs first inside `uploadBundle` (before any network call).

### 4. The gate — `cli/src/bundle/upload.ts` (incompatible block, ~905–931)

Introduce a dedicated error + helper so the failure is reliably distinguishable
from other errors (see §5), then gate around the existing Builder CTA:

```ts
const incompatible = compatibility.result === 'incompatible'

if (incompatible && !silent) {
  // CI / non-interactive: hard fail now, skip the promotional Builder ad.
  if (options.failOnIncompatible && !interactive)
    uploadFailIncompatible(channel, incompatibleCount)

  const hasCredentials = (await loadSavedCredentials(appid)) !== null
  const builderAction = await maybePromptBuilderCta({ incompatible, interactive, hasCredentials, appId: appid, orgId, apikey, incompatibleCount })
  if (builderAction !== 'continue') {
    return { success: true, skipped: true, reason: 'NATIVE_BUILD', builderAction, /* …existing fields… */ }
  }

  // Interactive and the user declined the native-build escape hatch.
  if (options.failOnIncompatible)
    uploadFailIncompatible(channel, incompatibleCount)
}
```

Note: `interactive` is already computed in scope as
`canPromptInteractively({ silent })`.

### 5. Distinct error type + no-retry — `cli/src/bundle/upload.ts`

```ts
class IncompatibleBundleError extends Error {}

function uploadFailIncompatible(channel: string, incompatibleCount: number): never {
  void trackEvent({
    channel: 'bundle',
    event: 'Bundle Upload Blocked',
    icon: '⛔',
    apikey: options.apikey, // wire via params/closure as appropriate
    appId: appid,
    orgId,
    tags: { reason: 'incompatible', channel, channel_name: channel, incompatible_count: incompatibleCount, interactive },
  })
  const message = `Upload aborted: bundle is incompatible with channel "${channel}" (${incompatibleCount} native package(s) changed). A native build / app-store update is required. Run a native build with Capgo Builder (https://capgo.app/docs/cli/cloud-build/), or remove --fail-on-incompatible to upload anyway.`
  log.error(message)
  throw new IncompatibleBundleError(message)
}
```

(The exact parameter wiring — passing `appid`/`orgId`/`apikey`/`interactive` vs.
closing over them — is an implementation detail; the compatibility table itself
is already printed by `verifyCompatibility`, so this adds only the verdict + fix.)

In `uploadBundle`'s catch ([line 1531](../../../cli/src/bundle/upload.ts)), skip the generic
"retry the upload?" prompt for this error (retrying an incompatible bundle is
pointless), mirroring the existing `isChecksumError` special-case:

```ts
if (error instanceof IncompatibleBundleError)
  throw error
```

## Telemetry

A single fire-and-forget `Bundle Upload Blocked` event (shown in §5) when the
flag blocks an upload, with tags `{ reason: 'incompatible', channel,
channel_name, incompatible_count, interactive }`. This is consistent with the
existing `Bundle Upload Compatibility Checked` and `Bundle Incompatible` events
and lets adoption / real catches be measured. (`channel_name` is included
because PostHog overwrites `channel` with the event category, matching the
existing convention at [`cli/src/bundle/upload.ts:233`](../../../cli/src/bundle/upload.ts).)

## Testing strategy

Behavior-focused CLI tests (backend E2E lives in the Capgo repo, per
`cli/AGENTS.md`).

1. **Pure decision helper.** Extract the gate decision into a small, exported,
   side-effect-free helper, e.g.
   `shouldBlockIncompatibleUpload({ incompatible, failOnIncompatible, interactive, builderAction })`,
   and unit-test the matrix:
   - compatible → allow
   - skipped → allow
   - incompatible + `failOnIncompatible` + CI → block
   - incompatible + `failOnIncompatible` + interactive + accepted build → not blocked (native build path)
   - incompatible + `failOnIncompatible` + interactive + declined → block
   - incompatible + no flag → allow (current behavior preserved)
2. **`checkValidOptions`** rejects `--fail-on-incompatible` + `--ignore-metadata-check`.
3. Add the new script to the relevant test runner so it is covered by
   `bun run test`.

## Documentation

`--help`, `README.md`, and `webdocs/bundle.mdx` are all generated from the
Commander `.option()` description by `generateDocs`
([`cli/src/docs.ts:118`](../../../cli/src/docs.ts), run via `bun run generate-docs`). So:
1. Write a clear `.option()` description (§2).
2. Regenerate the docs.
3. Manually mention the flag in the relevant `cli/skills/release-management`
   doc, per the CLI's AGENTS.md rule to keep `skills/` aligned with CLI options.

## Local verification (per `cli/AGENTS.md`)

- `bun run lint`
- `bun run build`
- `bun run test:mcp`
- `bun run test:bundle`
- the new test script
- `node dist/index.js bundle upload --help` (confirm the flag appears)
