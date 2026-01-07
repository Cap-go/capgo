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
 * SHA-256 = 64 hex characters (256 bits) - Default algorithm used by CLI
 * CRC32 = 8 hex characters (32 bits) - Legacy option, rarely used
 *
 * Checksum verification requires plugin version > 4.4.0
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

  // SHA-256: Default algorithm, produces 64 hex characters
  // Used for secure integrity verification of bundles
  if (length === 64) {
    return {
      type: 'sha256',
      label: 'SHA-256',
      minPluginVersion: '>4.4.0',
      features: ['integrity-verification', 'corruption-detection', 'security'],
    }
  }

  // CRC32: Legacy algorithm, produces 8 hex characters
  // Faster but less secure, kept for backwards compatibility
  if (length === 8) {
    return {
      type: 'crc32',
      label: 'CRC32',
      minPluginVersion: '>4.4.0',
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
