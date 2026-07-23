import { registerPluginStatsSupabaseFallbacks } from './plugin_stats.ts'
import { trackBandwidthUsageSB, trackDevicesSB, trackDeviceUsageSB, trackLogsSB, trackVersionUsageSB } from './supabase.ts'

/**
 * Deno/local Supabase function boot helper.
 * Keeps supabase-js out of the CF plugin graph: only function entrypoints import this.
 */
export function registerPluginStatsSbFallbacksForDeno() {
  registerPluginStatsSupabaseFallbacks({
    trackLogsSB,
    trackDevicesSB,
    trackDeviceUsageSB,
    trackBandwidthUsageSB,
    trackVersionUsageSB,
  })
}
