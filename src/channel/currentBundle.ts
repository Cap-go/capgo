import type { ChannelCurrentBundleOptions } from '../schemas/channel'
import { intro, log } from '@clack/prompts'
import { check2FAComplianceForApp, checkAppExistsAndHasPermissionOrgErr } from '../api/app'
import {
  createSupabaseClient,
  findSavedKey,
  getAppId,
  getConfig,
  OrganizationPerm,
  verifyUser,
} from '../utils'

interface Channel {
  version: {
    name: string
  }
}

export async function currentBundleInternal(channel: string, appId: string, options: ChannelCurrentBundleOptions, silent = false) {
  const { quiet } = options

  if (!quiet && !silent)
    intro('List current bundle')

  options.apikey = options.apikey || findSavedKey(quiet)
  const extConfig = await getConfig()
  appId = getAppId(appId, extConfig?.config)

  if (!options.apikey) {
    if (!silent)
      log.error('Missing API key, you need to provide an API key to upload your bundle')
    throw new Error('Missing API key')
  }

  if (!appId) {
    if (!silent)
      log.error('Missing argument, you need to provide a appId, or be in a capacitor project')
    throw new Error('Missing appId')
  }

  const supabase = await createSupabaseClient(options.apikey, options.supaHost, options.supaAnon)
  await check2FAComplianceForApp(supabase, appId, silent)
  await verifyUser(supabase, options.apikey, ['write', 'all', 'read'])
  await checkAppExistsAndHasPermissionOrgErr(supabase, options.apikey, appId, OrganizationPerm.read, silent, true)

  if (!channel) {
    if (!silent)
      log.error('Please provide a channel to get the bundle from.')
    throw new Error('Channel name missing')
  }

  const { data: supabaseChannel, error } = await supabase
    .from('channels')
    .select('version ( name )')
    .eq('name', channel)
    .eq('app_id', appId)
    .limit(1)

  if (error || !supabaseChannel?.length) {
    if (!silent)
      log.error(`Error retrieving channel ${channel} for app ${appId}. Perhaps the channel does not exist?`)
    throw new Error(`Channel ${channel} not found for app ${appId}`)
  }

  const { version } = supabaseChannel[0] as Channel
  if (!version) {
    if (!silent)
      log.error(`Error retrieving channel ${channel} for app ${appId}. Perhaps the channel does not exist?`)
    throw new Error(`Channel ${channel} does not have a bundle linked`)
  }

  if (!silent) {
    if (!quiet)
      log.info(`Current bundle for channel ${channel} is ${version.name}`)
    else
      log.info(version.name)
  }

  return version.name
}

export async function currentBundle(channel: string, appId: string, options: ChannelCurrentBundleOptions) {
  return currentBundleInternal(channel, appId, options)
}
