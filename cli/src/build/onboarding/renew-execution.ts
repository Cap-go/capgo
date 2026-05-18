import type { BuildCredentials } from '../../schemas/build'
import type { RenewPlan } from './types'
import { listDistributionCerts } from './apple-api'
import { extractCertSerial } from './csr'

interface ProvisioningMapEntry {
  profile: string
  name: string
}

export interface RevokeCandidate {
  certId: string
  serialNumber: string
  name: string
  expirationDate: string
}

/**
 * Find the Apple-side cert that matches the saved P12's serial number, so the
 * renew flow can revoke it before creating a new cert (frees a slot, avoiding
 * the cert-limit-prompt in the common case).
 *
 * Returns null if no match is found — either the saved P12 was already revoked,
 * the cert was created by a tool that doesn't show up in this list, or the
 * saved P12 itself can't be parsed. Callers should treat null as "skip the
 * proactive revoke, fall through to the regular create-cert flow."
 */
export async function findRevokeCandidate(
  token: string,
  savedP12Base64: string | undefined,
  p12Password: string | undefined,
): Promise<RevokeCandidate | null> {
  if (!savedP12Base64)
    return null

  let savedSerial: string
  try {
    savedSerial = extractCertSerial(savedP12Base64, p12Password)
  }
  catch {
    return null
  }
  if (!savedSerial)
    return null

  const certs = await listDistributionCerts(token)
  for (const cert of certs) {
    if ((cert.serialNumber || '').toUpperCase() === savedSerial) {
      return {
        certId: cert.id,
        serialNumber: cert.serialNumber,
        name: cert.name,
        expirationDate: cert.expirationDate,
      }
    }
  }
  return null
}

/**
 * Build the updated provisioning map for `updateSavedCredentials` by merging
 * newly-issued profiles into the existing map.
 *
 * - `existingMap` is the JSON-parsed `CAPGO_IOS_PROVISIONING_MAP` from saved creds.
 * - `renewedProfiles` is keyed by bundleId; each value is the new base64 profile
 *   content and the (server-assigned) profile name.
 * - Entries in `existingMap` that aren't in `renewedProfiles` are carried forward
 *   unchanged (this preserves user-imported profiles for extension targets).
 */
export function assembleProvisioningMap(
  existingMap: Record<string, ProvisioningMapEntry>,
  renewedProfiles: Record<string, { profileContent: string, profileName: string }>,
): Record<string, ProvisioningMapEntry> {
  const merged: Record<string, ProvisioningMapEntry> = { ...existingMap }
  for (const [bundleId, renewed] of Object.entries(renewedProfiles)) {
    merged[bundleId] = {
      profile: renewed.profileContent,
      name: renewed.profileName,
    }
  }
  return merged
}

/**
 * Assemble the `Partial<BuildCredentials>` payload to hand to
 * `updateSavedCredentials` after the renew flow has finished.
 *
 * - If a new cert was created, sets `BUILD_CERTIFICATE_BASE64` to its base64
 *   P12 content. Otherwise leaves the existing value untouched.
 * - Always sets `CAPGO_IOS_PROVISIONING_MAP` to the merged map JSON. (Even when
 *   no profiles were renewed, writing the same value is a no-op.)
 */
export function assembleRenewedCredentials(args: {
  newP12Base64?: string
  mergedProvisioningMap: Record<string, ProvisioningMapEntry>
}): Partial<BuildCredentials> {
  const update: Partial<BuildCredentials> = {
    CAPGO_IOS_PROVISIONING_MAP: JSON.stringify(args.mergedProvisioningMap),
  }
  if (args.newP12Base64)
    update.BUILD_CERTIFICATE_BASE64 = args.newP12Base64
  return update
}

/**
 * The bundleIds the renew flow needs to (re)create profiles for, in stable order.
 * Excludes user-imported profiles (`reason: 'skipped-non-capgo'`).
 */
export function bundleIdsToRenew(plan: RenewPlan): string[] {
  return plan.profiles.filter(p => p.needsRenewal).map(p => p.bundleId)
}
