// Step + progress model for the Appflow migration flow.
import type { AppflowToken } from './auth'

export type AppflowStep =
  | 'explain' // step 1: secure-auth explanation + support note
  | 'authenticating' // step 2: PKCE login (auto)
  | 'select-org' // step 3 (auto-select if one)
  | 'select-app' // step 4 (auto-select if one)
  | 'fetch-signing' // step 5: list + download signing (auto)
  | 'select-ios-cert' // step 5 prompt (2+ iOS certs)
  | 'select-android-cert' // step 5 prompt (2+ android certs)
  | 'no-signing-submenu' // step 5 recovery submenu (per-platform or whole-migration)
  | 'fetch-distribution' // step 6: list + download distribution (auto)
  | 'ios-dist-gapfill' // step 6: no iOS dist -> offer p8 generate/provide
  | 'android-dist-gapfill' // step 6: no Android dist -> offer SA generate/provide
  | 'validate' // step 7 (advisory, surfaced, non-blocking)
  | 'p8-upgrade-prompt' // step 8 (iOS only)
  | 'handoff-build' // converge: hand to the build/tail steps
  | 'done'
  | 'error'

export type MigrationScope = 'both' | 'ios' | 'android'
export type NoSigningScope = 'ios' | 'android' | 'all'

export interface AppflowProgress {
  scope: MigrationScope // intent: which platform(s) the user chose to migrate
  token?: AppflowToken
  orgSlug?: string
  appId?: string
  appSlug?: string
  ios?: Record<string, string> // mapped Capgo iOS creds collected so far
  android?: Record<string, string> // mapped Capgo Android creds collected so far
  migratable: { ios: boolean, android: boolean }
  noSigningScope?: NoSigningScope
  completedSteps: AppflowStep[]
}

export type AppflowInput = { value?: string, field?: string, text?: string }
