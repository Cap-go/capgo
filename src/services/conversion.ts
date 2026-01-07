export function toFixed(value: number, fixed: number) {
  if (fixed === 0)
    return value
  return Number.parseFloat(value.toFixed(fixed))
}
export function bytesToMb(bytes: number, fixes = 0) {
  return toFixed(Math.round(((bytes / 1024.0 / 1024.0) + Number.EPSILON) * 100) / 100, fixes)
}
export function bytesToGb(bytes: number, fixes = 0) {
  return toFixed(Math.round(((bytes / 1024.0 / 1024.0 / 1024.0) + Number.EPSILON) * 100) / 100, fixes)
}
export function octetsToGb(octets: number) {
  return Math.round(((octets / 8.0 / 1024.0 / 1024.0 / 1024.0) + Number.EPSILON) * 100) / 100
}
export function mbToBytes(mb: number) {
  return mb * 1024 * 1024
}
export function gbToBytes(gb: number) {
  return gb * 1024 * 1024 * 1024
}

export function bytesToMbText(bytes: number) {
  return `${bytesToMb(bytes)} MB`
}
export function bytesToGBText(bytes: number) {
  return `${bytesToGb(bytes)} GB`
}

export function getDaysBetweenDates(date1: string | Date, date2: string | Date) {
  const oneDay = 24 * 60 * 60 * 1000
  const firstDate = new Date(date1)
  const secondDate = new Date(date2)
  const res = Math.round(Math.abs((firstDate.valueOf() - secondDate.valueOf()) / oneDay))
  return res
}

export type ChecksumType = 'sha256' | 'crc32' | 'unknown'

export interface ChecksumInfo {
  type: ChecksumType
  label: string
  minPluginVersion: string
  features: string[]
}

/**
 * Detects the checksum algorithm type based on the hash string length.
 * SHA-256 = 64 hex characters (256 bits)
 * CRC32 = 8 hex characters (32 bits)
 *
 * Algorithm selection in CLI:
 * - SHA-256: Used with V2 encryption OR modern plugin versions (5.10.0+, 6.25.0+, 7.0.30+)
 * - CRC32: Used with older plugin versions without V2 encryption
 */
export function getChecksumInfo(checksum: string | null | undefined): ChecksumInfo {
  if (!checksum) {
    return {
      type: 'unknown',
      label: 'Unknown',
      minPluginVersion: '-',
      features: [],
    }
  }

  const length = checksum.length

  // SHA-256: 64 hex characters
  // Used with V2 encryption or modern plugin versions (5.10.0+, 6.25.0+, 7.0.30+)
  if (length === 64) {
    return {
      type: 'sha256',
      label: 'SHA-256',
      minPluginVersion: '5.10.0 / 6.25.0 / 7.0.30',
      features: ['integrity-verification', 'corruption-detection', 'security'],
    }
  }

  // CRC32: 8 hex characters
  // Used with older plugin versions without V2 encryption
  if (length === 8) {
    return {
      type: 'crc32',
      label: 'CRC32',
      minPluginVersion: '<5.10.0 / <6.25.0 / <7.0.30',
      features: ['fast-verification', 'corruption-detection'],
    }
  }

  return {
    type: 'unknown',
    label: 'Unknown',
    minPluginVersion: '-',
    features: [],
  }
}
