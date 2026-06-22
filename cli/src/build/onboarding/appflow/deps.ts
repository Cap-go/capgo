// Production wiring for the Appflow migration flow's effect dependencies.
//
// The flow itself (flow.ts) is pure/injectable: it asks for a token cache, a
// browser opener, a redacted logger, and four validators. This module builds
// the REAL deps by reusing the existing CLI building blocks:
//   - token cache  -> a JSON file under ~/.capgo-credentials/ (same dir as creds)
//   - log          -> appendInternalLog (the support-bundle internal log; redacted)
//   - openBrowser  -> node child_process spawn (same pattern as auth.ts default)
//   - validators   -> android service-account-validation.ts, android keystore.ts,
//                     ios validate-app-password.ts (all advisory, never throw)
//
// On flow completion the collected per-platform Capgo creds are persisted into
// the SAME credential store the native flows write (updateSavedCredentials), so
// downstream build/CI steps cannot tell migrated creds from natively-set-up ones.
import { Buffer } from 'node:buffer'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { appendInternalLog } from '../../../support/internal-log.js'
import { updateSavedCredentials } from '../../credentials.js'
import { validateServiceAccountJson as androidValidateServiceAccountJson } from '../android/service-account-validation.js'
import { tryUnlockPrivateKey as androidTryUnlockPrivateKey } from '../android/keystore.js'
import { validateAppleAppPassword as iosValidateAppleAppPassword } from '../ios/validate-app-password.js'
import type { AppflowEffectDeps } from './flow.js'
import type { AppflowProgress } from './types.js'
import type { AppflowToken } from './auth.js'

const CREDENTIALS_DIR = join(homedir(), '.capgo-credentials')
const APPFLOW_TOKEN_FILE = join(CREDENTIALS_DIR, 'appflow-token.json')

/** Load a cached Appflow token, or null when absent/unreadable. Never throws. */
export function loadAppflowToken(): AppflowToken | null {
  try {
    if (!existsSync(APPFLOW_TOKEN_FILE))
      return null
    const raw = readFileSync(APPFLOW_TOKEN_FILE, 'utf8')
    const parsed = JSON.parse(raw) as AppflowToken
    if (parsed && typeof parsed.access_token === 'string')
      return parsed
    return null
  }
  catch {
    return null
  }
}

/** Persist an Appflow token to the credentials dir (0700 dir / best-effort). Never throws. */
export function saveAppflowToken(token: AppflowToken): void {
  try {
    mkdirSync(CREDENTIALS_DIR, { recursive: true, mode: 0o700 })
    writeFileSync(APPFLOW_TOKEN_FILE, JSON.stringify(token), { encoding: 'utf8', mode: 0o600 })
  }
  catch {
    // Token caching is best-effort: a failure just means the next run re-auths.
  }
}

/** Best-effort browser open, mirroring auth.ts's defaultOpen (also printed by the caller). */
function openBrowser(url: string): void {
  const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open'
  const args = process.platform === 'win32' ? ['/c', 'start', '""', url] : [url]
  try {
    spawn(cmd, args, { stdio: 'ignore', detached: true }).unref()
  }
  catch {
    // best-effort; the URL is also surfaced by the flow
  }
}

/**
 * Adapter: the flow asks for `(json, packageName?) => { ok, reason? }`; the
 * existing validator takes `{ jsonBytes, packageName }` and returns a tagged
 * union. We pass the migrated service-account JSON (decoded) + the migrated
 * Play package name. Advisory only — any throw is caught and surfaced upstream.
 */
function makeValidateServiceAccountJson(packageName?: string): NonNullable<AppflowEffectDeps['validateServiceAccountJson']> {
  return async (json: string, pkg?: string) => {
    const effectivePkg = pkg ?? packageName
    if (!effectivePkg)
      return { ok: false, reason: 'no package name available to probe Play access' }
    const result = await androidValidateServiceAccountJson({ jsonBytes: Buffer.from(json, 'utf8'), packageName: effectivePkg })
    if (result.ok)
      return { ok: true }
    return { ok: false, reason: result.message }
  }
}

/**
 * Adapter: the flow asks for `(keystoreB64, storePass, alias) => boolean`; the
 * existing validator takes raw bytes + the store password and returns a tagged
 * union. The alias is informational (node-forge unlocks the whole PKCS#12 with
 * one password) — we treat a successful unlock as a pass. Never throws.
 */
function tryUnlockPrivateKey(keystoreB64: string, storePass: string, _alias: string): Promise<boolean> {
  try {
    const bytes = Buffer.from(keystoreB64, 'base64')
    return Promise.resolve(androidTryUnlockPrivateKey(bytes, storePass).ok)
  }
  catch {
    return Promise.resolve(false)
  }
}

/**
 * Adapter: confirm an imported iOS signing certificate (.p12) opens with its
 * password. A .p12 is a PKCS#12 container like an Android keystore, so the same
 * node-forge unlock applies. LOCAL only (no remote calls), advisory, never throws.
 */
function validateP12(p12B64: string, password: string): Promise<boolean> {
  try {
    const bytes = Buffer.from(p12B64, 'base64')
    return Promise.resolve(androidTryUnlockPrivateKey(bytes, password).ok)
  }
  catch {
    return Promise.resolve(false)
  }
}

/** Adapter: the flow asks for `(user, pw) => { valid, message? }`; reuse the iTMSTransporter probe. */
function validateAppleAppPassword(user: string, pw: string): Promise<{ valid: boolean, message?: string }> {
  return iosValidateAppleAppPassword(user, pw).then(r => ({ valid: r.valid, message: r.message }))
}

/**
 * Build the production AppflowEffectDeps for a given app id. The `packageName`
 * (the Play package, when known) sharpens the service-account probe; pass the
 * appId as a fallback. Token cache, browser, logger, and validators are all
 * wired here so the engine and the TUI share one source of truth.
 */
export function buildAppflowEffectDeps(opts: { appId?: string, packageName?: string } = {}): AppflowEffectDeps {
  return {
    appId: opts.appId,
    log: (s: string) => appendInternalLog(s),
    loadToken: loadAppflowToken,
    saveToken: saveAppflowToken,
    openBrowser,
    validateServiceAccountJson: makeValidateServiceAccountJson(opts.packageName ?? opts.appId),
    tryUnlockPrivateKey,
    validateAppleAppPassword,
    validateP12,
  }
}

/**
 * Persist the collected per-platform Capgo creds into the REAL credential store
 * (the same path the native flows use), so the build/validate/CI tail cannot
 * tell migrated creds from natively-set-up ones. Writes only the platforms that
 * actually collected creds. Returns the platforms written.
 */
export async function persistAppflowCredentials(appId: string, progress: AppflowProgress, local?: boolean): Promise<('ios' | 'android')[]> {
  const written: ('ios' | 'android')[] = []
  if (progress.ios && Object.keys(progress.ios).length > 0) {
    await updateSavedCredentials(appId, 'ios', progress.ios, local)
    written.push('ios')
  }
  if (progress.android && Object.keys(progress.android).length > 0) {
    await updateSavedCredentials(appId, 'android', progress.android, local)
    written.push('android')
  }
  return written
}
