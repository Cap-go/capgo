import type { Context } from 'hono'
import type { Database } from '../../utils/supabase.types.ts'
import { quickError, simpleError } from '../../utils/hono.ts'
import { hasAppRightApikey, supabaseAdmin } from '../../utils/supabase.ts'

interface SetChannelBody {
  app_id: string
  version_id: number
  channel_id: number
}

export async function setChannel(c: Context, body: SetChannelBody, apikey: Database['public']['Tables']['apikeys']['Row']): Promise<Response> {
  // Check API key permissions
  if (!(await hasAppRightApikey(c, body.app_id, apikey.user_id, 'write', apikey.key))) {
    throw simpleError('cannot_access_app', 'You can\'t access this app', { app_id: body.app_id })
  }

  if (!body.app_id || !body.version_id || !body.channel_id) {
    throw simpleError('missing_required_fields', 'Missing required fields', { app_id: body.app_id, version_id: body.version_id, channel_id: body.channel_id })
  }

  // Get organization info
  const { data: org, error: orgError } = await supabaseAdmin(c)
    .from('apps')
    .select('owner_org')
    .eq('app_id', body.app_id)
    .single()

  if (orgError || !org) {
    throw quickError(404, 'cannot_find_app', 'Cannot find app', { supabaseError: orgError })
  }

  // Verify the bundle exists and belongs to the app
  const { data: version, error: versionError } = await supabaseAdmin(c)
    .from('app_versions')
    .select('*')
    .eq('app_id', body.app_id)
    .eq('id', body.version_id)
    .eq('owner_org', org.owner_org)
    .eq('deleted', false)
    .single()

  if (versionError || !version) {
    throw simpleError('cannot_find_version', 'Cannot find version', { supabaseError: versionError })
  }

  // Verify the channel exists and belongs to the app
  const { data: channel, error: channelError } = await supabaseAdmin(c)
    .from('channels')
    .select('*')
    .eq('app_id', body.app_id)
    .eq('id', body.channel_id)
    .eq('owner_org', org.owner_org)
    .single()

  if (channelError || !channel) {
    throw simpleError('cannot_find_channel', 'Cannot find channel', { supabaseError: channelError })
  }

  // Update the channel to set the new version
  const { error: updateError } = await supabaseAdmin(c)
    .from('channels')
    .update({ version: body.version_id })
    .eq('id', body.channel_id)
    .eq('app_id', body.app_id)

  if (updateError) {
    throw simpleError('cannot_set_bundle_to_channel', 'Cannot set bundle to channel', { supabaseError: updateError })
  }

  return c.json({
    status: 'success',
    message: `Bundle ${version.name} set to channel ${channel.name}`,
  })
}
