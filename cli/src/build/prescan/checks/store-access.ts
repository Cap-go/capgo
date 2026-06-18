// src/build/prescan/checks/store-access.ts
//
// Group C - remote store-access checks. They reach Google Play / App Store
// Connect to confirm the upload credentials actually have access to the target
// app BEFORE the build runs (fastlane's exact auth paths), turning a slow
// upload-time failure into a fast prescan error.
//
// They are NOT marked `remote: true`: the engine's remote-skip predicate keys
// off `ctx.supabase` (Capgo's backend), which is the wrong signal here. Instead
// they gate on intent-to-upload via `appliesTo` (willUploadToPlay /
// willUploadToAppStore) and self-classify offline/transport failures as `info`
// so an offline scan degrades to non-blocking notices.
//
// SECRET-HANDLING (mandatory): PLAY_CONFIG_JSON / APPLE_KEY_CONTENT /
// APPLE_KEY_ID / APPLE_ISSUER_ID raw values NEVER appear in Finding
// title/detail/fix. The injected validators only surface safe copy (SA email,
// package name, Apple's human-readable error wording); for token-error we keep
// the finding terse and do not echo the validator message verbatim.
import type { ValidateOptions, ValidationResult } from '../../onboarding/android/service-account-validation.js'
import type { AscAccessResult, AssertAscAccessOptions } from '../../onboarding/apple-access.js'
import type { Finding, PrescanCheck, ScanContext } from '../types'
import { Buffer } from 'node:buffer'
import forge from 'node-forge'
import { validateServiceAccountJson } from '../../onboarding/android/service-account-validation.js'
import { assertAscAccess } from '../../onboarding/apple-access.js'
import { gradleApplicationId } from '../gradle'
import { willUploadToAppStore, willUploadToPlay } from '../upload-intent'

/** 7s per-request budget so the fetch aborts cleanly before the engine's 10s race. */
const STORE_ACCESS_TIMEOUT_MS = 7000

const PLAY_FIX = 'Invite the service-account email in Play Console -> Users and permissions, then grant it release access for this app.'
const ASC_FIX = 'App Store Connect rejected the API key - check the Key ID / Issuer ID / .p8 and that the key has Admin or Developer access (or sign the pending agreement).'

/** Injectable validator type so tests can supply a fake without any network. */
type PlayValidator = (opts: ValidateOptions) => Promise<ValidationResult>
type AscAsserter = (opts: AssertAscAccessOptions) => Promise<AscAccessResult>

/**
 * Build a 7s AbortController that fires the abort itself (the engine's race
 * resolves a timeout Finding but does not cancel in-flight fetches). The caller
 * must clear the returned timer in a finally block.
 */
function abortAfter(ms: number): { signal: AbortSignal, clear: () => void } {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  return { signal: controller.signal, clear: () => clearTimeout(timer) }
}

/**
 * android/play-sa-access factory. Accepts the (injectable) service-account
 * validator so the check is fully hermetic under test.
 */
export function makePlaySaAccess(validator: PlayValidator): PrescanCheck {
  return {
    id: 'android/play-sa-access',
    platforms: ['android'],
    appliesTo: ctx => willUploadToPlay(ctx),
    async run(ctx: ScanContext): Promise<Finding[]> {
      const raw = ctx.credentials?.PLAY_CONFIG_JSON
      if (!raw)
        return []
      const packageName = gradleApplicationId(ctx.projectDir) ?? ctx.config?.appId ?? ctx.appId
      const jsonBytes = Buffer.from(raw, 'base64')

      const { signal, clear } = abortAfter(STORE_ACCESS_TIMEOUT_MS)
      let result: ValidationResult
      try {
        result = await validator({
          jsonBytes,
          packageName,
          signal,
          timeoutMs: STORE_ACCESS_TIMEOUT_MS,
        })
      }
      finally {
        clear()
      }

      if (result.ok)
        return []

      switch (result.kind) {
        case 'no-app-access':
          // result.message names the SA email + package - both safe to print.
          return [{
            id: 'android/play-sa-access',
            severity: 'error',
            title: 'The Play service account cannot access this app',
            detail: result.message,
            fix: PLAY_FIX,
          }]
        case 'token-error':
          // Terse: do NOT echo the validator message verbatim (auth diagnostics).
          return [{
            id: 'android/play-sa-access',
            severity: 'error',
            title: 'Google rejected the Play service-account key',
            detail: 'The service-account JSON failed to authenticate with Google. Re-download a fresh key from the Google Cloud console.',
            fix: PLAY_FIX,
          }]
        case 'network-error':
          // Offline / transport / abort / timeout -> non-blocking notice.
          return [{
            id: 'android/play-sa-access',
            severity: 'info',
            title: 'Could not verify Play service-account access (network error or timeout)',
            detail: 'The build will still attempt the upload; this check is best-effort and skipped offline.',
          }]
        case 'shape-error':
          // The local android/play-sa-json check owns shape diagnostics; surface
          // a quiet info here at most so we never double-report as an error.
          return [{
            id: 'android/play-sa-access',
            severity: 'info',
            title: 'Skipped Play access check (service-account JSON shape problem)',
            detail: 'See the android/play-sa-json finding for the shape error.',
          }]
        default:
          return []
      }
    },
  }
}

/**
 * ios/asc-key-access factory. Accepts the (injectable) App Store Connect access
 * asserter so the check is fully hermetic under test.
 */
export function makeAscKeyAccess(asserter: AscAsserter): PrescanCheck {
  return {
    id: 'ios/asc-key-access',
    platforms: ['ios'],
    appliesTo: ctx => willUploadToAppStore(ctx),
    async run(ctx: ScanContext): Promise<Finding[]> {
      const { APPLE_KEY_ID, APPLE_ISSUER_ID, APPLE_KEY_CONTENT } = ctx.credentials ?? {}
      if (!APPLE_KEY_ID || !APPLE_ISSUER_ID || !APPLE_KEY_CONTENT)
        return []

      // Decode the base64 .p8 -> PEM. A non-PEM value is the local
      // ios/asc-key-valid check's job to flag; here we just skip cleanly so we
      // do not fire a confusing access error on top of it.
      let p8Pem = ''
      try {
        p8Pem = forge.util.decode64(APPLE_KEY_CONTENT)
      }
      catch {
        return []
      }
      if (!p8Pem.includes('-----BEGIN PRIVATE KEY-----'))
        return []

      const bundleId = await pbxprojBundleId(ctx)

      const { signal, clear } = abortAfter(STORE_ACCESS_TIMEOUT_MS)
      let result: AscAccessResult
      try {
        result = await asserter({
          keyId: APPLE_KEY_ID,
          issuerId: APPLE_ISSUER_ID,
          p8Pem,
          bundleId,
          signal,
          timeoutMs: STORE_ACCESS_TIMEOUT_MS,
        })
      }
      finally {
        clear()
      }

      if (result.ok)
        return []

      switch (result.kind) {
        case 'auth-error':
          // 401/403 incl. the agreements branch. The helper's message reuses
          // verifyApiKey's copy (no credential material).
          return [{
            id: 'ios/asc-key-access',
            severity: 'error',
            title: 'App Store Connect rejected the API key',
            detail: result.message,
            fix: ASC_FIX,
          }]
        case 'no-app-access':
          // 2xx but the project bundle id is absent from /apps -> warning.
          return [{
            id: 'ios/asc-key-access',
            severity: 'warning',
            title: 'The App Store Connect API key cannot see this app',
            detail: result.message,
            fix: 'Confirm the app exists in App Store Connect and the API key role can access it, or fix the bundle identifier.',
          }]
        case 'network':
          return [{
            id: 'ios/asc-key-access',
            severity: 'info',
            title: 'Could not verify App Store Connect access (network error or timeout)',
            detail: 'The build will still attempt the upload; this check is best-effort and skipped offline.',
          }]
        default:
          return []
      }
    },
  }
}

/** Resolve the project's iOS bundle id from the pbxproj signable targets. */
async function pbxprojBundleId(ctx: ScanContext): Promise<string | undefined> {
  try {
    const { findSignableTargets, readPbxproj } = await import('../../pbxproj-parser')
    const pbx = readPbxproj(ctx.projectDir)
    if (!pbx)
      return ctx.config?.appId ?? ctx.appId
    const targets = findSignableTargets(pbx)
    const expected = ctx.config?.appId ?? ctx.appId
    // Prefer a target matching the Capacitor appId; else the first signable one.
    const match = targets.find(t => t.bundleId === expected) ?? targets[0]
    return match?.bundleId ?? expected
  }
  catch {
    return ctx.config?.appId ?? ctx.appId
  }
}

/** Wired checks (real validators) appended to the registry. */
export const playSaAccess: PrescanCheck = makePlaySaAccess(validateServiceAccountJson)
export const ascKeyAccess: PrescanCheck = makeAscKeyAccess(assertAscAccess)
