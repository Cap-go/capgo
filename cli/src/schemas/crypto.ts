import { z } from 'zod'

// ============================================================================
// RSA Keys Schema
// ============================================================================

export const rsaKeysSchema = z.object({
  publicKey: z.string(),
  privateKey: z.string(),
})

export type RSAKeys = z.infer<typeof rsaKeysSchema>
