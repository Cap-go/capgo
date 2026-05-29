import { existsSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
import { isCancel, log, select } from '@clack/prompts'
// src/build/onboarding/command.ts
import { render } from 'ink'
import React from 'react'
import { getAppId, getConfig } from '../../utils.js'
import { getPlatformDirFromCapacitorConfig } from '../platform-paths.js'
import { loadAndroidProgress } from './android/progress.js'
import AndroidOnboardingApp from './android/ui/app.js'
import { loadProgress } from './progress.js'
import OnboardingApp from './ui/app.js'

export interface OnboardingBuilderOptions {
  apikey?: string
  platform?: string
}

type Platform = 'ios' | 'android'

/**
 * Decide which platform to onboard. Order:
 *   1. Explicit `--platform` flag.
 *   2. If only one of `ios/` or `android/` exists in cwd, use that one.
 *   3. Otherwise (both or neither), prompt the user.
 *
 * Lifting this up to before the Ink render means we can dispatch the right
 * onboarding app without the iOS-specific Ink component pretending to handle
 * Android picks.
 */
async function resolvePlatform(
  options: OnboardingBuilderOptions,
  iosDir: string,
  androidDir: string,
): Promise<Platform> {
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

  const choice = await select({
    message: 'Which platform do you want to set up?',
    options: [
      { label: '🍎  iOS', value: 'ios' as const },
      { label: '🤖  Android', value: 'android' as const },
    ],
  })
  if (isCancel(choice)) {
    log.info('Onboarding cancelled.')
    process.exit(0)
  }
  return choice
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
  let iosDir = 'ios'
  let androidDir = 'android'
  try {
    const extConfig = await getConfig()
    appId = getAppId(undefined, extConfig?.config)
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

  const platform = await resolvePlatform(options, iosDir, androidDir)

  // Ink enters the alternate screen buffer on render and restores the primary
  // buffer on unmount (incl. SIGINT/SIGTERM/process exit). `waitUntilExit`
  // resolves after that teardown, so the breadcrumb below lands on the
  // restored primary buffer.
  if (platform === 'android') {
    const androidProgress = await loadAndroidProgress(appId)
    const { waitUntilExit } = render(
      React.createElement(AndroidOnboardingApp, {
        appId,
        initialProgress: androidProgress,
        androidDir,
        apikey: options.apikey,
      }),
      { alternateScreen: true },
    )
    await waitUntilExit()
  }
  else {
    const progress = await loadProgress(appId)
    const { waitUntilExit } = render(
      React.createElement(OnboardingApp, { appId, initialProgress: progress, iosDir, apikey: options.apikey }),
      { alternateScreen: true },
    )
    await waitUntilExit()
  }

  // Durable breadcrumb in the user's normal terminal flow — the alt buffer
  // restore wiped the wizard's last frame. Written via process.stdout to
  // bypass the project-wide no-console lint rule (one-shot UX message, not
  // application logging).
  process.stdout.write(`\n✔ Capgo onboarding complete for ${appId} (${platform}).\n`)
}
