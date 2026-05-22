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
  // If config.appId is missing (very rare — CapacitorConfig.appId is required
  // for `cap sync` to produce a working iOS project), fall back to the
  // resolved Capgo lookup key. Mismatch detection will still surface the
  // pbxproj/plist values; the user can pick the right one from there.
  const iosBundleIdForOnboarding = iosBundleIdInitial || appId

  const platform = await resolvePlatform(options, iosDir, androidDir)

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
    return
  }

  const progress = await loadProgress(appId)
  const { waitUntilExit } = render(
    React.createElement(OnboardingApp, {
      appId,
      iosBundleIdInitial: iosBundleIdForOnboarding,
      initialProgress: progress,
      iosDir,
      apikey: options.apikey,
    }),
  )
  await waitUntilExit()
}
