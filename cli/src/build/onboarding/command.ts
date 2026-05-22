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

// ANSI escape codes for the terminal's alternative screen buffer. Running
// the wizard in alt-screen mode means each Ink frame fully replaces the
// previous one (no scrollback accumulation), which kills the duplicate-
// Header artifact at step transitions and lets us conditionally hide the
// Header on steps that need the full terminal height (`requesting-build`
// and the scrollable AI viewer).
//
// Trade-off: when the wizard exits, the terminal restores to whatever was
// on screen before — the wizard's output is gone. That's the same behavior
// as `vim`/`htop`/`less`, and it's the expected UX for a TUI wizard. We
// print a one-line completion summary AFTER exiting alt screen so the
// user sees something concrete in their terminal flow.
const ENTER_ALT_SCREEN = '\x1B[?1049h\x1B[H' // enter buffer + cursor home
const EXIT_ALT_SCREEN = '\x1B[?1049l'

function enterAltScreen(): void {
  process.stdout.write(ENTER_ALT_SCREEN)
}

function exitAltScreen(): void {
  process.stdout.write(EXIT_ALT_SCREEN)
}

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

  // Defensive cleanup: if the process exits abnormally (uncaught exception,
  // SIGINT before Ink's own handler fires, etc.) we must restore the user's
  // normal terminal buffer — otherwise they're stranded in alt-screen mode
  // with no visible scrollback. Register handlers BEFORE entering alt screen
  // so any failure between here and the explicit exit still recovers.
  let altScreenActive = true
  const cleanupAltScreen = (): void => {
    if (!altScreenActive)
      return
    altScreenActive = false
    exitAltScreen()
  }
  process.once('exit', cleanupAltScreen)
  process.once('SIGINT', cleanupAltScreen)
  process.once('SIGTERM', cleanupAltScreen)
  process.once('uncaughtException', (err) => {
    cleanupAltScreen()
    // Re-throw on next tick so Node's default uncaughtException handling
    // (print stack + exit non-zero) still fires after we've restored the
    // terminal.
    setImmediate(() => {
      throw err
    })
  })

  enterAltScreen()
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
    cleanupAltScreen()
  }

  // Brief summary in the user's normal terminal flow so they have a visible
  // record that onboarding finished (alt-screen restoration wiped the
  // wizard's last frame). Written through process.stdout to bypass the
  // project-wide no-console lint rule — this is a one-shot UX message,
  // not application logging.
  process.stdout.write(`\n✔ Capgo onboarding complete for ${appId} (${platform}).\n`)
}
