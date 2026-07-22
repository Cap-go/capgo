import { type } from 'arktype'

// ============================================================================
// Capacitor Config Schema
// ============================================================================

export interface CapacitorConfig {
  appId: string
  appName: string
  webDir: string
  plugins?: Record<string, any>
  android?: Record<string, any>
  [key: string]: any
}

export const capacitorConfigSchema = type({
  appId: 'string',
  appName: 'string',
  webDir: 'string',
  'plugins?': { '[string]': { '[string]': 'unknown' } },
  'android?': { '[string]': 'unknown' },
})

export const extConfigPairsSchema = type({
  config: capacitorConfigSchema,
  path: 'string',
})

export type ExtConfigPairs = {
  config: CapacitorConfig
  path: string
}
