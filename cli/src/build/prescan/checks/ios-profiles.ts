// src/build/prescan/checks/ios-profiles.ts
import type { MobileprovisionDetail } from '../../mobileprovision-parser'
import type { Finding, PrescanCheck, ScanContext } from '../types'
import { parseMobileprovisionDetailedFromBase64 } from '../../mobileprovision-parser'
import { openP12 } from './ios-certs'

/**
 * One entry of CAPGO_IOS_PROVISIONING_MAP. The serialized shape (produced by
 * buildProvisioningMap in src/build/credentials-command.ts) is
 * `{ [bundleId]: { profile: base64, name: string } }` — keyed by the bundle id
 * the profile is assigned to cover.
 */
export interface MappedProfile {
  /** bundle id this profile is assigned to cover */
  bundleId: string
  /** base64-encoded .mobileprovision content */
  base64: string
  /** profile display name extracted at save time */
  name?: string
}

export function parseProvisioningMap(ctx: ScanContext): MappedProfile[] {
  const raw = ctx.credentials?.CAPGO_IOS_PROVISIONING_MAP
  if (!raw)
    return []
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>
    if (!obj || typeof obj !== 'object' || Array.isArray(obj))
      return []
    const entries: MappedProfile[] = []
    for (const [bundleId, value] of Object.entries(obj)) {
      if (typeof value === 'string') {
        // tolerated legacy/raw shape: { bundleId: base64 }
        entries.push({ bundleId, base64: value })
      }
      else if (value && typeof value === 'object' && typeof (value as { profile?: unknown }).profile === 'string') {
        const entry = value as { profile: string, name?: string }
        entries.push({ bundleId, base64: entry.profile, name: entry.name })
      }
    }
    return entries
  }
  catch {
    return []
  }
}

/** Parse a profile's embedded plist; null when the blob is not a valid mobileprovision. */
function tryParseDetail(base64: string): MobileprovisionDetail | null {
  try {
    return parseMobileprovisionDetailedFromBase64(base64)
  }
  catch {
    return null
  }
}

const THIRTY_DAYS_MS = 30 * 86_400_000
const hasMap = (ctx: ScanContext) => parseProvisioningMap(ctx).length > 0

export const profileExpiry: PrescanCheck = {
  id: 'ios/profile-expiry',
  platforms: ['ios'],
  appliesTo: hasMap,
  async run(ctx): Promise<Finding[]> {
    const findings: Finding[] = []
    for (const { bundleId, base64 } of parseProvisioningMap(ctx)) {
      const detail = tryParseDetail(base64)
      if (!detail?.expirationDate)
        continue
      const left = new Date(detail.expirationDate).getTime() - Date.now()
      if (left <= 0) {
        findings.push({
          id: 'ios/profile-expiry',
          severity: 'error',
          title: `Provisioning profile for "${bundleId}" expired on ${detail.expirationDate.slice(0, 10)}`,
          fix: 'Regenerate the profile in the Apple Developer portal and re-save credentials',
        })
      }
      else if (left < THIRTY_DAYS_MS) {
        findings.push({
          id: 'ios/profile-expiry',
          severity: 'warning',
          title: `Provisioning profile for "${bundleId}" expires in ${Math.ceil(left / 86_400_000)} day(s)`,
        })
      }
    }
    return findings
  },
}

function bundleMatches(profileBundleId: string, appBundleId: string): boolean {
  if (profileBundleId === '*')
    return true
  if (profileBundleId.endsWith('.*'))
    return appBundleId.startsWith(profileBundleId.slice(0, -1))
  return profileBundleId === appBundleId
}

export const profileBundleMatch: PrescanCheck = {
  id: 'ios/profile-bundle-match',
  platforms: ['ios'],
  appliesTo: hasMap,
  async run(ctx): Promise<Finding[]> {
    const findings: Finding[] = []
    for (const { bundleId, base64 } of parseProvisioningMap(ctx)) {
      const info = tryParseDetail(base64)
      if (info?.bundleId && !bundleMatches(info.bundleId, bundleId)) {
        findings.push({
          id: 'ios/profile-bundle-match',
          severity: 'error',
          title: `Provisioning profile mapped to "${bundleId}" is for a different bundle id`,
          detail: `profile: ${info.bundleId} — assigned to: ${bundleId}`,
          fix: 'Use a profile generated for this bundle id (or a wildcard profile)',
        })
      }
    }
    return findings
  },
}

export const profileTypeVsMode: PrescanCheck = {
  id: 'ios/profile-type-vs-mode',
  platforms: ['ios'],
  appliesTo: ctx => hasMap(ctx) && Boolean(ctx.distributionMode),
  async run(ctx): Promise<Finding[]> {
    const findings: Finding[] = []
    for (const { bundleId, base64 } of parseProvisioningMap(ctx)) {
      const detail = tryParseDetail(base64)
      if (!detail || detail.profileType === 'unknown')
        continue
      if (detail.profileType !== ctx.distributionMode) {
        findings.push({
          id: 'ios/profile-type-vs-mode',
          severity: 'error',
          title: `Profile for "${bundleId}" is ${detail.profileType} but the build requests ${ctx.distributionMode}`,
          fix: ctx.distributionMode === 'app_store'
            ? 'Generate an App Store distribution profile, or build with --ios-distribution ad_hoc'
            : 'Generate an Ad Hoc profile, or switch --ios-distribution',
        })
      }
    }
    return findings
  },
}

export const certProfilePairing: PrescanCheck = {
  id: 'ios/cert-profile-pairing',
  platforms: ['ios'],
  appliesTo: ctx => hasMap(ctx) && Boolean(ctx.credentials?.BUILD_CERTIFICATE_BASE64),
  async run(ctx): Promise<Finding[]> {
    let sha1: string
    try {
      sha1 = openP12(ctx.credentials!.BUILD_CERTIFICATE_BASE64, ctx.credentials!.P12_PASSWORD ?? '').sha1
    }
    catch {
      return [] // ios/p12-opens owns that failure
    }
    const findings: Finding[] = []
    for (const { bundleId, base64 } of parseProvisioningMap(ctx)) {
      const detail = tryParseDetail(base64)
      if (!detail || detail.certificateSha1s.length === 0)
        continue
      if (!detail.certificateSha1s.includes(sha1)) {
        findings.push({
          id: 'ios/cert-profile-pairing',
          severity: 'error',
          title: `Your signing certificate is not included in the provisioning profile for "${bundleId}"`,
          detail: `cert sha1 ${sha1} not in [${detail.certificateSha1s.join(', ')}]`,
          fix: 'Regenerate the profile selecting this distribution certificate, then re-save credentials',
        })
      }
    }
    return findings
  },
}

export const targetsCovered: PrescanCheck = {
  id: 'ios/targets-covered',
  platforms: ['ios'],
  appliesTo: hasMap,
  async run(ctx): Promise<Finding[]> {
    const { findSignableTargets, readPbxproj } = await import('../../pbxproj-parser')
    const pbx = readPbxproj(ctx.projectDir)
    if (!pbx)
      return []
    const targets = findSignableTargets(pbx)
    const mapped = parseProvisioningMap(ctx)
    // targets without a resolvable bundle id cannot be matched — skip them rather than false-error
    const missing = targets.filter(t => t.bundleId && !mapped.some(p => bundleMatches(p.bundleId, t.bundleId)))
    if (missing.length === 0)
      return []
    return [{
      id: 'ios/targets-covered',
      severity: 'error',
      title: `${missing.length} signable target(s) have no provisioning profile mapped`,
      detail: `uncovered: ${missing.map(t => `${t.name} (${t.bundleId})`).join(', ')}`,
      fix: 'Add --ios-provisioning-profile "bundleId=/path/to/profile.mobileprovision" for each and re-save credentials',
    }]
  },
}
