// src/build/onboarding/apple-api.ts
import jwt from 'jsonwebtoken'
import { extractTeamIdFromCert } from './csr.js'

const ASC_BASE_URL = 'https://api.appstoreconnect.apple.com/v1'

// ─── JWT ───────────────────────────────────────────────────────────

/**
 * Generate a JWT for App Store Connect API authentication.
 * Uses ES256 algorithm with the .p8 private key.
 */
export function generateJwt(
  keyId: string,
  issuerId: string,
  p8Content: string,
): string {
  const now = Math.floor(Date.now() / 1000)
  return jwt.sign(
    {
      iss: issuerId,
      exp: now + 1199, // ~20 minutes
      aud: 'appstoreconnect-v1',
    },
    p8Content,
    {
      algorithm: 'ES256',
      header: { alg: 'ES256', kid: keyId, typ: 'JWT' },
    },
  )
}

// ─── Helpers ───────────────────────────────────────────────────────

interface AppleApiError {
  status: string
  code: string
  title: string
  detail: string
}

async function ascFetch(
  path: string,
  token: string,
  options: RequestInit = {},
): Promise<any> {
  const url = `${ASC_BASE_URL}${path}`
  const res = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })

  const body: any = await res.json().catch(() => null)

  if (!res.ok) {
    const errors: AppleApiError[] = body?.errors || []
    const first = errors[0]
    if (first) {
      throw new Error(`Apple API error (${res.status}): ${first.title} — ${first.detail} (${first.code})`)
    }
    throw new Error(`Apple API error: HTTP ${res.status} ${res.statusText}`)
  }

  return body
}

// ─── API Functions ─────────────────────────────────────────────────

/**
 * Verify the API key works and try to detect the team ID from existing certificates.
 * Throws on 401/403 with a user-friendly message.
 */
export async function verifyApiKey(token: string): Promise<{ valid: true, teamId: string }> {
  try {
    // Verify key works and try to get team ID from existing certs
    const body = await ascFetch('/certificates?limit=1', token)
    let teamId = ''
    if (body.data?.length > 0 && body.data[0].attributes?.certificateContent) {
      teamId = extractTeamIdFromCert(body.data[0].attributes.certificateContent)
    }
    return { valid: true, teamId }
  }
  catch (err: any) {
    if (err.message?.includes('401') || err.message?.includes('403')) {
      throw new Error(
        'API key verification failed. Please check:\n'
        + '  - The .p8 file is correct and hasn\'t been modified\n'
        + '  - The Key ID matches the key shown in App Store Connect\n'
        + '  - The Issuer ID is correct (shown at the top of the API keys page)\n'
        + '  - The key has "Admin" or "Developer" access',
      )
    }
    throw err
  }
}

/**
 * List all iOS distribution certificates.
 */
export async function listDistributionCerts(
  token: string,
): Promise<Array<{ id: string, name: string, serialNumber: string, expirationDate: string }>> {
  const body = await ascFetch(
    '/certificates?filter[certificateType]=IOS_DISTRIBUTION&limit=10',
    token,
  )
  return (body.data || []).map((c: any) => ({
    id: c.id,
    name: c.attributes.name || c.attributes.displayName || 'iOS Distribution',
    serialNumber: c.attributes.serialNumber || '',
    expirationDate: c.attributes.expirationDate,
  }))
}

/**
 * Revoke (delete) a certificate by ID.
 */
export async function revokeCertificate(token: string, certId: string): Promise<void> {
  await ascFetch(`/certificates/${certId}`, token, { method: 'DELETE' })
}

/**
 * Error thrown when certificate limit is reached.
 * Contains the existing certificates so the UI can ask the user which to revoke.
 */
export class CertificateLimitError extends Error {
  constructor(
    public readonly certificates: Array<{ id: string, name: string, serialNumber: string, expirationDate: string }>,
  ) {
    super(`Certificate limit reached. Found ${certificates.length} existing iOS distribution certificate(s).`)
    this.name = 'CertificateLimitError'
  }
}

/**
 * Create a distribution certificate using a CSR.
 * Returns the certificate ID, base64 DER content, expiration date, and team ID.
 *
 * Throws CertificateLimitError if the limit is reached, so the UI can ask
 * the user which certificate to revoke.
 */
export async function createCertificate(
  token: string,
  csrPem: string,
): Promise<{
  certificateId: string
  certificateContent: string
  expirationDate: string
  teamId: string
}> {
  try {
    const body = await ascFetch('/certificates', token, {
      method: 'POST',
      body: JSON.stringify({
        data: {
          type: 'certificates',
          attributes: {
            certificateType: 'IOS_DISTRIBUTION',
            csrContent: csrPem,
          },
        },
      }),
    })

    const cert = body.data
    // Extract team ID from the certificate's subject OU field
    const teamId = extractTeamIdFromCert(cert.attributes.certificateContent)

    return {
      certificateId: cert.id,
      certificateContent: cert.attributes.certificateContent,
      expirationDate: cert.attributes.expirationDate,
      teamId,
    }
  }
  catch (err: any) {
    if (err.message?.includes('ENTITY_ERROR.ATTRIBUTE.INVALID')
      || err.message?.includes('There is a problem with the request entity')
      || err.message?.includes('maximum number of certificates')) {
      // Fetch existing certs so the UI can let the user choose which to revoke
      const existing = await listDistributionCerts(token)
      if (existing.length > 0) {
        throw new CertificateLimitError(existing)
      }
    }
    throw err
  }
}

/**
 * Find an existing bundle ID or register a new one.
 * Returns the Apple resource ID needed for profile creation.
 */
export async function ensureBundleId(
  token: string,
  identifier: string,
): Promise<{ bundleIdResourceId: string }> {
  // Try to find existing
  const searchBody = await ascFetch(
    `/bundleIds?filter[identifier]=${encodeURIComponent(identifier)}&limit=1`,
    token,
  )

  if (searchBody.data?.length > 0) {
    return { bundleIdResourceId: searchBody.data[0].id }
  }

  // Register new
  const createBody = await ascFetch('/bundleIds', token, {
    method: 'POST',
    body: JSON.stringify({
      data: {
        type: 'bundleIds',
        attributes: {
          identifier,
          name: `Capgo ${identifier}`,
          platform: 'IOS',
        },
      },
    }),
  })

  return { bundleIdResourceId: createBody.data.id }
}

/**
 * Get the profile name we use for a given appId.
 */
export function getCapgoProfileName(appId: string): string {
  return `Capgo ${appId} AppStore`
}

/**
 * Find existing provisioning profiles matching our naming convention.
 * Only returns profiles we created (named "Capgo <appId> AppStore").
 */
export async function findCapgoProfiles(
  token: string,
  appId: string,
): Promise<Array<{ id: string, name: string, profileType: string }>> {
  const profileName = getCapgoProfileName(appId)
  const body = await ascFetch(
    `/profiles?filter[name]=${encodeURIComponent(profileName)}&limit=10`,
    token,
  )

  return (body.data || []).map((p: any) => ({
    id: p.id,
    name: p.attributes.name,
    profileType: p.attributes.profileType,
  }))
}

/**
 * Delete a provisioning profile by ID.
 */
export async function deleteProfile(token: string, profileId: string): Promise<void> {
  await ascFetch(`/profiles/${profileId}`, token, { method: 'DELETE' })
}

/**
 * Create an App Store provisioning profile linking a certificate and bundle ID.
 * Returns the base64 mobileprovision content.
 *
 * Throws a DuplicateProfileError if duplicate profiles exist, so the caller
 * can ask the user whether to delete them and retry.
 */
export class DuplicateProfileError extends Error {
  constructor(
    public readonly profiles: Array<{ id: string, name: string, profileType: string }>,
  ) {
    super(`Duplicate profiles found: ${profiles.map(p => p.name).join(', ')}`)
    this.name = 'DuplicateProfileError'
  }
}

export async function createProfile(
  token: string,
  bundleIdResourceId: string,
  certificateId: string,
  appId: string,
): Promise<{
  profileId: string
  profileName: string
  profileContent: string
  expirationDate: string
}> {
  const profileName = getCapgoProfileName(appId)

  try {
    const body = await ascFetch('/profiles', token, {
      method: 'POST',
      body: JSON.stringify({
        data: {
          type: 'profiles',
          attributes: {
            name: profileName,
            profileType: 'IOS_APP_STORE',
          },
          relationships: {
            bundleId: {
              data: { type: 'bundleIds', id: bundleIdResourceId },
            },
            certificates: {
              data: [{ type: 'certificates', id: certificateId }],
            },
          },
        },
      }),
    })

    return {
      profileId: body.data.id,
      profileName: body.data.attributes.name,
      profileContent: body.data.attributes.profileContent,
      expirationDate: body.data.attributes.expirationDate,
    }
  }
  catch (err: any) {
    // Detect duplicate profile error
    if (err.message?.includes('Multiple profiles found')
      || err.message?.includes('duplicate')) {
      const existing = await findCapgoProfiles(token, appId)
      if (existing.length > 0) {
        throw new DuplicateProfileError(existing)
      }
    }
    throw err
  }
}
