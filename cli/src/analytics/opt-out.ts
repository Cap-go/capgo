const analyticsOptOutCommands = new Set(['init', 'build init', 'build onboarding'])

export function applyCommandAnalyticsOptOut(commandPath: string, options: Record<string, unknown>, targetEnv = process.env) {
  if (!analyticsOptOutCommands.has(commandPath) || options.analytics !== false)
    return false

  targetEnv.CAPGO_DISABLE_TELEMETRY = 'true'
  return true
}

export function applyRawCommandAnalyticsOptOut(argv = process.argv, targetEnv = process.env) {
  if (!argv.includes('--no-analytics'))
    return false

  const args = argv.slice(2)
  const [command, subcommand] = args
  if (command === 'init' || command === 'i')
    return applyCommandAnalyticsOptOut('init', { analytics: false }, targetEnv)
  if (command === 'build' && (subcommand === 'init' || subcommand === 'onboarding'))
    return applyCommandAnalyticsOptOut(`build ${subcommand}`, { analytics: false }, targetEnv)

  return false
}
