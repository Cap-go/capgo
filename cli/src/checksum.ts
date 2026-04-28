import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'

/**
 * CRC32 lookup table
 */
const CRC32_TABLE = (() => {
  const table: number[] = []
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let j = 0; j < 8; j++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1)
    }
    table[i] = c
  }
  return table
})()

/**
 * Calculate CRC32 checksum
 */
function crc32(buffer: Buffer): string {
  let crc = 0xFFFFFFFF

  for (let i = 0; i < buffer.length; i++) {
    const byte = buffer[i]
    crc = CRC32_TABLE[(crc ^ byte) & 0xFF] ^ (crc >>> 8)
  }

  crc = crc ^ 0xFFFFFFFF

  // Return as unsigned 32-bit hex string
  return (crc >>> 0).toString(16).padStart(8, '0')
}

/**
 * Calculate checksum using the specified algorithm
 * @param data - Buffer or file path to calculate checksum for
 * @param algorithm - Hash algorithm to use ('sha256' or 'crc32')
 * @returns Hexadecimal checksum string
 */
export async function getChecksum(
  data: Buffer | string,
  algorithm: 'sha256' | 'crc32' = 'sha256',
): Promise<string> {
  const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data)

  if (algorithm === 'crc32') {
    return crc32(buffer)
  }

  // Use Node.js crypto for SHA256
  const hash = createHash(algorithm)
  hash.update(buffer)
  return hash.digest('hex')
}
