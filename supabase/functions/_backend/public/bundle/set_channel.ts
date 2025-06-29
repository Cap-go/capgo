import type { Context } from '@hono/hono'
import type { Database } from '../../utils/supabase.types.ts'
import { cloudlogErr } from '../../utils/loggin.ts'
import { hasAppRightApikey, supabaseAdmin } from '../../utils/supabase.ts'

interface SetChannelBody {
  app_id: string
  version_id: number
  channel_id: number
}

export async function setChannel(c: Context, body: SetChannelBody, apikey: Database['public']['Tables']['apikeys']['Row']): Promise<Response> {
  // Check API key permissions
  if (!(await hasAppRightApikey(c, body.app_id, apikey.user_id, 'write', apikey.key))) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'You can\'t access this app', data: body.app_id })
    return c.json({ status: 'You can\'t access this app', app_id: body.app_id }, 400)
  }

  if (!body.app_id || !body.version_id || !body.channel_id) {
    return c.json({ status: 'Missing required fields', error: 'app_id, version_id, and channel_id are required' }, 400)
  }

  // Get organization info
  const { data: org, error: orgError } = await supabaseAdmin(c)
    .from('apps')
    .select('owner_org')
    .eq('app_id', body.app_id)
    .single()

  if (orgError || !org) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Cannot find app', error: orgError })
    return c.json({ status: 'Cannot find app', error: JSON.stringify(orgError) }, 400)
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
    cloudlogErr({ requestId: c.get('requestId'), message: 'Cannot find version', error: versionError })
    return c.json({ status: 'Cannot find version', error: JSON.stringify(versionError) }, 400)
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
    cloudlogErr({ requestId: c.get('requestId'), message: 'Cannot find channel', error: channelError })
    return c.json({ status: 'Cannot find channel', error: JSON.stringify(channelError) }, 400)
  }

  // Update the channel to set the new version
  const { error: updateError } = await supabaseAdmin(c)
    .from('channels')
    .update({ version: body.version_id })
    .eq('id', body.channel_id)
    .eq('app_id', body.app_id)

  if (updateError) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Cannot set bundle to channel', error: updateError })
    return c.json({ status: 'Cannot set bundle to channel', error: JSON.stringify(updateError) }, 500)
  }

  return c.json({
    status: 'success',
    message: `Bundle ${version.name} set to channel ${channel.name}`,
  })
}
