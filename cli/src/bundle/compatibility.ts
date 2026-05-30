import type { BundleCompatibilityOptions } from '../schemas/bundle'
import type { Compatibility } from '../utils'
import { intro, log } from '@clack/prompts'
import { Table } from '@sauber/table'
import { trackEvent } from '../analytics/track'
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

  void trackEvent({
    channel: 'bundle',
    event: 'Bundle Compatibility Checked',
    icon: '🧪',
    tags: {
      result: hasIncompatible ? 'incompatible' : 'compatible',
      missing_deps_count: compatibility.finalCompatibility.filter(entry => !isCompatible(entry)).length,
    },
  })

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

  // Surface incompatible results from the explicit `capgo bundle compatibility`
  // command to Bento via the backend. The silent internal callers (sdk.ts,
  // releaseType.ts) are intentionally excluded. The command uploads nothing, so
  // only the channel's current (old) version is reported — version_new is empty.
  if (hasIncompatible && !silent) {
    // Best-effort telemetry: the org/version lookups are awaited, so a network
    // or auth failure must be swallowed here — it must never break the command.
    try {
      const [channelResult, appResult] = await Promise.all([
        supabase.from('channels').select('version ( id, name )').eq('name', channel).eq('app_id', resolvedAppId).maybeSingle(),
        supabase.from('apps').select('owner_org').eq('app_id', resolvedAppId).maybeSingle(),
      ])
      const oldVersion = (channelResult.data?.version ?? undefined) as unknown as { id?: number | string, name?: string } | undefined
      void trackEvent({
        channel: 'bundle',
        event: 'Bundle Incompatible',
        icon: '🚫',
        apikey: enrichedOptions.apikey,
        appId: resolvedAppId,
        orgId: appResult.data?.owner_org ?? undefined,
        tags: {
          source: 'command',
          channel,
          ...(oldVersion?.id != null ? { version_old_id: String(oldVersion.id) } : {}),
          ...(oldVersion?.name ? { version_old_name: oldVersion.name } : {}),
        },
      })
    }
    catch {
      // telemetry must never break a command
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

export type UploadCompatibilityResult = 'compatible' | 'incompatible' | 'skipped'

export interface UploadCompatibilitySummary {
  result: UploadCompatibilityResult
  incompatibleCount: number
  reasons: string[]
}

/**
 * Summarize an upload's compatibility outcome for analytics.
 *
 * `finalCompatibility` is `undefined` when the comparison did not run (new
 * channel / no remote native metadata / `--ignore-metadata-check`), which is
 * reported as `skipped` so the funnel never silently counts a skip as
 * `compatible`.
 */
export function summarizeUploadCompatibility(
  finalCompatibility: Compatibility[] | undefined,
): UploadCompatibilitySummary {
  if (!finalCompatibility)
    return { result: 'skipped', incompatibleCount: 0, reasons: [] }

  const incompatible = finalCompatibility.filter(entry => !isCompatible(entry))
  const reasons = [...new Set(incompatible.flatMap(entry => getCompatibilityDetails(entry).reasons))]

  return {
    result: incompatible.length > 0 ? 'incompatible' : 'compatible',
    incompatibleCount: incompatible.length,
    reasons,
  }
}
