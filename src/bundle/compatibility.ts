import type { BundleCompatibilityOptions } from '../schemas/bundle'
import type { Compatibility } from '../utils'
import { intro, log } from '@clack/prompts'
import { Table } from '@sauber/table'
import { check2FAComplianceForApp, checkAppExistsAndHasPermissionOrgErr } from '../api/app'
import {
  checkCompatibilityCloud,
  createSupabaseClient,
  findSavedKey,
  formatError,
  getAppId,
  getCompatibilityDetails,
  getConfig,
  isCompatible,
  OrganizationPerm,
  verifyUser,
} from '../utils'

interface CompatibilityResult {
  finalCompatibility: Compatibility[]
  hasIncompatible: boolean
  resolvedAppId: string
  channel: string
}

export async function checkCompatibilityInternal(
  appId: string,
  options: BundleCompatibilityOptions,
  silent = false,
): Promise<CompatibilityResult> {
  if (!silent)
    intro('Check compatibility')

  const enrichedOptions: BundleCompatibilityOptions = {
    ...options,
    apikey: options.apikey || findSavedKey(),
  }

  const extConfig = appId ? undefined : await getConfig()
  const resolvedAppId = getAppId(appId, extConfig?.config)
  const channel = enrichedOptions.channel

  if (!channel) {
    if (!silent)
      log.error('Missing argument, you need to provide a channel')
    throw new Error('Missing channel')
  }

  if (!enrichedOptions.apikey) {
    if (!silent)
      log.error('Missing API key, you need to provide an API key to access Capgo Cloud metadata')
    throw new Error('Missing API key')
  }

  if (!resolvedAppId) {
    if (!silent)
      log.error('Missing argument, you need to provide an appId, or be in a capacitor project')
    throw new Error('Missing appId')
  }

  const supabase = await createSupabaseClient(
    enrichedOptions.apikey,
    enrichedOptions.supaHost,
    enrichedOptions.supaAnon,
  )
  await check2FAComplianceForApp(supabase, resolvedAppId, silent)
  await verifyUser(supabase, enrichedOptions.apikey, ['write', 'all', 'read', 'upload'])
  await checkAppExistsAndHasPermissionOrgErr(
    supabase,
    enrichedOptions.apikey,
    resolvedAppId,
    OrganizationPerm.read,
    silent,
    true,
  )

  const compatibility = await checkCompatibilityCloud(
    supabase,
    resolvedAppId,
    channel,
    enrichedOptions.packageJson,
    enrichedOptions.nodeModules,
  )

  const hasIncompatible = compatibility.finalCompatibility.some(entry => !isCompatible(entry))

  if (!silent) {
    const table = new Table()
    table.headers = ['Package', 'Local', 'Remote', 'Status', 'Details']
    table.theme = Table.roundTheme
    table.rows = []

    const yesSymbol = enrichedOptions.text ? 'OK' : '✅'
    const noSymbol = enrichedOptions.text ? 'FAIL' : '❌'

    for (const entry of compatibility.finalCompatibility) {
      const { name, localVersion, remoteVersion } = entry
      const details = getCompatibilityDetails(entry)
      const statusSymbol = details.compatible ? yesSymbol : noSymbol
      table.rows.push([
        name,
        localVersion || '-',
        remoteVersion || '-',
        statusSymbol,
        details.message,
      ])
    }

    log.success('Compatibility Check Results')
    log.info(table.toString())

    // Summary
    if (hasIncompatible) {
      const incompatibleCount = compatibility.finalCompatibility.filter(e => !isCompatible(e)).length
      log.warn(`\n${incompatibleCount} package(s) are incompatible with channel "${channel}"`)
      log.warn('An app store update may be required for these changes to take effect.')
    }
    else {
      log.success(`\nAll packages are compatible with channel "${channel}"`)
    }
  }

  return {
    finalCompatibility: compatibility.finalCompatibility,
    hasIncompatible,
    resolvedAppId,
    channel,
  }
}

export async function checkCompatibility(appId: string, options: BundleCompatibilityOptions) {
  try {
    await checkCompatibilityInternal(appId, options, false)
  }
  catch (error) {
    log.error(`Error checking compatibility ${formatError(error)}`)
    throw error
  }
}
