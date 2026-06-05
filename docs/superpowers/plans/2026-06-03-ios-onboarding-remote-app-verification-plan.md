# Implementation Plan — iOS Onboarding Remote App Verification

Spec: [`../specs/2026-06-03-ios-onboarding-remote-app-verification-design.md`](../specs/2026-06-03-ios-onboarding-remote-app-verification-design.md)
Branch: `wolny/ios-onboarding-remote-app-verification` · base: `origin/main`
Executed via a multi-phase Workflow; one commit per micro-task.

## Invariant (the whole feature in one line)

In `app_store` mode, the step may only pass once **an App Store Connect app
exists whose `bundleId` == the Release `PRODUCT_BUNDLE_IDENTIFIER`**. The gate
re-verifies via the API on each Continue.

## Micro-tasks (each = one commit)

1. **plan** — this document.
2. **apple-api** (`cli/src/build/onboarding/apple-api.ts`) — add `listApps(token)`
   → `{ id, bundleId, name }[]` and `listBundleIds(token)` → `string[]` via the
   existing `ascFetch`; factor pure `parseAppsResponse` / `parseBundleIdsResponse`
   for testing. New test `cli/test/test-apple-api-app-list.mjs`.
3. **bundle-id-detector** (`cli/src/build/onboarding/bundle-id-detector.ts`) —
   harden `parsePbxprojBundleId` so Release is authoritative (never returns a
   Debug value when a Release config exists); expose the Debug value / a
   `debugReleaseDiffer` flag (Release stays authoritative, Debug not discarded).
   Extend `cli/test/test-bundle-id-detector.mjs` (divergent-Debug, no-Release).
4. **app-verification** (`cli/src/build/onboarding/app-verification.ts`, new) —
   pure module: `classifyAppVerification({ releaseBundleId, apps, bundleIds })`
   → `{ result, matchedApp? }` (`exact-match` | `wrong-build-id` |
   `no-app-identifier-exists` | `no-app-unregistered` | `no-apps-in-account`);
   and `evaluateGate({ path, satisfied, attempt })` →
   `{ proceed, escalationLevel }`. New test `cli/test/test-app-verification.mjs`.
5. **types** (`cli/src/build/onboarding/types.ts`) — add `'verify-app'` to
   `OnboardingStep`, a `STEP_PROGRESS['verify-app']` (~30, between `verifying-key`
   25 and `creating-certificate` 45), and a `getPhaseLabel` case ("Verify App
   Store app"). Reuse existing `iosBundleIdOverride` progress fields.
6. **app.tsx integration** (`cli/src/build/onboarding/ui/app.tsx`) — add the
   `verify-app` step wired into the post-`verifying-key` `redirectIfMismatch`
   fan-out (`app_store` mode only): fetch apps+bundleIds in parallel after the
   token is available; print the Debug≠Release note; render the picker (Path A)
   and create-app flow (Path B); enforce the gate (Continue = live re-check; Path
   A re-reads pbxproj fresh from disk bypassing the `app.tsx:256` memo; Path B
   re-polls `GET /v1/apps`, opens the create page only on explicit choice, asks
   before re-opening); escalating warning box; emit the PostHog events. On ASC
   fetch failure: warn + proceed. `ad_hoc` skips the step.
7. **test wiring** (`cli/package.json`) — add `test:apple-api-app-list` and
   `test:app-verification` scripts + include in the aggregate `test` chain; run
   `bun run typecheck` and all new tests; fix failures.
8. **review fixes** — address typescript-reviewer findings.

## Parallelism

Tasks 2–5 are independent files → run in parallel. Task 6 depends on 2–5. Tasks
7–8 are sequential at the end. Git commits are done in the main loop in
dependency order so each commit is coherent.

## Guardrails

- Repo blocks `Read/Write/Edit` + `rg/find/cat` via hooks; `zig*` CLI is not
  installed → all file ops use the **muonry MCP tools**.
- `capacitor.config.appId` is never modified. `pbxproj` is never auto-edited.
- The ASC API cannot create apps (v4.3.1 OpenAPI: `/v1/apps` is GET-only) — Path
  B opens the web page and verifies by re-polling.
- All telemetry best-effort (`void trackEvent`), always sets `step`.
