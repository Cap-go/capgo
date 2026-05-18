import type { BuildCredentials } from '../../schemas/build'
import type {
  CertRenewDecision,
  CertRenewReason,
  ProfileRenewDecision,
  ProfileRenewReason,
  RenewOptions,
  RenewPlan,
} from './types'
import { parseMobileprovisionFromBase64 } from '../mobileprovision-parser'
import { getCapgoProfileName } from './apple-api'
import { extractCertExpiry } from './csr'

const MS_PER_DAY = 24 * 60 * 60 * 1000

interface ProvisioningMapEntry {
  profile: string
  name: string
}

function parseProvisioningMap(raw: string | undefined): Record<string, ProvisioningMapEntry> {
  if (!raw)
    return {}
  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
      return parsed as Record<string, ProvisioningMapEntry>
    return {}
  }
  catch {
    return {}
  }
}

function tryExtractCertExpiry(p12Base64: string | undefined, password: string | undefined): Date | null {
  if (!p12Base64)
    return null
  try {
    return extractCertExpiry(p12Base64, password)
  }
  catch {
    return null
  }
}

function tryExtractProfileExpiry(base64: string): Date | null {
  try {
    return parseMobileprovisionFromBase64(base64).expirationDate
  }
  catch {
    return null
  }
}

function decideCert(expiry: Date | null, now: Date, options: RenewOptions): CertRenewDecision {
  if (options.force) {
    return { needsRenewal: true, currentExpiry: expiry, reason: 'forced' }
  }
  if (expiry === null) {
    // No cert at all, or cert is unparseable — needs renewal to recover.
    return { needsRenewal: true, currentExpiry: null, reason: 'expired' }
  }

  const reason = classifyExpiry(expiry, now, options.thresholdDays)
  return {
    needsRenewal: reason !== 'ok',
    currentExpiry: expiry,
    reason,
  }
}

function classifyExpiry(expiry: Date, now: Date, thresholdDays: number): CertRenewReason {
  const diffMs = expiry.getTime() - now.getTime()
  if (diffMs <= 0)
    return 'expired'
  if (diffMs <= thresholdDays * MS_PER_DAY)
    return 'expiring'
  return 'ok'
}

function decideProfile(
  bundleId: string,
  name: string,
  expiry: Date | null,
  isCapgoCreated: boolean,
  certNeedsRenewal: boolean,
  now: Date,
  options: RenewOptions,
): ProfileRenewDecision {
  // User-imported profiles are never auto-renewed.
  if (!isCapgoCreated) {
    return {
      bundleId,
      name,
      needsRenewal: false,
      currentExpiry: expiry,
      reason: 'skipped-non-capgo',
      isCapgoCreated: false,
    }
  }

  // Cert is being renewed → all Capgo-created profiles must be re-issued too.
  if (certNeedsRenewal) {
    return {
      bundleId,
      name,
      needsRenewal: true,
      currentExpiry: expiry,
      reason: 'cert-renewed',
      isCapgoCreated: true,
    }
  }

  if (options.force) {
    return {
      bundleId,
      name,
      needsRenewal: true,
      currentExpiry: expiry,
      reason: 'forced',
      isCapgoCreated: true,
    }
  }

  if (expiry === null) {
    // Unparseable profile — renew to recover.
    return {
      bundleId,
      name,
      needsRenewal: true,
      currentExpiry: null,
      reason: 'expired',
      isCapgoCreated: true,
    }
  }

  const reason = classifyExpiry(expiry, now, options.thresholdDays)
  const profileReason: ProfileRenewReason = reason === 'ok'
    ? 'ok'
    : reason
  return {
    bundleId,
    name,
    needsRenewal: reason !== 'ok',
    currentExpiry: expiry,
    reason: profileReason,
    isCapgoCreated: true,
  }
}

/**
 * Compute what needs to be renewed for an app's saved iOS credentials.
 *
 * Pure function (no I/O beyond reading the credentials object passed in).
 * The caller is responsible for loading saved credentials and supplying them.
 *
 * @param saved - The iOS section of saved credentials (Partial<BuildCredentials>).
 * @param appId - The Capacitor app ID. Used to detect which profiles were Capgo-created
 *                (name matches `Capgo ${appId} AppStore`).
 * @param options - Threshold for "expiring soon" and a force flag.
 * @param now - Override the current time. Defaults to new Date(). Exposed for testing.
 */
export function computeRenewPlan(
  saved: Partial<BuildCredentials>,
  appId: string,
  options: RenewOptions,
  now: Date = new Date(),
): RenewPlan {
  const certExpiry = tryExtractCertExpiry(saved.BUILD_CERTIFICATE_BASE64, saved.P12_PASSWORD)
  const certDecision = decideCert(certExpiry, now, options)

  const map = parseProvisioningMap(saved.CAPGO_IOS_PROVISIONING_MAP)
  const capgoName = getCapgoProfileName(appId)

  const profiles: ProfileRenewDecision[] = []
  for (const [bundleId, entry] of Object.entries(map)) {
    const isCapgoCreated = entry.name === capgoName
    const expiry = tryExtractProfileExpiry(entry.profile)
    profiles.push(
      decideProfile(bundleId, entry.name, expiry, isCapgoCreated, certDecision.needsRenewal, now, options),
    )
  }

  // Stable order: main app first (matches appId), then alphabetical bundle ID.
  profiles.sort((a, b) => {
    if (a.bundleId === appId && b.bundleId !== appId)
      return -1
    if (b.bundleId === appId && a.bundleId !== appId)
      return 1
    return a.bundleId.localeCompare(b.bundleId)
  })

  const hasAnythingToRenew = certDecision.needsRenewal || profiles.some(p => p.needsRenewal)

  return {
    appId,
    cert: certDecision,
    profiles,
    hasAnythingToRenew,
  }
}

/**
 * Has the saved credentials object got the legacy `BUILD_PROVISION_PROFILE_BASE64`
 * field but no `CAPGO_IOS_PROVISIONING_MAP`? The renew flow refuses on this and
 * points the user at `build credentials migrate`.
 */
export function isLegacyProfileFormat(saved: Partial<BuildCredentials>): boolean {
  return !!saved.BUILD_PROVISION_PROFILE_BASE64 && !saved.CAPGO_IOS_PROVISIONING_MAP
}

/**
 * Does the saved credentials object contain any iOS material at all?
 * Used by the renew flow to decide whether to short-circuit to `renew-no-credentials`.
 */
export function hasAnyIosCredentials(saved: Partial<BuildCredentials> | undefined | null): boolean {
  if (!saved)
    return false
  return !!(
    saved.BUILD_CERTIFICATE_BASE64
    || saved.CAPGO_IOS_PROVISIONING_MAP
    || saved.BUILD_PROVISION_PROFILE_BASE64
    || saved.APPLE_KEY_CONTENT
    || saved.APPLE_KEY_ID
  )
}
