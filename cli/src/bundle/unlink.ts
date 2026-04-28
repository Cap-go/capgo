import type { BundleUnlinkOptions } from '../schemas/bundle'
import { intro, log, outro } from '@clack/prompts'
import { check2FAComplianceForApp, checkAppExistsAndHasPermissionOrgErr } from '../api/app'
import { checkVersionNotUsedInChannel } from '../api/channels'
import { getVersionData } from '../api/versions'
import {
  checkPlanValid,
  createSupabaseClient,
  findSavedKey,
  formatError,
  getAppId,
  getBundleVersion,
  getConfig,
  getOrganizationId,
  OrganizationPerm,
  sendEvent,
  verifyUser,
} from '../utils'

export async function unlinkDeviceInternal(
  channel: string,
  appId: string,
  options: BundleUnlinkOptions,
  silent = false,
) {
  if (!silent)
    intro('Unlink bundle')

  try {
    const enrichedOptions: BundleUnlinkOptions = {
      ...options,
      apikey: options.apikey || findSavedKey(),
    }

    const extConfig = await getConfig()
    const resolvedAppId = getAppId(appId, extConfig?.config)
    const packVersion = getBundleVersion('', options.packageJson)
    const bundle = enrichedOptions.bundle || packVersion

    if (!enrichedOptions.apikey) {
      if (!silent)
        log.error('Missing API key, you need to provide an API key to upload your bundle')
      throw new Error('Missing API key')
    }

    if (!resolvedAppId) {
      if (!silent)
        log.error('Missing argument, you need to provide an appId, or be in a capacitor project')
      throw new Error('Missing appId')
    }

    if (!bundle) {
      if (!silent)
        log.error('Missing argument, you need to provide a bundle, or be in a capacitor project')
      throw new Error('Missing bundle')
    }

    if (!channel) {
      if (!silent)
        log.error('Missing argument, you need to provide a channel')
      throw new Error('Missing channel')
    }

    const supabase = await createSupabaseClient(
      enrichedOptions.apikey,
      enrichedOptions.supaHost,
      enrichedOptions.supaAnon,
    )
    await check2FAComplianceForApp(supabase, resolvedAppId, silent)

    const [userId, orgId] = await Promise.all([
      verifyUser(supabase, enrichedOptions.apikey, ['all', 'write']),
      getOrganizationId(supabase, resolvedAppId),
    ])

    await checkAppExistsAndHasPermissionOrgErr(
      supabase,
      enrichedOptions.apikey,
      resolvedAppId,
      OrganizationPerm.write,
      silent,
      true,
    )

    await checkPlanValid(supabase, orgId, enrichedOptions.apikey, resolvedAppId)

    const versionData = await getVersionData(supabase, resolvedAppId, bundle, { silent })
    await checkVersionNotUsedInChannel(supabase, resolvedAppId, versionData, { silent })

    await sendEvent(enrichedOptions.apikey, {
      channel: 'bundle',
      event: 'Unlink bundle',
      icon: '✅',
      user_id: userId,
      tags: {
        'app-id': resolvedAppId,
      },
      notify: false,
    }).catch(() => {})

    if (!silent)
      outro('Done ✅')

    return true
  }
  catch (error) {
    if (!silent)
      log.error(`Unknown error ${formatError(error)}`)
    throw error instanceof Error ? error : new Error(String(error))
  }
}

export async function unlinkDevice(channel: string, appId: string, options: BundleUnlinkOptions) {
  await unlinkDeviceInternal(channel, appId, options, false)
}
