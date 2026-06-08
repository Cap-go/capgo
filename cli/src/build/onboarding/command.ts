import { existsSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
import { log } from '@clack/prompts'
// src/build/onboarding/command.ts
import { render } from 'ink'
import React from 'react'
import { getAppId, getConfig } from '../../utils.js'
import { appendInternalLog, startInternalLog } from '../../support/internal-log.js'
import { getPlatformDirFromCapacitorConfig } from '../platform-paths.js'
import OnboardingShell from './ui/shell.js'
import { checkForCliUpdate, manualUpdateHint, runUpdateAndReexec } from './self-update.js'
import type { OnboardingResult } from './types.js'

export interface OnboardingBuilderOptions {
  apikey?: string
  platform?: string
  // Capgo API gateway override (--supa-host) — threaded to the wizard so its
  // build request AND AI analysis hit the same host as the plain CLI flow
  // (preprod/self-hosted testing). Defaults to prod when omitted.
  supaHost?: string
  /**
   * Offer the self-update prompt as the first wizard screen. ONLY the genuine
   * `build init` / `onboarding` entrypoint sets this. Other callers that reach
   * onboarding as a sub-step (`bundle upload`'s launch-onboarding,
   * `build credentials manage`) must leave it false: their process.argv is the
   * wrapper command (`bundle upload …`), so a re-exec would repeat THAT command
   * (e.g. re-run the upload) instead of `build init`.
   */
  enableSelfUpdate?: boolean
}

type Platform = 'ios' | 'android'

/**
 * Decide which platform to onboard WITHOUT prompting:
 *   1. Explicit `--platform` flag.
 *   2. If only one of `ios/` or `android/` exists in cwd, use that one.
 *   3. Otherwise (both or neither) → undefined: the in-wizard PlatformPicker
 *      asks inside the alt screen (see OnboardingShell), so the prompt is
 *      consistent with the rest of the wizard instead of a pre-render
 *      `@clack/prompts` select in the normal buffer.
 */
function resolveInitialPlatform(
  options: OnboardingBuilderOptions,
  iosDir: string,
  androidDir: string,
): Platform | undefined {
  const requested = (options.platform || '').toLowerCase()
  if (requested === 'ios' || requested === 'android')
    return requested
  if (requested) {
    log.error(`Invalid --platform: "${options.platform}". Use "ios" or "android".`)
    process.exit(1)
  }

  const cwd = process.cwd()
  const iosExists = existsSync(join(cwd, iosDir))
  const androidExists = existsSync(join(cwd, androidDir))
  if (iosExists && !androidExists)
    return 'ios'
  if (androidExists && !iosExists)
    return 'android'
  return undefined
}

// The whole onboarding wizard runs inside the terminal's alternative screen
// buffer (vim / htop / less style), enabled via Ink's `alternateScreen: true`
// render option (Ink ≥ 7):
//
//   - In the alt buffer there is NO scrollback, so every Ink frame fully
//     replaces the previous one. That eliminates the entire class of
//     main-buffer artifacts we fought with — duplicate Header on step
//     transitions, "scrolling added a line", frame-height drift.
//   - Tall content (e.g. the AI analysis) still needs in-app scrolling
//     because the alt buffer is viewport-sized; that's what the
//     FullscreenAiViewer component handles.
//   - Ink owns enter/exit: it enters on render (only when interactive + TTY)
//     and restores the primary buffer on unmount — including on SIGINT/SIGTERM
//     and process exit (via signal-exit) — so no manual escape codes or
//     restore handlers are needed. It also shows the cursor again on teardown.
//
// A single OnboardingShell is rendered: it shows the platform picker inside the
// alt screen (when the platform isn't pre-resolved) and then mounts the chosen
// platform's app inline in the same Ink tree (no second render, no flash).
//
// Trade-off: on exit the terminal restores to whatever was on screen before
// the wizard started — the wizard's frames are gone (same as quitting vim).
// We print a one-line completion summary AFTER Ink restores the primary buffer
// so the user has a durable breadcrumb in their normal terminal flow.

export async function onboardingBuilderCommand(options: OnboardingBuilderOptions = {}): Promise<void> {
  // Ink requires an interactive terminal — fail fast in CI/pipes
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    console.error('Error: `build init` requires an interactive terminal.')
    console.error('It cannot run in CI, pipes, or non-TTY environments.')
    console.error('Use `build credentials save` for non-interactive credential setup.')
    process.exit(1)
  }

  // Detect app ID and platform directories from capacitor.config.ts
  let appId: string | undefined
  // `iosBundleIdInitial` is the iOS-side default — the top-level
  // `config.appId` (what `cap sync` writes into PRODUCT_BUNDLE_IDENTIFIER).
  // This is distinct from `appId` above, which `getAppId` resolves to the
  // CapacitorUpdater plugin override when present (e.g. a Capgo dev-tunnel
  // suffix). The iOS onboarding flow uses these for different purposes —
  // never collapse them — see the AppProps doc-block in ui/app.tsx.
  let iosBundleIdInitial: string | undefined
  let iosDir = 'ios'
  let androidDir = 'android'
  try {
    const extConfig = await getConfig()
    appId = getAppId(undefined, extConfig?.config)
    iosBundleIdInitial = extConfig?.config?.appId
    iosDir = getPlatformDirFromCapacitorConfig(extConfig?.config, 'ios')
    androidDir = getPlatformDirFromCapacitorConfig(extConfig?.config, 'android')
  }
  catch {
    // getConfig may throw if not in a Capacitor project
  }

  if (!appId) {
    log.error('Could not detect app ID from capacitor.config.ts. Make sure you are in a Capacitor project directory.')
    process.exit(1)
  }

  // Start the verbose internal log up front so EVERY step transition, validation
  // result, and error from this run is captured for the support bundle. Without
  // this, getInternalLogPath() is null and all appendInternalLog calls no-op —
  // which is why the bundle's "Internal log" section used to be empty for build init.
  startInternalLog(appId)
  appendInternalLog(`build init: started for ${appId} (platform ${options.platform ?? 'auto'}, host ${options.supaHost ?? 'prod'})`)
  // If config.appId is missing (very rare — CapacitorConfig.appId is required
  // for `cap sync` to produce a working iOS project), fall back to the
  // resolved Capgo lookup key. Mismatch detection will still surface the
  // pbxproj/plist values; the user can pick the right one from there.
  const iosBundleIdForOnboarding = iosBundleIdInitial || appId

  const initialPlatform = resolveInitialPlatform(options, iosDir, androidDir)

  // Resolve update availability BEFORE render so the wizard can show the
  // self-update offer as its first screen. Gated to the real `build init`
  // entrypoint (see enableSelfUpdate) so a re-exec can't repeat a wrapper
  // command. Timeout-bounded (and skipped on the re-exec'd child via
  // CAPGO_SKIP_UPDATE_PROMPT), so this never stalls startup.
  const updateInfo = options.enableSelfUpdate ? await checkForCliUpdate() : null

  // The shell resolves the platform (immediately if initialPlatform is set,
  // else once the user picks). Capture it so the breadcrumb below — printed
  // after Ink restores the primary buffer — names the right platform.
  let resolvedPlatform: Platform | undefined = initialPlatform
  // Default to 'cancelled': the wizard reports 'completed' (with a summary) ONLY
  // when it reaches build-complete. Any other exit (missing platform, user
  // cancel, error) leaves this untouched, so we never claim false success.
  let result: OnboardingResult = { outcome: 'cancelled' }
  const { waitUntilExit } = render(
    React.createElement(OnboardingShell, {
      appId,
      // Threaded through to the iOS OnboardingApp so it can use the iOS
      // bundle id (config.appId) for Apple-side operations while keeping
      // `appId` (the Capgo lookup key, which may include a dev-tunnel
      // suffix via plugins.CapacitorUpdater.appId) for Capgo SaaS calls.
      // See the AppProps doc-block in ui/app.tsx for the split.
      iosBundleIdInitial: iosBundleIdForOnboarding,
      iosDir,
      androidDir,
      apikey: options.apikey,
      supaHost: options.supaHost,
      initialPlatform,
      updateInfo: updateInfo ?? undefined,
      onResolvePlatform: (platform: Platform) => {
        resolvedPlatform = platform
      },
      onResult: (r: OnboardingResult) => {
        result = r
      },
    }),
    { alternateScreen: true },
  )
  await waitUntilExit()

  // The user accepted the self-update offer: Ink has restored the primary
  // buffer, so the install + re-exec can take over the terminal (it needs
  // stdio inheritance). On success this never returns — it exits with the
  // child's status code; on failure, fall back to a manual-update hint instead
  // of silently continuing on the stale version the user chose to leave.
  if (result.outcome === 'update-requested' && updateInfo) {
    try {
      runUpdateAndReexec(updateInfo.latestVersion)
    }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      log.warn(`Could not auto-update (${message}). Still on @capgo/cli@${updateInfo.currentVersion}.`)
      process.stdout.write(`Re-run \`capgo build init\` to try again, or update manually: ${manualUpdateHint()}\n`)
      process.exit(1)
    }
    return
  }

  // Durable post-exit output in the user's normal terminal flow — the alt buffer
  // restore wiped the wizard's last frame, so anything the user needs to keep
  // (build URL, generated file paths) must be reprinted here. Written via
  // process.stdout to bypass the project-wide no-console lint rule (one-shot UX
  // message, not application logging).
  if (result.outcome === 'completed') {
    const platformSuffix = resolvedPlatform ? ` (${resolvedPlatform})` : ''
    process.stdout.write(`\n✔ Capgo onboarding complete for ${appId}${platformSuffix}.\n`)
    const s = result.summary
    if (s) {
      if (s.buildUrl)
        process.stdout.write(`  Build:    ${s.buildUrl}\n`)
      if (s.workflowFilePath)
        process.stdout.write(`  Workflow: ${s.workflowFilePath}\n`)
      if (s.envExportPath)
        process.stdout.write(`  Env file: ${s.envExportPath}\n`)
      if (s.ciSecretUploadSummary)
        process.stdout.write(`  Secrets:  ${s.ciSecretUploadSummary}\n`)
      if (s.buildRequestCommand)
        process.stdout.write(`  Run anytime: ${s.buildRequestCommand}\n`)
    }
  }
  else {
    // Cancelled / incomplete — do NOT claim success. The wizard already showed
    // the user why it stopped (e.g. the "no native platform" screen); this is
    // just a neutral closing line so the exit isn't silent.
    process.stdout.write(`\nCapgo onboarding exited — setup not completed. Re-run \`capgo build init\` to continue.\n`)
  }
}
