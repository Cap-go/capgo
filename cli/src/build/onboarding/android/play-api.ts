// src/build/onboarding/android/play-api.ts
//
// Google Play Developer API wrappers — the subset we need for onboarding:
//   - List the developer accounts the signed-in user has access to.
//   - Invite a service account as a user with Release permissions.
//
// All calls authenticate with an OAuth access token that has the
// `androidpublisher` scope. The caller must be an Admin on the target
// developer account; otherwise Users.create returns 403.

import { appendInternalLog, safeHeaders } from '../../../support/internal-log.js'

const ANDROIDPUBLISHER_BASE = 'https://androidpublisher.googleapis.com/androidpublisher/v3'

/**
 * The Play Developer API v3 has no public endpoint to enumerate the developer
 * accounts a user can access. The caller must supply a developer account ID —
 * the 16–20-digit number visible in the Play Console URL
 * (`play.google.com/console/u/0/developers/{developerId}/...`).
 */
export const PLAY_DEVELOPERS_URL = 'https://play.google.com/console/u/0/developers/'

/** 10–25 digit numeric Play Console developer ID. */
export function isLikelyDeveloperId(value: string): boolean {
  return /^\d{10,25}$/.test(value.trim())
}

/**
 * Normalize whatever the user pasted into a numeric developer ID.
 *
 * Accepts:
 *  - Raw numeric ID:           `1234567890123456789`
 *  - Full Play Console URL:    `https://play.google.com/console/u/0/developers/1234567890123456789/api-access`
 *  - URL without account prefix: `https://play.google.com/console/developers/1234567890123456789`
 *  - URLs wrapped in quotes or with surrounding whitespace
 *
 * Returns the extracted ID or null if nothing usable was found.
 */
export function extractDeveloperId(input: string): string | null {
  const trimmed = input.trim().replace(/^['"]|['"]$/g, '')
  if (!trimmed)
    return null

  // Fast path: raw ID.
  if (isLikelyDeveloperId(trimmed))
    return trimmed

  // URL path: look for `/developers/<digits>`.
  const pathMatch = trimmed.match(/\/developers\/(\d{10,25})(?:[/?#]|$)/)
  if (pathMatch && isLikelyDeveloperId(pathMatch[1]))
    return pathMatch[1]

  // Fallback: any long digit run in the string. Covers weird paste formats.
  const loose = trimmed.match(/\d{10,25}/)
  if (loose && isLikelyDeveloperId(loose[0]))
    return loose[0]

  return null
}

export interface PlayInvitedUser {
  name: string
  email: string
  accessState?: string
  developerAccountPermissions?: string[]
}

/**
 * Permissions granted to the Capgo service account.
 *
 * Play Developer API v3 splits permissions into two enums:
 *  - `DeveloperLevelPermission` — account-wide, all values end in `_GLOBAL`
 *  - `AppLevelPermission` — per-package, granted via `User.grants[]`
 *
 * References (authoritative — fetched 2026-04):
 *  - https://developers.google.com/android-publisher/api-ref/rest/v3/users
 *  - https://developers.google.com/android-publisher/api-ref/rest/v3/grants
 *
 * We grant the minimum needed for fastlane's `supply` to upload an AAB and
 * roll out a release on the app the user is onboarding.
 */

/**
 * Developer-account-level permission. `CAN_MANAGE_DRAFT_APPS_GLOBAL` lets the
 * SA see draft apps on this developer account — kept minimal so we don't ask
 * for financial data or order management access.
 */
export const CAPGO_SA_DEVELOPER_PERMISSIONS = [
  'CAN_MANAGE_DRAFT_APPS_GLOBAL',
] as const

/**
 * App-level permissions granted via `User.grants[].appLevelPermissions[]`.
 *
 *  - `CAN_ACCESS_APP`         — baseline read access to the app
 *  - `CAN_MANAGE_DRAFT_APPS`  — edit the app's draft state
 *  - `CAN_MANAGE_TRACK_APKS`  — upload APKs/AABs to testing tracks
 *                               (internal / alpha / beta)
 *  - `CAN_MANAGE_PUBLIC_APKS` — upload APKs/AABs to the production track
 *                               and create/roll out production releases
 */
export const CAPGO_SA_APP_PERMISSIONS = [
  'CAN_ACCESS_APP',
  'CAN_MANAGE_DRAFT_APPS',
  'CAN_MANAGE_TRACK_APKS',
  'CAN_MANAGE_PUBLIC_APKS',
] as const

async function playFetch<T>(args: {
  method: 'GET' | 'POST'
  url: string
  accessToken: string
  body?: unknown
}): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${args.accessToken}`,
    Accept: 'application/json',
  }
  if (args.body !== undefined)
    headers['Content-Type'] = 'application/json'
  const res = await fetch(args.url, {
    method: args.method,
    headers,
    body: args.body !== undefined ? JSON.stringify(args.body) : undefined,
  })
  const text = await res.text()
  if (!res.ok) {
    let detail: string = text
    try {
      const parsed = JSON.parse(text) as { error?: { message?: string, status?: string } }
      if (parsed.error?.message)
        detail = `${parsed.error.status ?? ''}${parsed.error.status && parsed.error.message ? ': ' : ''}${parsed.error.message}`
    }
    catch {}
    // Capture the raw Google Play Developer API error in the internal support
    // log (secret-redacted on write) so non-build failures are diagnosable.
    appendInternalLog(`play-api ${args.method} ${args.url}: HTTP ${res.status} ${detail} | ${safeHeaders(res.headers)}`)
    throw new Error(`Play API ${res.status} at ${args.url}: ${detail}`)
  }
  // Log successful calls too — the bundle gets the full Play Developer call trace.
  appendInternalLog(`play-api ${args.method} ${args.url}: HTTP ${res.status} | ${safeHeaders(res.headers)}`)
  if (!text.trim())
    return undefined as unknown as T
  try {
    return JSON.parse(text) as T
  }
  catch {
    throw new Error(`Play API returned non-JSON at ${args.url}: ${text.slice(0, 200)}`)
  }
}

/**
 * Invite a service account into a Play Console developer account.
 *
 * The signed-in OAuth user MUST be an Admin on the developer account — Play
 * returns 403 otherwise.
 *
 * Body shape follows the `User` resource:
 * {
 *   email: "...",
 *   developerAccountPermissions: [ <DeveloperLevelPermission> ],
 *   grants: [
 *     { packageName: "com.example.app", permissions: [ <AppLevelPermission> ] }
 *   ]
 * }
 *
 * `developerAccountPermissions` is optional but we always send at least one
 * value so the SA shows up in the Play Console Users & permissions list.
 */
export async function inviteServiceAccount(args: {
  accessToken: string
  developerId: string
  serviceAccountEmail: string
  /** DeveloperLevelPermission values — see CAPGO_SA_DEVELOPER_PERMISSIONS. */
  developerAccountPermissions?: readonly string[]
  /**
   * Per-package grants. Each grant pins AppLevelPermission values to a
   * specific `packageName`. The Capacitor app ID is usually the only entry.
   */
  grants?: ReadonlyArray<{
    packageName: string
    permissions: readonly string[]
  }>
}): Promise<PlayInvitedUser> {
  const body: Record<string, unknown> = {
    email: args.serviceAccountEmail,
  }
  if (args.developerAccountPermissions?.length)
    body.developerAccountPermissions = args.developerAccountPermissions
  if (args.grants?.length) {
    // Grant resource uses `appLevelPermissions`, NOT `permissions`.
    // Ref: https://developers.google.com/android-publisher/api-ref/rest/v3/grants
    body.grants = args.grants.map(g => ({
      packageName: g.packageName,
      appLevelPermissions: g.permissions,
    }))
  }
  return playFetch<PlayInvitedUser>({
    method: 'POST',
    url: `${ANDROIDPUBLISHER_BASE}/developers/${encodeURIComponent(args.developerId)}/users`,
    accessToken: args.accessToken,
    body,
  })
}
