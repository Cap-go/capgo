/**
 * Build-onboarding helper to write a single-platform .env file with the build
 * credentials the user just saved. Used on the "No to GitHub Actions setup, but
 * yes to .env export" branch of the wizard.
 *
 * Reuses the renderer from `build credentials manage` so the file format
 * (section comments, .gitignore reminder, provisioning-map base64 fallback)
 * stays identical between the two paths.
 */

import type { BuildCredentials } from '../../schemas/build.js'
import { chmodSync, existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { cwd } from 'node:process'
import { renderEnvFile } from '../env-render.js'

export interface EnvExportOpts {
  appId: string
  platform: 'ios' | 'android'
  credentials: Partial<BuildCredentials>
  /** Default false — onboarding writes into the global store, not local. */
  local?: boolean
  /** If absent, defaults to `<cwd>/.env.capgo.<appId>.<platform>`. */
  targetPath?: string
  /** When true, write even if the file already exists. */
  overwrite?: boolean
}

export type EnvExportResult
  = | { kind: 'written', path: string, fieldCount: number }
    | { kind: 'exists', path: string }
    | { kind: 'empty' }

/**
 * Resolve where the .env file should land for the given app + platform. Pure —
 * callable before deciding to actually write, so the wizard can show the path
 * in a confirm prompt without committing to write yet.
 */
export function defaultExportPath(appId: string, platform: 'ios' | 'android'): string {
  return join(cwd(), `.env.capgo.${appId}.${platform}`)
}

/**
 * Write the credentials to a .env file. Caller is responsible for deciding
 * whether the user has consented (no prompts in here — pure file I/O so the
 * Ink wizard owns the UX).
 *
 * Returns `kind: 'exists'` if the target file is already present and
 * `overwrite` was not set — caller can prompt the user and retry.
 */
export function exportCredentialsToEnv(opts: EnvExportOpts): EnvExportResult {
  const fieldCount = Object.values(opts.credentials).filter(v => typeof v === 'string' && v.length > 0).length
  if (fieldCount === 0)
    return { kind: 'empty' }

  const targetPath = opts.targetPath ?? defaultExportPath(opts.appId, opts.platform)

  if (existsSync(targetPath) && !opts.overwrite)
    return { kind: 'exists', path: targetPath }

  const content = renderEnvFile({
    appId: opts.appId,
    local: opts.local ?? false,
    platform: opts.platform,
    creds: opts.credentials,
  })

  // writeFileSync's mode option only applies when creating a new file — an
  // existing file keeps its old permission bits. chmod after the write so
  // overwrites tighten the bits down to 0600 (no group/world readable
  // credentials, ever).
  writeFileSync(targetPath, content, { mode: 0o600 })
  chmodSync(targetPath, 0o600)

  return { kind: 'written', path: targetPath, fieldCount }
}
