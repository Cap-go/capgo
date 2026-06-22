// src/build/prescan/checks/ios-entitlements-checks.ts
//
// §2.C — Entitlements / capabilities checks. These compare the app's own
// entitlements file (ios/App/App/App.entitlements) against the mapped
// provisioning profiles' entitlements, plus pure format checks for
// associated-domains and app-groups. All readers are pure and never throw;
// findings surface only capability KEY names + declared identifiers (no
// credential material — see types.ts Finding doc).
import type { ProfileEntitlements } from '../../mobileprovision-parser'
import type { Finding, PrescanCheck, ScanContext } from '../types'
import { parseMobileprovisionDetailedFromBase64 } from '../../mobileprovision-parser'
import { entArray, entString, readAppEntitlements } from '../ios-entitlements'
import { parseProvisioningMap } from './ios-profiles'

const hasMap = (ctx: ScanContext): boolean => parseProvisioningMap(ctx).length > 0
const hasAppEntitlements = (ctx: ScanContext): boolean => readAppEntitlements(ctx.projectDir) !== null

/** Parse a mapped profile's entitlements; {} when the blob is not a valid profile. */
function profileEntitlementsOf(base64: string): ProfileEntitlements {
  try {
    return parseMobileprovisionDetailedFromBase64(base64).profileEntitlements
  }
  catch {
    return {}
  }
}

// Auto-managed keys the profile always carries / the build pipeline injects.
// aps-environment has its own check (entitlements-aps-environment-vs-mode).
const EXCLUDED_KEYS = new Set([
  'aps-environment',
  'get-task-allow',
  'application-identifier',
])
function isExcludedKey(key: string): boolean {
  return EXCLUDED_KEYS.has(key) || key.endsWith('.team-identifier')
}

// A profile array member that grants every requested member.
function isWildcardMember(member: string): boolean {
  return member === '*' || member === '$(AppIdentifierPrefix)*' || /^\$\(\w+\)\*$/.test(member)
}

/**
 * Top-level entitlement keys present in the app entitlements `<dict>`, each tagged
 * with the kind of its sibling value (array vs scalar). ONE-level scan: only the
 * outermost `<key>` elements before the first nested close are considered, which
 * matches the flat shape of real entitlement files.
 */
function appEntitlementKeys(raw: string): { key: string, isArray: boolean }[] {
  const out: { key: string, isArray: boolean }[] = []
  for (const m of raw.matchAll(/<key>([\s\S]*?)<\/key>\s*<(array|string|true|false|dict|integer|real|data|date)\b/g)) {
    const key = m[1].trim()
    out.push({ key, isArray: m[2] === 'array' })
  }
  return out
}

export const entitlementsVsProfileCapability: PrescanCheck = {
  id: 'ios/entitlements-vs-profile-capability',
  platforms: ['ios'],
  appliesTo: ctx => hasMap(ctx) && hasAppEntitlements(ctx),
  async run(ctx): Promise<Finding[]> {
    const app = readAppEntitlements(ctx.projectDir)
    if (!app)
      return []
    const appKeys = appEntitlementKeys(app.raw).filter(k => !isExcludedKey(k.key))
    if (appKeys.length === 0)
      return []

    const findings: Finding[] = []
    for (const { bundleId, base64 } of parseProvisioningMap(ctx)) {
      const profileEnt = profileEntitlementsOf(base64)
      for (const { key, isArray } of appKeys) {
        if (isArray) {
          const appMembers = entArray(app.raw, key)
          const profileValue = profileEnt[key]
          const profileMembers = Array.isArray(profileValue) ? profileValue : []
          if (profileMembers.some(isWildcardMember))
            continue
          const uncovered = appMembers.filter(member => !profileMembers.includes(member))
          if (uncovered.length > 0) {
            findings.push({
              id: 'ios/entitlements-vs-profile-capability',
              severity: 'error',
              title: `Entitlement "${key}" is not fully covered by the provisioning profile for "${bundleId}"`,
              detail: `uncovered ${key} value(s): ${uncovered.join(', ')}`,
              fix: 'Enable the capability for this App ID in the Apple Developer portal, regenerate the profile, and re-save credentials (or remove the unused entitlement)',
            })
          }
        }
        else if (!(key in profileEnt)) {
          findings.push({
            id: 'ios/entitlements-vs-profile-capability',
            severity: 'error',
            title: `Entitlement "${key}" is declared by the app but not granted by the provisioning profile for "${bundleId}"`,
            detail: `missing capability: ${key}`,
            fix: 'Enable the capability for this App ID in the Apple Developer portal, regenerate the profile, and re-save credentials (or remove the unused entitlement)',
          })
        }
      }
    }
    return findings
  },
}

export const apsEnvironmentVsMode: PrescanCheck = {
  id: 'ios/entitlements-aps-environment-vs-mode',
  platforms: ['ios'],
  appliesTo: (ctx) => {
    const app = readAppEntitlements(ctx.projectDir)
    return app !== null && entString(app.raw, 'aps-environment') !== null && Boolean(ctx.distributionMode)
  },
  async run(ctx): Promise<Finding[]> {
    const app = readAppEntitlements(ctx.projectDir)
    if (!app)
      return []
    const value = entString(app.raw, 'aps-environment')
    if (value === null)
      return []

    const findings: Finding[] = []
    if (ctx.distributionMode === 'app_store' && value === 'development') {
      findings.push({
        id: 'ios/entitlements-aps-environment-vs-mode',
        severity: 'error',
        title: 'aps-environment is "development" but the build distributes to the App Store / TestFlight',
        detail: 'App Store and TestFlight builds need a production push environment',
        fix: 'Set aps-environment=production in App.entitlements and use a production push profile',
      })
    }
    else if (ctx.distributionMode === 'ad_hoc' && value === 'production') {
      findings.push({
        id: 'ios/entitlements-aps-environment-vs-mode',
        severity: 'warning',
        title: 'aps-environment is "production" for an ad_hoc build',
        detail: 'ad_hoc builds usually use the development push environment (production is valid but uncommon)',
        fix: 'Use aps-environment=development for ad_hoc unless you intend production APNs',
      })
    }

    // When a provisioning map is present, the profile's aps-environment must agree
    // with the app's declared value.
    if (hasMap(ctx)) {
      for (const { bundleId, base64 } of parseProvisioningMap(ctx)) {
        const profileEnt = profileEntitlementsOf(base64)
        const profileValue = profileEnt['aps-environment']
        if (typeof profileValue === 'string' && profileValue !== value) {
          findings.push({
            id: 'ios/entitlements-aps-environment-vs-mode',
            severity: 'error',
            title: `aps-environment differs between App.entitlements and the provisioning profile for "${bundleId}"`,
            detail: `app: ${value} — profile: ${profileValue}`,
            fix: 'Align aps-environment in App.entitlements with the push profile (or regenerate the profile)',
          })
        }
      }
    }
    return findings
  },
}

// applinks/webcredentials/activitycontinuation/appclips:<domain>[?mode=developer|managed]
const ASSOCIATED_DOMAIN_RE = /^(?:applinks|webcredentials|activitycontinuation|appclips):[a-z0-9.-]+(?:\?mode=(?:developer|managed))?$/i
const ASSOCIATED_DOMAIN_KEY = 'com.apple.developer.associated-domains'

export const associatedDomainsFormat: PrescanCheck = {
  id: 'ios/entitlements-associated-domains-format',
  platforms: ['ios'],
  appliesTo: (ctx) => {
    const app = readAppEntitlements(ctx.projectDir)
    return app !== null && entArray(app.raw, ASSOCIATED_DOMAIN_KEY).length > 0
  },
  async run(ctx): Promise<Finding[]> {
    const app = readAppEntitlements(ctx.projectDir)
    if (!app)
      return []
    const bad: string[] = []
    for (const entry of entArray(app.raw, ASSOCIATED_DOMAIN_KEY)) {
      // The managed-wildcard form `service:*` (e.g. applinks:*) is valid.
      if (/^(?:applinks|webcredentials|activitycontinuation|appclips):\*$/i.test(entry))
        continue
      if (!ASSOCIATED_DOMAIN_RE.test(entry))
        bad.push(entry)
    }
    if (bad.length === 0)
      return []
    return [{
      id: 'ios/entitlements-associated-domains-format',
      severity: 'warning',
      title: `${bad.length} associated-domains entr(y/ies) have an invalid format`,
      detail: `invalid: ${bad.join(', ')}`,
      fix: 'Use the "service:domain" form (e.g. applinks:example.com) — no scheme, path, or trailing slash',
    }]
  },
}

const APP_GROUP_KEY = 'com.apple.security.application-groups'
// group.<reverse-dns>: lowercase letters, digits, dots, hyphens; no uppercase/whitespace.
const APP_GROUP_RE = /^group\.[a-z0-9.-]+$/

export const appGroupsFormat: PrescanCheck = {
  id: 'ios/entitlements-app-groups-format',
  platforms: ['ios'],
  appliesTo: (ctx) => {
    const app = readAppEntitlements(ctx.projectDir)
    return app !== null && entArray(app.raw, APP_GROUP_KEY).length > 0
  },
  async run(ctx): Promise<Finding[]> {
    const app = readAppEntitlements(ctx.projectDir)
    if (!app)
      return []
    const bad = entArray(app.raw, APP_GROUP_KEY).filter(g => !APP_GROUP_RE.test(g))
    if (bad.length === 0)
      return []
    return [{
      id: 'ios/entitlements-app-groups-format',
      severity: 'warning',
      title: `${bad.length} app group identifier(s) have an invalid format`,
      detail: `invalid: ${bad.join(', ')}`,
      fix: 'Name app groups "group.<reverse-dns>" (lowercase, no whitespace) and register them in the portal',
    }]
  },
}
