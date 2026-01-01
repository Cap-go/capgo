/**
 * Hash utility functions for API key hashing
 */

/**
 * Hash an API key using SHA-256
 * @param key The plain-text API key to hash
 * @returns The SHA-256 hash as a hex string
 */
export async function hashApiKey(key: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(key)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}
