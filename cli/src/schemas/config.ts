import { z } from 'zod'

// ============================================================================
// Capacitor Config Schema
// ============================================================================

export const capacitorConfigSchema = z.object({
  appId: z.string(),
  appName: z.string(),
  webDir: z.string(),
  plugins: z.record(z.string(), z.any()).optional(),
  android: z.record(z.string(), z.any()).optional(),
}).passthrough()

export type CapacitorConfig = z.infer<typeof capacitorConfigSchema>

export const extConfigPairsSchema = z.object({
  config: capacitorConfigSchema,
  path: z.string(),
})

export type ExtConfigPairs = z.infer<typeof extConfigPairsSchema>
