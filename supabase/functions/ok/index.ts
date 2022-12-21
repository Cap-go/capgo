import { serve } from 'https://deno.land/std@0.170.0/http/server.ts'
import { equal } from 'https://deno.land/x/equal@v1.5.0/mod.ts'
import { methodJson, sendRes } from '../_utils/utils.ts'
import {
  baseSupabase, defaultGetBundleRes,
  defaultGetChannelRes, defaultGetDevicesRes,
  defaultPutChannelRes, defaultRes,
  defaultUpdateRes, deleteBundle, deleteDevice,
  getBundle, getChannel, getDatabase, getDevice, postDevice,
  postStats, postUpdate, putChannel, setChannel,
  setChannelSelf,
} from '../_tests/api.ts'
import type { BaseHeaders } from '../_utils/types.ts'

const main = async (url: URL, headers: BaseHeaders, method: string, body: any) => {
  const service = body.service
  console.log('service', service)
  if (service == null) {
    return sendRes()
  }
  else if (service === 'database') {
    const db = await getDatabase()
    if (db)
      return sendRes({ status: 'ok', service })
    return sendRes({ error: 'db not answering as expected', service }, 500)
  }
  else if (service === 'update') {
    const supabaseRes = await postUpdate(baseSupabase)
    if (!equal(supabaseRes, defaultUpdateRes))
      return sendRes({ error: '!equal(supabaseRes, netlifyRes)', service }, 500)
    return sendRes({ status: 'ok', service })
  }
  else if (service === 'stats') {
    const supabaseRes = await postStats(baseSupabase)
    if (!equal(supabaseRes, defaultRes))
      return sendRes({ error: '!equal(supabaseRes, netlifyRes)', service }, 500)
    return sendRes({ status: 'ok', service })
  }
  else if (service === 'channel_self_post') {
    const supabaseRes = await setChannelSelf(baseSupabase)
    if (!equal(supabaseRes, defaultRes))
      return sendRes({ error: '!equal(supabaseRes, netlifyRes)', service }, 500)
    return sendRes({ status: 'ok', service })
  }
  else if (service === 'channel_self_get') {
    const supabaseRes = await putChannel(baseSupabase)
    if (!equal(supabaseRes, defaultPutChannelRes))
      return sendRes({ error: '!equal(supabaseRes, netlifyRes)', service }, 500)
    return sendRes({ status: 'ok', service })
  }
  else if (service === 'channel_get') {
    const supabaseRes = await getChannel(baseSupabase)
    // map on list and remove all updatedAt
    if (!equal(supabaseRes, defaultGetChannelRes))
      return sendRes({ error: '!equal(supabaseRes, netlifyRes)', service }, 500)
    return sendRes({ status: 'ok', service })
  }
  else if (service === 'channel_post') {
    const supabaseRes = await setChannel(baseSupabase)
    if (!equal(supabaseRes, defaultRes))
      return sendRes({ error: '!equal(supabaseRes, netlifyRes)', service }, 500)
    return sendRes({ status: 'ok', service })
  }
  else if (service === 'device_get') {
    const supabaseRes = await getDevice(baseSupabase)
    // map on list and remove all updatedAt

    if (!equal(supabaseRes, defaultGetDevicesRes))
      return sendRes({ error: '!equal(supabaseRes, netlifyRes)', service }, 500)
    return sendRes({ status: 'ok', service })
  }
  else if (service === 'device_post') {
    const supabaseRes = await postDevice(baseSupabase)
    if (!equal(supabaseRes, defaultRes))
      return sendRes({ error: '!equal(supabaseRes, netlifyRes)', service }, 500)
    return sendRes({ status: 'ok', service })
  }
  else if (service === 'device_delete') {
    const supabaseRes = await deleteDevice(baseSupabase)
    if (!equal(supabaseRes, defaultRes))
      return sendRes({ error: '!equal(supabaseRes, netlifyRes)', service }, 500)
    return sendRes({ status: 'ok', service })
  }
  else if (service === 'bundle_get') {
    const supabaseRes = await getBundle(baseSupabase)
    if (!equal(supabaseRes, defaultGetBundleRes))
      return sendRes({ error: '!equal(supabaseRes, netlifyRes)', service }, 500)
    return sendRes({ status: 'ok', service })
  }
  else if (service === 'bundle_delete') {
    const supabaseRes = await deleteBundle(baseSupabase)
    if (!equal(supabaseRes, defaultRes))
      return sendRes({ error: '!equal(supabaseRes, netlifyRes)', service }, 500)
    return sendRes({ status: 'ok', service })
  }
  return sendRes({ error: 'service not found', service }, 500)
}

serve(async (event: Request) => {
  try {
    const url: URL = new URL(event.url)
    const headers: BaseHeaders = Object.fromEntries(event.headers.entries())
    const method: string = event.method
    const body: any = methodJson.includes(method) ? await event.json() : Object.fromEntries(url.searchParams.entries())
    return main(url, headers, method, body)
  }
  catch (e) {
    return sendRes({ status: 'Error', error: JSON.stringify(e) }, 500)
  }
})
