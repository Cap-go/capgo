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

// ANSI escape codes for the terminal's alternative screen buffer. The whole
// onboarding wizard runs inside this buffer (vim / htop / less style):
//
//   - In the alt buffer there is NO scrollback, so every Ink frame fully
//     replaces the previous one. That eliminates the entire class of
//     main-buffer artifacts we fought with — duplicate Header on step
//     transitions, "scrolling added a line", frame-height drift — without
//     any per-step height budgeting or Static/Header gymnastics.
//   - Tall content (e.g. the AI analysis) still needs in-app scrolling
//     because the alt buffer is viewport-sized; that's what the
//     FullscreenAiViewer component handles, and it works MORE reliably here
//     than in the main buffer precisely because there's no scrollback to
//     leak into.
//
// Trade-off: on exit the terminal restores to whatever was on screen before
// the wizard started — the wizard's frames are gone (same as quitting vim).
// We print a one-line completion summary AFTER leaving the alt buffer so the
// user has a durable breadcrumb in their normal terminal flow.
const ENTER_ALT_SCREEN = '\x1B[?1049h\x1B[H' // enter buffer + cursor home
const EXIT_ALT_SCREEN = '\x1B[?1049l'

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

  // Register the alt-buffer restore BEFORE entering it, so an abnormal exit
  // (uncaught exception, SIGINT/SIGTERM before Ink's own handler runs) can't
  // strand the user in the alt buffer with no visible shell.
  let altScreenActive = true
  const restoreMainScreen = (): void => {
    if (!altScreenActive)
      return
    altScreenActive = false
    process.stdout.write(EXIT_ALT_SCREEN)
  }
  process.once('exit', restoreMainScreen)
  process.once('SIGINT', restoreMainScreen)
  process.once('SIGTERM', restoreMainScreen)
  process.once('uncaughtException', (err) => {
    restoreMainScreen()
    // Re-throw next tick so Node's default print-stack-and-exit still runs.
    setImmediate(() => {
      throw err
    })
  })

  process.stdout.write(ENTER_ALT_SCREEN)
  try {
    if (platform === 'android') {
      const androidProgress = await loadAndroidProgress(appId)
      const { waitUntilExit } = render(
        React.createElement(AndroidOnboardingApp, {
          appId,
          initialProgress: androidProgress,
          androidDir,
          apikey: options.apikey,
        }),
      )
      await waitUntilExit()
    }
    else {
      const progress = await loadProgress(appId)
      const { waitUntilExit } = render(
        React.createElement(OnboardingApp, { appId, initialProgress: progress, iosDir, apikey: options.apikey }),
      )
      await waitUntilExit()
    }
  }
  finally {
    restoreMainScreen()
  }

  // Durable breadcrumb in the user's normal terminal flow — the alt buffer
  // restore wiped the wizard's last frame. Written via process.stdout to
  // bypass the project-wide no-console lint rule (one-shot UX message, not
  // application logging).
  process.stdout.write(`\n✔ Capgo onboarding complete for ${appId} (${platform}).\n`)
}
