import { equal } from 'lauqe'

import { Hono } from 'hono/tiny'
import type { Context } from 'hono'
import { BRES } from '../../utils/hono.ts'
import {
  baseNetlify,
  baseNetlifyEdge,
  baseSupabase,
  deleteBundle,
  deleteDevice,
  getBundle,
  getChannels,
  getDevice,
  getOk,
  postDevice,
  postStats,
  postUpdate,
  putChannel,
  setChannel,
  setChannelSelf,
} from '../../tests/api.ts'

export const app = new Hono()

app.get('/', async (c: Context) => {
  try {
    let found = false
    const service = c.req.query('service')
    console.log('service', service)
    if (service == null) {
      return c.json(BRES)
    }
    else if (service === 'ok') {
      found = true
      const supabaseRes = await getOk(baseSupabase)
      const netlifyRes = await getOk(baseNetlify)
      const netlifyEdgeRes = await getOk(baseNetlifyEdge)
      if (!equal(supabaseRes, netlifyRes))
        return c.json({ error: '!equal(supabaseRes, netlifyRes)', service }, 500)
      if (!equal(supabaseRes, netlifyEdgeRes))
        return c.json({ error: '!equal(supabaseRes, netlifyEdgeRes)', service }, 500)
    }
    else if (service === 'database') {
      found = true
      const supabaseRes = await getOk(baseSupabase)
      const netlifyRes = await getOk(baseNetlify)
      const netlifyEdgeRes = await getOk(baseNetlifyEdge)
      if (!equal(supabaseRes, netlifyRes))
        return c.json({ error: '!equal(supabaseRes, netlifyRes)', service }, 500)
      if (!equal(supabaseRes, netlifyEdgeRes))
        return c.json({ error: '!equal(supabaseRes, netlifyEdgeRes)', service }, 500)
    }
    else if (service === 'update') {
      found = true
      const supabaseRes = await postUpdate(baseSupabase)
      const netlifyRes = await postUpdate(baseNetlify)
      const netlifyEdgeRes = await postUpdate(baseNetlifyEdge)
      console.log('service update', supabaseRes, netlifyRes)
      if (!equal(supabaseRes, netlifyRes))
        return c.json({ error: '!equal(supabaseRes, netlifyRes)', service }, 500)
      if (!equal(supabaseRes, netlifyEdgeRes))
        return c.json({ error: '!equal(supabaseRes, netlifyEdgeRes)', service }, 500)
    }
    else if (service === 'stats') {
      found = true
      const supabaseRes = await postStats(baseSupabase)
      const netlifyRes = await postStats(baseNetlify)
      const netlifyEdgeRes = await postStats(baseNetlifyEdge)
      if (!equal(supabaseRes, netlifyRes))
        return c.json({ error: '!equal(supabaseRes, netlifyRes)' }, 500)
      if (!equal(supabaseRes, netlifyEdgeRes))
        return c.json({ error: '!equal(supabaseRes, netlifyEdgeRes)', service }, 500)
    }
    else if (service === 'channel_self_post') {
      found = true
      const supabaseRes = await setChannelSelf(baseSupabase)
      const netlifyRes = await setChannelSelf(baseNetlify)
      const netlifyEdgeRes = await setChannelSelf(baseNetlifyEdge)
      if (!equal(supabaseRes, netlifyRes))
        return c.json({ error: '!equal(supabaseRes, netlifyRes)', service }, 500)
      if (!equal(supabaseRes, netlifyEdgeRes))
        return c.json({ error: '!equal(supabaseRes, netlifyEdgeRes)', service }, 500)
    }
    else if (service === 'channel_self_get') {
      found = true
      const supabaseRes = await putChannel(baseSupabase)
      const netlifyRes = await putChannel(baseNetlify)
      const netlifyEdgeRes = await putChannel(baseNetlifyEdge)
      if (!equal(supabaseRes, netlifyRes))
        return c.json({ error: '!equal(supabaseRes, netlifyRes)', service }, 500)
      if (!equal(supabaseRes, netlifyEdgeRes))
        return c.json({ error: '!equal(supabaseRes, netlifyEdgeRes)', service }, 500)
    }
    else if (service === 'channel_get') {
      found = true
      const supabaseRes = await getChannels(c, baseSupabase)
      const netlifyRes = await getChannels(c, baseNetlify)
      const netlifyEdgeRes = await getChannels(c, baseNetlifyEdge)
      if (!equal(supabaseRes, netlifyRes))
        return c.json({ error: '!equal(supabaseRes, netlifyRes)', service }, 500)
      if (!equal(supabaseRes, netlifyEdgeRes))
        return c.json({ error: '!equal(supabaseRes, netlifyEdgeRes)', service }, 500)
    }
    else if (service === 'channel_post') {
      found = true
      const supabaseRes = await setChannel(c, baseSupabase)
      const netlifyRes = await setChannel(c, baseNetlify)
      const netlifyEdgeRes = await setChannel(c, baseNetlifyEdge)
      if (!equal(supabaseRes, netlifyRes))
        return c.json({ error: '!equal(supabaseRes, netlifyRes)', service }, 500)
      if (!equal(supabaseRes, netlifyEdgeRes))
        return c.json({ error: '!equal(supabaseRes, netlifyEdgeRes)', service }, 500)
    }
    else if (service === 'device_get') {
      found = true
      const supabaseRes = await getDevice(c, baseSupabase)
      const netlifyRes = await getDevice(c, baseNetlify)
      const netlifyEdgeRes = await getDevice(c, baseNetlifyEdge)
      if (!equal(supabaseRes, netlifyRes))
        return c.json({ error: '!equal(supabaseRes, netlifyRes)', service }, 500)
      if (!equal(supabaseRes, netlifyEdgeRes))
        return c.json({ error: '!equal(supabaseRes, netlifyEdgeRes)', service }, 500)
    }
    else if (service === 'device_post') {
      found = true
      const supabaseRes = await postDevice(c, baseSupabase)
      const netlifyRes = await postDevice(c, baseNetlify)
      const netlifyEdgeRes = await postDevice(c, baseNetlifyEdge)
      if (!equal(supabaseRes, netlifyRes))
        return c.json({ error: '!equal(supabaseRes, netlifyRes)', service }, 500)
      if (!equal(supabaseRes, netlifyEdgeRes))
        return c.json({ error: '!equal(supabaseRes, netlifyEdgeRes)', service }, 500)
    }
    else if (service === 'device_delete') {
      found = true
      const supabaseRes = await deleteDevice(c, baseSupabase)
      const netlifyRes = await deleteDevice(c, baseNetlify)
      const netlifyEdgeRes = await deleteDevice(c, baseNetlifyEdge)
      if (!equal(supabaseRes, netlifyRes))
        return c.json({ error: '!equal(supabaseRes, netlifyRes)', service }, 500)
      if (!equal(supabaseRes, netlifyEdgeRes))
        return c.json({ error: '!equal(supabaseRes, netlifyEdgeRes)', service }, 500)
    }
    else if (service === 'bundle_get') {
      found = true
      const supabaseRes = await getBundle(c, baseSupabase)
      const netlifyRes = await getBundle(c, baseNetlify)
      const netlifyEdgeRes = await getBundle(c, baseNetlifyEdge)
      if (!equal(supabaseRes, netlifyRes))
        return c.json({ error: '!equal(supabaseRes, netlifyRes)', service }, 500)
      if (!equal(supabaseRes, netlifyEdgeRes))
        return c.json({ error: '!equal(supabaseRes, netlifyEdgeRes)', service }, 500)
    }
    else if (service === 'bundle_delete') {
      found = true
      const supabaseRes = await deleteBundle(c, baseSupabase)
      const netlifyRes = await deleteBundle(c, baseNetlify)
      const netlifyEdgeRes = await deleteBundle(c, baseNetlifyEdge)
      if (!equal(supabaseRes, netlifyRes))
        return c.json({ error: '!equal(supabaseRes, netlifyRes)', service }, 500)
      if (!equal(supabaseRes, netlifyEdgeRes))
        return c.json({ error: '!equal(supabaseRes, netlifyEdgeRes)', service }, 500)
    }
    if (!found)
      return c.json({ error: 'service not found', service }, 500)
    return c.json({ status: 'ok', service })
  }
  catch (e) {
    return c.json({ status: 'Cannot get config', error: JSON.stringify(e) }, 500)
  }
})
