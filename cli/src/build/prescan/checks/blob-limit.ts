// src/build/prescan/checks/blob-limit.ts

/**
 * Local checks parse credential blobs synchronously (node-forge), so the
 * engine's async timeout cannot bound them: a corrupted or accidentally huge
 * saved credential would freeze the CLI for minutes with multi-GB memory
 * amplification. Refuse anything over a sane ceiling before decoding.
 */
export const MAX_CREDENTIAL_B64_CHARS = 10 * 1024 * 1024 // 10M base64 chars ≈ 7.5MB binary

export function assertCredentialBlobSize(base64: string, what: 'certificate' | 'keystore'): void {
  if (base64.length > MAX_CREDENTIAL_B64_CHARS) {
    const mb = (base64.length / 1024 / 1024).toFixed(0)
    throw new Error(`credential blob is ${mb} MB of base64 — not a valid ${what} (limit 10 MB)`)
  }
}
