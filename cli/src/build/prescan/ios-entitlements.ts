// src/build/prescan/ios-entitlements.ts
//
// Reader for the app's own entitlements file. The profile-side entitlements are
// parsed by mobileprovision-parser (MobileprovisionDetail.profileEntitlements);
// the entitlement checks compare the two. All readers are pure and never throw.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { plistArrayStrings, plistBool, plistString } from './checks/ios-plist-read'

/**
 * Read the app entitlements plist at the Capacitor-convention path
 * `ios/App/App/App.entitlements`. Returns `{ raw }` or null when the file is
 * absent (or unreadable). Future enhancement: resolve the path via the pbxproj
 * CODE_SIGN_ENTITLEMENTS setting; the default path is reliable for Capacitor.
 */
export function readAppEntitlements(projectDir: string): { raw: string } | null {
  const path = join(projectDir, 'ios', 'App', 'App', 'App.entitlements')
  if (!existsSync(path))
    return null
  try {
    return { raw: readFileSync(path, 'utf8') }
  }
  catch {
    return null
  }
}

/** String entitlement value (e.g. aps-environment), or null when absent. */
export function entString(raw: string, key: string): string | null {
  return plistString(raw, key)
}

/** Array entitlement members (e.g. application-groups), or [] when absent. */
export function entArray(raw: string, key: string): string[] {
  return plistArrayStrings(raw, key)
}

/** Boolean entitlement (e.g. get-task-allow), or null when absent. */
export function entBool(raw: string, key: string): boolean | null {
  return plistBool(raw, key)
}
