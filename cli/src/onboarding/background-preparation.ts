import type { OnboardingCheckOptions } from './background'
import type { PreparedOnboardingCheck } from './background-check'
import { env } from 'node:process'
import { defaultApiHost, defaultHostWeb, findSavedKeySilent, isCapgoManagedSupabaseHost, normalizeSupabaseHost, resolveConfiguredCapgoPublicApiHost } from '../utils'
import { isTrustedOnboardingApiHost } from './background-api'
import { resolveNotifyAppReadyProject } from './notify-app-ready-project'
import { setupDebug } from './setup-diagnostics'

function hasCustomUpdaterEndpoint(updater: Record<string, unknown> | undefined): boolean {
  return ['updateUrl', 'statsUrl'].some((field) => {
    const value = updater?.[field]
    if (value === undefined || value === null || value === '')
      return false
    if (typeof value !== 'string')
      return true
    try {
      const hostname = new URL(value).hostname
      return !['usecapgo.com', 'capgo.app'].some(domain => hostname === domain || hostname.endsWith(`.${domain}`))
    }
    catch {
      return true
    }
  })
}

export async function prepareOnboardingCheck(options: OnboardingCheckOptions): Promise<Omit<PreparedOnboardingCheck, 'attemptId'> | undefined> {
  // Capture user-provided trust before evaluating executable project config.
  const trustedOrigins = env.CAPGO_TRUSTED_API_ORIGINS?.split(',') ?? []
  const apikey = options.apikey ?? findSavedKeySilent()
  if (!apikey) {
    setupDebug('preparation skipped', { reason: 'missing_api_key' })
    return
  }
  const project = await resolveNotifyAppReadyProject(options)
  if (!project) {
    setupDebug('preparation skipped', { reason: 'project_not_resolved' })
    return
  }

  const updater = project.config.plugins?.CapacitorUpdater
  if (hasCustomUpdaterEndpoint(updater)) {
    setupDebug('preparation skipped', { reason: 'custom_updater_endpoint' })
    return
  }
  const config = {
    hostApi: updater?.localApi || defaultApiHost,
    supaHost: updater?.localSupa,
    supaKey: updater?.localSupaAnon,
  }
  const explicitSelfHost = options.supaHost && options.supaAnon && !isCapgoManagedSupabaseHost(options.supaHost)
  const apiHost = explicitSelfHost
    ? `${normalizeSupabaseHost(options.supaHost!)}/functions/v1`
    : resolveConfiguredCapgoPublicApiHost(config)
  if (!isTrustedOnboardingApiHost(apiHost, options, trustedOrigins)) {
    setupDebug('preparation skipped', { reason: 'untrusted_api_origin' })
    return
  }
  const anonKey = options.supaAnon ?? config.supaKey
  return {
    project: { dir: project.dir, workspaceRoot: project.workspaceRoot, appId: project.appId, webDir: project.webDir },
    apiHost,
    anonKey,
    webHost: updater?.localWebHost || defaultHostWeb,
    apikey,
    command: options.command,
  }
}
