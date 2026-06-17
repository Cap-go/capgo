export function applyCommandAnalyticsOptOut(commandPath: string, options: Record<string, unknown>, targetEnv = process.env) {
  if (commandPath !== 'init' || options.analytics !== false)
    return false

  targetEnv.CAPGO_DISABLE_TELEMETRY = 'true'
  return true
}
