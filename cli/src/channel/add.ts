import type { ChannelAddOptions } from '../schemas/channel'
import { intro, log, outro } from '@clack/prompts'
import { check2FAComplianceForApp, checkAppExists } from '../api/app'
import { createChannel } from '../api/channels'
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

export async function addChannelInternal(channelId: string, appId: string, options: ChannelAddOptions, silent = false) {
  if (!silent)
    intro('Create channel')

  options.apikey = options.apikey || findSavedKey()
  const extConfig = await getConfig(silent).catch(() => undefined)
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

  const supabase = await createSupabaseClient(options.apikey, options.supaHost, options.supaAnon, silent)
  await check2FAComplianceForApp(supabase, appId, silent)
  const userId = await resolveUserIdFromApiKey(supabase, options.apikey)
  if (!(await checkAppExists(supabase, appId))) {
    const msg = `App ${appId} does not exist`
    if (!silent)
      log.error(msg)
    throw new Error(msg)
  }
  await assertCliPermission(supabase, options.apikey, 'app.create_channel', { appId }, {
    message: `Insufficient permissions to create channel for app ${appId}`,
    silent,
  })

  if (!silent)
    log.info(`Creating channel ${appId}#${channelId} to Capgo`)

  const orgId = await getOrganizationId(supabase, appId)

  const res = await createChannel(supabase, {
    name: channelId,
    app_id: appId,
    version: null,
    created_by: userId,
    owner_org: orgId,
    allow_device_self_set: options.selfAssign ?? false,
    public: options.default ?? false,
  })

  if (res.error) {
    if (!silent)
      log.error(`Cannot create Channel 🙀\n${formatError(res.error)}`)
    throw new Error(`Cannot create channel: ${formatError(res.error)}`)
  }

  await sendEvent(options.apikey, {
    channel: 'channel',
    event: 'Create channel',
    icon: '✅',
    user_id: orgId,
    tags: {
      'app-id': appId,
      'channel': channelId,
    },
    notify: false,
  }).catch(() => {})

  if (!silent) {
    log.success('Channel created ✅')
    outro('Done ✅')
  }

  return res.data ?? true
}

export async function addChannel(channelId: string, appId: string, options: ChannelAddOptions) {
  await addChannelInternal(channelId, appId, options, false)
}
