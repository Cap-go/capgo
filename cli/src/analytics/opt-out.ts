export function applyCommandAnalyticsOptOut(commandPath: string, options: Record<string, unknown>, targetEnv = process.env) {
  if (!new Set(['init', 'build init', 'build onboarding']).has(commandPath) || options.analytics !== false)
    return false

  targetEnv.CAPGO_DISABLE_TELEMETRY = 'true'
  return true
}
