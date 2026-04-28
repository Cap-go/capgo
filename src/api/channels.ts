import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../types/supabase.types'
import { confirm as confirmC, intro, log, outro, spinner } from '@clack/prompts'
import { Table } from '@sauber/table'
import { formatError, getOrganizationId } from '../utils'

interface CheckVersionOptions {
  silent?: boolean
  autoUnlink?: boolean
}

export async function checkVersionNotUsedInChannel(
  supabase: SupabaseClient<Database>,
  appid: string,
  versionData: Database['public']['Tables']['app_versions']['Row'],
  options: CheckVersionOptions = {},
) {
  const { silent = false, autoUnlink = false } = options
  const { data: channelFound, error: errorChannel } = await supabase
    .from('channels')
    .select()
    .eq('app_id', appid)
    .eq('version', versionData.id)

  if (errorChannel) {
    if (!silent)
      log.error(`Cannot check Version ${appid}@${versionData.name}: ${formatError(errorChannel)}`)
    throw new Error(`Cannot check version ${appid}@${versionData.name}: ${formatError(errorChannel)}`)
  }

  if (!channelFound?.length)
    return

  if (silent)
    throw new Error(`Version ${appid}@${versionData.name} is used in ${channelFound.length} channel(s)`) // No interactivity allowed

  intro(`❌ Version ${appid}@${versionData.name} is used in ${channelFound.length} channel${channelFound.length > 1 ? 's' : ''}`)

  let shouldUnlink = autoUnlink
  if (!autoUnlink) {
    const response = await confirmC({ message: 'unlink it?' })
    shouldUnlink = response === true
  }

  if (!shouldUnlink) {
    log.error('Unlink it first')
    throw new Error(`Version ${appid}@${versionData.name} is still linked to channel(s)`) // Stop command
  }

  for (const channel of channelFound) {
    const s = spinner()
    s.start(`Unlinking channel ${channel.name}`)

    const unknownVersion = await findUnknownVersion(supabase, appid, { silent })
    if (!unknownVersion) {
      s.stop(`Cannot find unknown version for ${appid}`)
      throw new Error(`Cannot find unknown version for ${appid}`)
    }
    const { error: errorChannelUpdate } = await supabase
      .from('channels')
      .update({ version: unknownVersion.id })
      .eq('id', channel.id)

    if (errorChannelUpdate) {
      s.stop(`Cannot update channel ${channel.name} ${formatError(errorChannelUpdate)}`)
      throw new Error(`Cannot update channel ${channel.name}: ${formatError(errorChannelUpdate)}`)
    }

    s.stop(`✅ Channel ${channel.name} unlinked`)
  }

  outro(`Version unlinked from ${channelFound.length} channel${channelFound.length > 1 ? 's' : ''}`)
}

interface FindUnknownOptions {
  silent?: boolean
}

export async function findUnknownVersion(
  supabase: SupabaseClient<Database>,
  appId: string,
  options: FindUnknownOptions = {},
) {
  const { silent = false } = options

  // Try to find existing unknown version
  const { data, error: findError } = await supabase
    .from('app_versions')
    .select('id')
    .eq('app_id', appId)
    .eq('name', 'unknown')
    .single()

  if (!findError) {
    return data
  }

  // Not found - try to create it silently
  try {
    const orgId = await getOrganizationId(supabase, appId)
    const { data: newVersion, error: createError } = await supabase
      .from('app_versions')
      .insert({
        owner_org: orgId,
        deleted: true,
        name: 'unknown',
        app_id: appId,
      })
      .select('id')
      .single()

    if (createError) {
      // Both find and create failed - now we log
      if (!silent)
        log.error(`Cannot find or create unknown version for ${appId}. Find error: ${formatError(findError)}, Create error: ${formatError(createError)}`)
      throw new Error(`Cannot find or create unknown version for app ${appId}: ${formatError(createError)}`)
    }

    return newVersion
  }
  catch (createErr) {
    // Both find and create failed - now we log
    if (!silent)
      log.error(`Cannot find or create unknown version for ${appId}. Find error: ${formatError(findError)}, Create error: ${formatError(createErr)}`)
    throw new Error(`Cannot retrieve or create unknown version for app ${appId}: ${formatError(createErr)}`)
  }
}

export function createChannel(
  supabase: SupabaseClient<Database>,
  update: Database['public']['Tables']['channels']['Insert'],
) {
  return supabase
    .from('channels')
    .insert(update)
    .select()
    .single()
}

export function delChannel(supabase: SupabaseClient<Database>, name: string, appId: string, _userId: string) {
  return supabase
    .from('channels')
    .delete()
    .eq('name', name)
    .eq('app_id', appId)
    .single()
}

export function findChannel(supabase: SupabaseClient<Database>, appId: string, name: string) {
  return supabase
    .from('channels')
    .select()
    .eq('app_id', appId)
    .eq('name', name)
    .single()
}

export function findChannelDevices(supabase: SupabaseClient<Database>, appId: string, channelId: number) {
  return supabase
    .from('channel_devices')
    .select('id')
    .eq('app_id', appId)
    .eq('channel_id', channelId)
}

export function delChannelDevices(supabase: SupabaseClient<Database>, appId: string, channelId: number) {
  return supabase
    .from('channel_devices')
    .delete()
    .eq('app_id', appId)
    .eq('channel_id', channelId)
}

export function findBundleIdByChannelName(supabase: SupabaseClient<Database>, appId: string, name: string) {
  return supabase
    .from('channels')
    .select(`
      id,
      version (id, name)
    `)
    .eq('app_id', appId)
    .eq('name', name)
    .single()
    .throwOnError()
    .then(({ data }) => data?.version)
}

export type { Channel } from '../schemas/channel'
type Channel = import('../schemas/channel').Channel

export function displayChannels(data: Channel[], silent = false) {
  if (silent)
    return

  const t = new Table()
  t.theme = Table.roundTheme
  t.headers = ['Name', 'Version', 'Public', 'iOS', 'Android', 'Auto Update', 'Native Auto Update', 'Device Self Set', 'Progressive Deploy', 'Secondary Version', 'Secondary Version Percentage', 'AB Testing', 'AB Testing Version', 'AB Testing Percentage', 'Emulator', 'Device', 'Dev', 'Prod']
  t.rows = []

  for (const row of data.toReversed()) {
    t.rows.push([
      row.name,
      row.version?.name,
      row.public ? '✅' : '❌',
      row.ios ? '✅' : '❌',
      row.android ? '✅' : '❌',
      row.disable_auto_update,
      row.disable_auto_update_under_native ? '❌' : '✅',
      row.allow_device_self_set ? '✅' : '❌',
      row.allow_emulator ? '✅' : '❌',
      row.allow_device ? '✅' : '❌',
      row.allow_dev ? '✅' : '❌',
      row.allow_prod ? '✅' : '❌',
    ])
  }

  log.success('Channels')
  log.success(t.toString())
}

export async function getActiveChannels(
  supabase: SupabaseClient<Database>,
  appid: string,
  silent = false,
) {
  const { data, error: vError } = await supabase
    .from('channels')
    .select(`
      id,
      name,
      public,
      allow_emulator,
      allow_device,
      allow_dev,
      allow_prod,
      ios,
      android,
      allow_device_self_set,
      disable_auto_update_under_native,
      disable_auto_update,
      created_at,
      created_by,
      app_id,
      version (id, name)
    `)
    .eq('app_id', appid)
    .order('created_at', { ascending: false })

  if (vError) {
    if (!silent)
      log.error(`App ${appid} not found in database`)
    throw new Error(`App ${appid} not found in database: ${formatError(vError)}`)
  }

  return data as Channel[]
}
