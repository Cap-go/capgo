import type { ChannelDeleteOptions } from '../schemas/channel'
import { intro, log, outro } from '@clack/prompts'
import { check2FAComplianceForApp, checkAppExists } from '../api/app'
import { delChannel, delChannelDevices, findBundleIdByChannelName, findChannel } from '../api/channels'
import { deleteAppVersion } from '../api/versions'
import {
  assertCliPermission,
  createSupabaseClient,
  findSavedKey,
  formatError,
  getAppId,
  getConfig,
  getOrganizationId,
  resolveUserIdFromApiKey,
  sendEvent,
} from '../utils'

export async function deleteChannelInternal(channelId: string, appId: string, options: ChannelDeleteOptions, silent = false) {
  if (!silent)
    intro('Delete channel')

  options.apikey = options.apikey || findSavedKey()
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
  const userId = await resolveUserIdFromApiKey(supabase, options.apikey)

  if (!(await checkAppExists(supabase, appId))) {
    const msg = `App ${appId} does not exist`
    if (!silent)
      log.error(msg)
    throw new Error(msg)
  }

  const { data: channel, error: channelError } = await findChannel(supabase, appId, channelId)
  if (channelError || !channel) {
    if (!silent)
      log.error(`Channel ${channelId} not found`)

    if (options.successIfNotFound) {
      if (!silent)
        log.success(`Channel ${channelId} not found and successIfNotFound is true`)
      return true
    }

    throw new Error(`Channel ${channelId} not found`)
  }

  await assertCliPermission(supabase, options.apikey, 'channel.delete', { appId, channelId: channel.id }, {
    message: `Insufficient permissions to delete channel ${channelId} for app ${appId}`,
    silent,
  })

  if (options.deleteBundle && !silent)
    log.info(`Deleting bundle ${appId}#${channelId} from Capgo`)

  if (options.deleteBundle) {
    const bundle = await findBundleIdByChannelName(supabase, appId, channelId)
    if (bundle?.name && !silent)
      log.info(`Deleting bundle ${bundle.name} from Capgo`)
    if (bundle?.name)
      await deleteAppVersion(supabase, appId, bundle.name)
  }

  const { error: delDevicesError } = await delChannelDevices(supabase, appId, channel.id)
  if (delDevicesError) {
    if (!silent)
      log.error(`Cannot delete channel devices: ${formatError(delDevicesError)}`)
    throw new Error(`Cannot delete channel devices: ${formatError(delDevicesError)}`)
  }

  if (!silent)
    log.info(`Deleting channel ${appId}#${channelId} from Capgo`)

  const deleteStatus = await delChannel(supabase, channelId, appId, userId)
  if (deleteStatus.error) {
    if (!silent)
      log.error(`Cannot delete Channel 🙀 ${formatError(deleteStatus.error)}`)
    throw new Error(`Cannot delete channel: ${formatError(deleteStatus.error)}`)
  }

  const orgId = await getOrganizationId(supabase, appId)

  await sendEvent(options.apikey, {
    channel: 'channel',
    event: 'Delete channel',
    icon: '✅',
    org_id: orgId,
    tracking_version: 2,
    tags: {
      'app-id': appId,
      'channel': channelId,
    },
    notify: false,
  }).catch(() => {})

  if (!silent) {
    log.success('Channel deleted')
    outro('Done ✅')
  }

  return true
}

export async function deleteChannel(channelId: string, appId: string, options: ChannelDeleteOptions) {
  return deleteChannelInternal(channelId, appId, options, false)
}
