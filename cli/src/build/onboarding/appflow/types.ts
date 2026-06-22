// Step + progress model for the Appflow migration flow.
import type { AppflowToken } from './auth'
import type { TailStep } from '../tail/flow.js'
import type { BuildScriptChoice, PackageManager } from '../workflow-generator.js'
import type { CiSecretTarget } from '../ci-secrets.js'

// The migration's own interactive steps, plus a converge step that picks which
// platform to build first (both-platform migrations), plus the shared tail steps
// (build + CI/CD) the flow REUSES inline after `handoff-build` → 'build'.
export type AppflowOwnStep =
  | 'explain' // step 1: secure-auth explanation + support note
  | 'authenticating' // step 2: PKCE login (auto)
  | 'fetch-orgs' // step 3 (auto): list orgs, auto-select if one, else prompt
  | 'select-org' // step 3 (2+ orgs)
  | 'fetch-apps' // step 4 (auto): list apps, auto-select if one, else prompt
  | 'select-app' // step 4 (2+ apps)
  | 'fetch-signing' // step 5: list + download signing (auto)
  | 'select-ios-cert' // step 5 prompt (2+ iOS certs)
  | 'select-android-cert' // step 5 prompt (2+ android certs)
  | 'no-signing-submenu' // step 5 recovery submenu (per-platform or whole-migration)
  | 'fetch-distribution' // step 6: list + download distribution (auto)
  | 'select-ios-dist' // step 6 prompt (2+ iOS distribution credentials)
  | 'select-android-dist' // step 6 prompt (2+ android distribution credentials)
  | 'ios-dist-gapfill' // step 6: no iOS dist -> offer p8 generate/provide
  | 'android-dist-gapfill' // step 6: no Android dist -> offer SA generate/provide
  | 'ios-p8-generate' // step 6/8 (auto): drive the shared asc-key .p8 generate/provide, capture APPLE_KEY_* into ios
  | 'android-sa-generate' // step 6 (auto): drive the shared Google Play service-account flow, capture PLAY_CONFIG_JSON into android
  | 'validate' // step 7 (auto): run advisory checks, then show results
  | 'validate-results' // step 7 (info): surface the advisory results, never block
  | 'p8-upgrade-prompt' // step 8 (iOS only)
  | 'handoff-build' // converge: hand to the build/tail steps
  | 'build-platform-pick' // converge: which platform to build first (both migrated)
  | 'done'
  | 'error'

// The full step union the appflow driver renders: its own steps + the shared
// tail steps (saving-credentials … build-complete), echoed verbatim — same
// pattern the iOS engine uses to widen OnboardingStep with the tail ids.
export type AppflowStep = AppflowOwnStep | TailStep

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
  // step-5 signing-certificate selection (2+ certs): the chosen Appflow profile
  // `tag` the user picked. Stored so fetch-signing can download THAT cert on
  // re-entry instead of re-prompting (no livelock). Undefined = not yet chosen.
  iosCertTag?: string
  androidCertTag?: string
  // step-6 distribution-credential selection (2+ creds): the chosen Appflow
  // distribution credential id the user picked. Same anti-livelock contract.
  iosDistId?: string
  androidDistId?: string
  // step-6 gap-fill decisions (distribution / upload destination) per platform.
  // 'generate' = the user opted to set up an upload destination via the existing
  // p8 / service-account flow; 'skip' = finish without it. Undefined = not asked.
  iosDistGapfill?: 'generate' | 'skip'
  androidDistGapfill?: 'generate' | 'skip'
  // step-8 iOS app-specific-password -> .p8 API key upgrade decision.
  p8Upgrade?: 'convert' | 'skip'
  // Advisory notes accumulated by auto effects (e.g. a p8/SA generate that could
  // not complete here). Surfaced in validate-results so the feedback isn't lost
  // when the next auto effect overwrites the transient ctx.
  notes?: string[]
  completedSteps: AppflowStep[]

  // ── build hand-off + inline tail state ──────────────────────────────────────
  // handoff-build choice ('build' routes into the shared tail; 'skip' finishes).
  handoffChoice?: 'build' | 'skip'
  // The platform the tail is CURRENTLY building (set at build-platform-pick on a
  // both-platform migration, or auto-selected when only one platform migrated).
  buildPlatform?: 'ios' | 'android'
  // Platforms whose inline build/tail run has finished (so a both-platform
  // migration can offer the second platform after the first completes).
  builtPlatforms?: ('ios' | 'android')[]

  // ── tail-input fields (mirror OnboardingProgress's tail fields the shared tail
  // reads — TailEffectProgress). Recorded by applyTailInput as the user answers
  // the tail's CI/CD + build-script prompts. ────────────────────────────────────
  setupMode?: 'undecided' | 'with-workflow' | 'secrets-only' | 'declined'
  ciSecretTarget?: CiSecretTarget | null
  selectedPackageManager?: PackageManager | null
  buildScriptChoice?: BuildScriptChoice | null
  envExportTargetPath?: string
}

export type AppflowInput = { value?: string, field?: string, text?: string }
