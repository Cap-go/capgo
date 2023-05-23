import { serve } from 'https://deno.land/std@0.188.0/http/server.ts'
import { equal } from 'https://deno.land/x/equal@v1.5.0/mod.ts'

import {
  baseNetlify, baseNetlifyEdge, baseSupabase, deleteBundle,
  deleteDevice, getBundle, getChannels, getDevice,
  getOk, postDevice, postStats, postUpdate, putChannel,
  setChannel, setChannelSelf,
} from '../_tests/api.ts'

import { sendRes } from '../_utils/utils.ts'

serve(async (event: Request) => {
  // check if netlify and supbase send same
  // check if they send updates
  try {
    let found = false
    const url = new URL(event.url)
    const service = url.searchParams.get('service')
    console.log('service', service)
    if (service == null) {
      return sendRes()
    }
    else if (service === 'ok') {
      found = true
      const supabaseRes = await getOk(baseSupabase)
      const netlifyRes = await getOk(baseNetlify)
      const netlifyEdgeRes = await getOk(baseNetlifyEdge)
      if (!equal(supabaseRes, netlifyRes))
        return sendRes({ error: '!equal(supabaseRes, netlifyRes)', service }, 500)
      if (!equal(supabaseRes, netlifyEdgeRes))
        return sendRes({ error: '!equal(supabaseRes, netlifyEdgeRes)', service }, 500)
    }
    else if (service === 'database') {
      found = true
      const supabaseRes = await getOk(baseSupabase)
      const netlifyRes = await getOk(baseNetlify)
      const netlifyEdgeRes = await getOk(baseNetlifyEdge)
      if (!equal(supabaseRes, netlifyRes))
        return sendRes({ error: '!equal(supabaseRes, netlifyRes)', service }, 500)
      if (!equal(supabaseRes, netlifyEdgeRes))
        return sendRes({ error: '!equal(supabaseRes, netlifyEdgeRes)', service }, 500)
    }
    else if (service === 'update') {
      found = true
      const supabaseRes = await postUpdate(baseSupabase)
      const netlifyRes = await postUpdate(baseNetlify)
      const netlifyEdgeRes = await postUpdate(baseNetlifyEdge)
      console.log('service update', supabaseRes, netlifyRes)
      if (!equal(supabaseRes, netlifyRes))
        return sendRes({ error: '!equal(supabaseRes, netlifyRes)', service }, 500)
      if (!equal(supabaseRes, netlifyEdgeRes))
        return sendRes({ error: '!equal(supabaseRes, netlifyEdgeRes)', service }, 500)
    }
    else if (service === 'stats') {
      found = true
      const supabaseRes = await postStats(baseSupabase)
      const netlifyRes = await postStats(baseNetlify)
      const netlifyEdgeRes = await postStats(baseNetlifyEdge)
      if (!equal(supabaseRes, netlifyRes))
        return sendRes({ error: '!equal(supabaseRes, netlifyRes)' }, 500)
      if (!equal(supabaseRes, netlifyEdgeRes))
        return sendRes({ error: '!equal(supabaseRes, netlifyEdgeRes)', service }, 500)
    }
    else if (service === 'channel_self_post') {
      found = true
      const supabaseRes = await setChannelSelf(baseSupabase)
      const netlifyRes = await setChannelSelf(baseNetlify)
      const netlifyEdgeRes = await setChannelSelf(baseNetlifyEdge)
      if (!equal(supabaseRes, netlifyRes))
        return sendRes({ error: '!equal(supabaseRes, netlifyRes)', service }, 500)
      if (!equal(supabaseRes, netlifyEdgeRes))
        return sendRes({ error: '!equal(supabaseRes, netlifyEdgeRes)', service }, 500)
    }
    else if (service === 'channel_self_get') {
      found = true
      const supabaseRes = await putChannel(baseSupabase)
      const netlifyRes = await putChannel(baseNetlify)
      const netlifyEdgeRes = await putChannel(baseNetlifyEdge)
      if (!equal(supabaseRes, netlifyRes))
        return sendRes({ error: '!equal(supabaseRes, netlifyRes)', service }, 500)
      if (!equal(supabaseRes, netlifyEdgeRes))
        return sendRes({ error: '!equal(supabaseRes, netlifyEdgeRes)', service }, 500)
    }
    else if (service === 'channel_get') {
      found = true
      const supabaseRes = await getChannels(baseSupabase)
      const netlifyRes = await getChannels(baseNetlify)
      const netlifyEdgeRes = await getChannels(baseNetlifyEdge)
      if (!equal(supabaseRes, netlifyRes))
        return sendRes({ error: '!equal(supabaseRes, netlifyRes)', service }, 500)
      if (!equal(supabaseRes, netlifyEdgeRes))
        return sendRes({ error: '!equal(supabaseRes, netlifyEdgeRes)', service }, 500)
    }
    else if (service === 'channel_post') {
      found = true
      const supabaseRes = await setChannel(baseSupabase)
      const netlifyRes = await setChannel(baseNetlify)
      const netlifyEdgeRes = await setChannel(baseNetlifyEdge)
      if (!equal(supabaseRes, netlifyRes))
        return sendRes({ error: '!equal(supabaseRes, netlifyRes)', service }, 500)
      if (!equal(supabaseRes, netlifyEdgeRes))
        return sendRes({ error: '!equal(supabaseRes, netlifyEdgeRes)', service }, 500)
    }
    else if (service === 'device_get') {
      found = true
      const supabaseRes = await getDevice(baseSupabase)
      const netlifyRes = await getDevice(baseNetlify)
      const netlifyEdgeRes = await getDevice(baseNetlifyEdge)
      if (!equal(supabaseRes, netlifyRes))
        return sendRes({ error: '!equal(supabaseRes, netlifyRes)', service }, 500)
      if (!equal(supabaseRes, netlifyEdgeRes))
        return sendRes({ error: '!equal(supabaseRes, netlifyEdgeRes)', service }, 500)
    }
    else if (service === 'device_post') {
      found = true
      const supabaseRes = await postDevice(baseSupabase)
      const netlifyRes = await postDevice(baseNetlify)
      const netlifyEdgeRes = await postDevice(baseNetlifyEdge)
      if (!equal(supabaseRes, netlifyRes))
        return sendRes({ error: '!equal(supabaseRes, netlifyRes)', service }, 500)
      if (!equal(supabaseRes, netlifyEdgeRes))
        return sendRes({ error: '!equal(supabaseRes, netlifyEdgeRes)', service }, 500)
    }
    else if (service === 'device_delete') {
      found = true
      const supabaseRes = await deleteDevice(baseSupabase)
      const netlifyRes = await deleteDevice(baseNetlify)
      const netlifyEdgeRes = await deleteDevice(baseNetlifyEdge)
      if (!equal(supabaseRes, netlifyRes))
        return sendRes({ error: '!equal(supabaseRes, netlifyRes)', service }, 500)
      if (!equal(supabaseRes, netlifyEdgeRes))
        return sendRes({ error: '!equal(supabaseRes, netlifyEdgeRes)', service }, 500)
    }
    else if (service === 'bundle_get') {
      found = true
      const supabaseRes = await getBundle(baseSupabase)
      const netlifyRes = await getBundle(baseNetlify)
      const netlifyEdgeRes = await getBundle(baseNetlifyEdge)
      if (!equal(supabaseRes, netlifyRes))
        return sendRes({ error: '!equal(supabaseRes, netlifyRes)', service }, 500)
      if (!equal(supabaseRes, netlifyEdgeRes))
        return sendRes({ error: '!equal(supabaseRes, netlifyEdgeRes)', service }, 500)
    }
    else if (service === 'bundle_delete') {
      found = true
      const supabaseRes = await deleteBundle(baseSupabase)
      const netlifyRes = await deleteBundle(baseNetlify)
      const netlifyEdgeRes = await deleteBundle(baseNetlifyEdge)
      if (!equal(supabaseRes, netlifyRes))
        return sendRes({ error: '!equal(supabaseRes, netlifyRes)', service }, 500)
      if (!equal(supabaseRes, netlifyEdgeRes))
        return sendRes({ error: '!equal(supabaseRes, netlifyEdgeRes)', service }, 500)
    }
    if (!found)
      return sendRes({ error: 'service not found', service }, 500)
    return sendRes({ status: 'ok', service })
  }
  catch (error) {
    return sendRes({ error: JSON.stringify(error) }, 500)
  }
})
