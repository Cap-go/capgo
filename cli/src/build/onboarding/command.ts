import process from 'node:process'
import { log } from '@clack/prompts'
// src/build/onboarding/command.ts
import { render } from 'ink'
import React from 'react'
import { getAppId, getConfig } from '../../utils.js'
import { getPlatformDirFromCapacitorConfig } from '../platform-paths.js'
import { loadProgress } from './progress.js'
import OnboardingApp from './ui/app.js'

export interface OnboardingBuilderOptions {
  apikey?: string
}

export async function onboardingBuilderCommand(options: OnboardingBuilderOptions = {}): Promise<void> {
  // Ink requires an interactive terminal — fail fast in CI/pipes
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    console.error('Error: `build init` requires an interactive terminal.')
    console.error('It cannot run in CI, pipes, or non-TTY environments.')
    console.error('Use `build credentials save` for non-interactive credential setup.')
    process.exit(1)
  }

  // Detect app ID and iOS directory from capacitor.config.ts
  let appId: string | undefined
  let iosDir = 'ios' // default
  try {
    const extConfig = await getConfig()
    appId = getAppId(undefined, extConfig?.config)
    iosDir = getPlatformDirFromCapacitorConfig(extConfig?.config, 'ios')
  }
  catch {
    // getConfig may throw if not in a Capacitor project
  }

  if (!appId) {
    log.error('Could not detect app ID from capacitor.config.ts. Make sure you are in a Capacitor project directory.')
    process.exit(1)
  }

  // Load any existing progress
  const progress = await loadProgress(appId)

  // Launch Ink app
  const { waitUntilExit } = render(
    React.createElement(OnboardingApp, { appId, initialProgress: progress, iosDir, apikey: options.apikey }),
  )

  await waitUntilExit()
}
