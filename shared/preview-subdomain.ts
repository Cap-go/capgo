const PREVIEW_HOSTNAME_REGEX = /^([^.]+)\.preview(?:\.[^.]+)?\.(?:capgo\.app|usecapgo\.com)$/
const PREVIEW_VERSION_SEPARATOR = '--'

/**
 * Parsed preview hostname information after the preview subdomain is decoded.
 */
export interface ParsedPreviewSubdomain {
  appId: string
  versionId: number
}

/**
 * Returns whether a character can be emitted directly inside the DNS-safe label.
 */
function isLowercaseAlphaNumeric(char: string) {
  return /^[a-z0-9]$/.test(char)
}

/**
 * Escapes a single character into a lowercase hex byte prefixed with `-`.
 */
function encodeEscapedByte(char: string) {
  return `-${char.charCodeAt(0).toString(16).padStart(2, '0')}`
}

/**
 * Encodes an app ID into a reversible DNS-safe preview subdomain label.
 */
export function encodePreviewAppId(appId: string): string {
  return Array.from(appId).map(char => isLowercaseAlphaNumeric(char) ? char : encodeEscapedByte(char)).join('')
}

/**
 * Builds the preview subdomain label used before `.preview.capgo.app`.
 */
export function buildPreviewSubdomain(appId: string, versionId: number): string {
  return `${encodePreviewAppId(appId)}${PREVIEW_VERSION_SEPARATOR}${versionId}`
}

/**
 * Decodes a DNS-safe preview label back to its original app ID.
 */
export function decodePreviewAppId(encodedAppId: string): string | null {
  let decoded = ''

  for (let index = 0; index < encodedAppId.length; index += 1) {
    const char = encodedAppId[index]
    if (char !== '-') {
      if (!isLowercaseAlphaNumeric(char))
        return null
      decoded += char
      continue
    }

    const escapedByte = encodedAppId.slice(index + 1, index + 3)
    if (!/^[0-9a-f]{2}$/.test(escapedByte))
      return null

    decoded += String.fromCharCode(Number.parseInt(escapedByte, 16))
    index += 2
  }

  return decoded
}

/**
 * Parses a numeric version identifier and rejects malformed values.
 */
function parseVersionId(value: string): number | null {
  if (!/^\d+$/.test(value))
    return null

  const versionId = Number.parseInt(value, 10)
  return Number.isNaN(versionId) ? null : versionId
}

/**
 * Parses the new reversible preview subdomain format.
 */
function parseEncodedPreviewSubdomain(subdomain: string): ParsedPreviewSubdomain | null {
  const separatorIndex = subdomain.lastIndexOf(PREVIEW_VERSION_SEPARATOR)
  if (separatorIndex <= 0)
    return null

  const encodedAppId = subdomain.slice(0, separatorIndex)
  const versionId = parseVersionId(subdomain.slice(separatorIndex + PREVIEW_VERSION_SEPARATOR.length))
  if (versionId === null)
    return null

  const appId = decodePreviewAppId(encodedAppId)
  if (!appId)
    return null

  return { appId, versionId }
}

/**
 * Parses the legacy preview subdomain format that encoded dots as `__`.
 */
function parseLegacyPreviewSubdomain(subdomain: string): ParsedPreviewSubdomain | null {
  const separatorIndex = subdomain.lastIndexOf('-')
  if (separatorIndex <= 0)
    return null

  const encodedAppId = subdomain.slice(0, separatorIndex)
  const versionId = parseVersionId(subdomain.slice(separatorIndex + 1))
  if (versionId === null)
    return null

  return {
    appId: encodedAppId.replace(/__/g, '.'),
    versionId,
  }
}

/**
 * Parses either the new reversible preview format or the legacy compatibility format.
 */
export function parsePreviewSubdomain(subdomain: string): ParsedPreviewSubdomain | null {
  return parseEncodedPreviewSubdomain(subdomain) ?? parseLegacyPreviewSubdomain(subdomain)
}

/**
 * Extracts and parses the preview label from a full preview hostname.
 */
export function parsePreviewHostname(hostname: string): ParsedPreviewSubdomain | null {
  const match = hostname.match(PREVIEW_HOSTNAME_REGEX)
  if (!match)
    return null

  return parsePreviewSubdomain(match[1])
}
