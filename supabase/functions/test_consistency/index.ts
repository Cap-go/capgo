import { serve } from 'https://deno.land/std@0.167.0/http/server.ts'
import { equal } from 'https://deno.land/x/equal@v1.5.0/mod.ts'

import {
  baseNetlify, baseSupabase, deleteBundle,
  deleteDevice, getBundle, getChannel, getDevice,
  getOk, postDevice, postStats, postUpdate, putChannel,
  setChannel, setChannelSelf,
} from '../_tests/api.ts'

import { sendRes } from '../_utils/utils.ts'

serve(async (event: Request) => {
  // check if netlify and supbase send same
  // check if they send updates
  try {
    const url = new URL(event.url)
    const service = url.searchParams.get('service')

    if (service == null) {
      return sendRes()
    }
    else if (service === 'ok') {
      const supabaseRes = await getOk(baseSupabase)
      const netlifyRes = await getOk(baseNetlify)
      if (!equal(supabaseRes, netlifyRes))
        return sendRes({ error: '!equal(supabaseRes, netlifyRes)', service }, 500)
    }
    else if (service === 'database') {
      const supabaseRes = await getOk(baseSupabase)
      const netlifyRes = await getOk(baseNetlify)
      if (!equal(supabaseRes, netlifyRes))
        return sendRes({ error: '!equal(supabaseRes, netlifyRes)', service }, 500)
    }
    else if (service === 'update') {
      const supabaseRes = await postUpdate(baseSupabase)
      const netlifyRes = await postUpdate(baseNetlify)
      if (!equal(supabaseRes, netlifyRes))
        return sendRes({ error: 'supabaseRes !== supabaseRes', service }, 500)
    }
    else if (service === 'stats') {
      const supabaseRes = await postStats(baseSupabase)
      const netlifyRes = await postStats(baseNetlify)
      if (!equal(supabaseRes, netlifyRes))
        return sendRes({ error: 'supabaseSetChannelSelf  !== netlifySetChannelSelf' }, 500)
    }
    else if (service === 'channel_self_post') {
      const supabaseRes = await setChannelSelf(baseSupabase)
      const netlifyRes = await setChannelSelf(baseNetlify)
      if (!equal(supabaseRes, netlifyRes))
        return sendRes({ error: 'supabaseRes  !== supabaseRes', service }, 500)
    }
    else if (service === 'channel_self_get') {
      const supabaseRes = await putChannel(baseSupabase)
      const netlifyRes = await putChannel(baseNetlify)
      if (!equal(supabaseRes, netlifyRes))
        return sendRes({ error: '!equal(supabaseRes, netlifyRes)', service }, 500)
    }
    else if (service === 'channel_get') {
      const supabaseRes = await getChannel(baseSupabase)
      const netlifyRes = await getChannel(baseNetlify)
      if (!equal(supabaseRes, netlifyRes))
        return sendRes({ error: '!equal(supabaseRes, netlifyRes)', service }, 500)
    }
    else if (service === 'channel_post') {
      const supabaseRes = await setChannel(baseSupabase)
      const netlifyRes = await setChannel(baseNetlify)
      if (!equal(supabaseRes, netlifyRes))
        return sendRes({ error: 'netlifyRes !== supabaseRes', service }, 500)
    }
    else if (service === 'device_get') {
      const supabaseRes = await getDevice(baseSupabase)
      const netlifyRes = await getDevice(baseNetlify)
      // console.log('supabaseRes', supabaseRes)
      // console.log('netlifyRes', netlifyRes)
      if (!equal(supabaseRes, netlifyRes))
        return sendRes({ error: '!equal(supabaseRes, netlifyRes)', service }, 500)
    }
    else if (service === 'device_post') {
      const supabaseRes = await postDevice(baseSupabase)
      const netlifyRes = await postDevice(baseNetlify)
      if (!equal(supabaseRes, netlifyRes))
        return sendRes({ error: '!equal(supabaseRes, netlifyRes)', service }, 500)
    }
    else if (service === 'device_delete') {
      const supabaseRes = await deleteDevice(baseSupabase)
      const netlifyRes = await deleteDevice(baseNetlify)
      if (!equal(supabaseRes, netlifyRes))
        return sendRes({ error: '!equal(supabaseRes, netlifyRes)', service }, 500)
    }
    else if (service === 'bundle_get') {
      const supabaseRes = await getBundle(baseSupabase)
      const netlifyRes = await getBundle(baseNetlify)
      if (!equal(supabaseRes, netlifyRes))
        return sendRes({ error: '!equal(supabaseRes, netlifyRes)', service }, 500)
    }
    else if (service === 'bundle_delete') {
      const supabaseRes = await deleteBundle(baseSupabase)
      const netlifyRes = await deleteBundle(baseNetlify)
      if (!equal(supabaseRes, netlifyRes))
        sendRes({ error: '!equal(supabaseRes, netlifyRes)', service }, 500)
    }
    return sendRes({ error: 'service not found', service }, 500)
  }
  catch (error) {
    return sendRes({ error: JSON.stringify(error) }, 500)
  }
})
