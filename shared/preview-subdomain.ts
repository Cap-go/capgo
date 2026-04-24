const PREVIEW_HOSTNAME_REGEX = /^([^.]+)\.preview(?:\.[^.]+)?\.(?:capgo\.app|usecapgo\.com)$/
const PREVIEW_VERSION_SEPARATOR = '--'

export interface ParsedPreviewSubdomain {
  appId: string
  versionId: number
}

function isLowercaseAlphaNumeric(char: string) {
  return /^[a-z0-9]$/.test(char)
}

function encodeEscapedByte(char: string) {
  return `-${char.charCodeAt(0).toString(16).padStart(2, '0')}`
}

export function encodePreviewAppId(appId: string): string {
  return Array.from(appId).map(char => isLowercaseAlphaNumeric(char) ? char : encodeEscapedByte(char)).join('')
}

export function buildPreviewSubdomain(appId: string, versionId: number): string {
  return `${encodePreviewAppId(appId)}${PREVIEW_VERSION_SEPARATOR}${versionId}`
}

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

function parseVersionId(value: string): number | null {
  if (!/^\d+$/.test(value))
    return null

  const versionId = Number.parseInt(value, 10)
  return Number.isNaN(versionId) ? null : versionId
}

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

export function parsePreviewSubdomain(subdomain: string): ParsedPreviewSubdomain | null {
  return parseEncodedPreviewSubdomain(subdomain) ?? parseLegacyPreviewSubdomain(subdomain)
}

export function parsePreviewHostname(hostname: string): ParsedPreviewSubdomain | null {
  const match = hostname.match(PREVIEW_HOSTNAME_REGEX)
  if (!match)
    return null

  return parsePreviewSubdomain(match[1])
}
