import { serve } from 'https://deno.land/std@0.167.0/http/server.ts'
import { sendRes } from '../_utils/utils.ts'
import {
  baseSupabase, defaultGetBundleRes,
  defaultGetChannelRes, defaultGetDevicesRes,
  defaultPutChannelRes, defaultRes,
  defaultUpdateRes, deleteBundle, deleteDevice,
  getBundle, getChannel, getDatabase, getDevice, postDevice,
  postStats, postUpdate, putChannel, setChannel,
  setChannelSelf,
} from '../_tests/api.ts'

serve(async (event: Request) => {
  const url = new URL(event.url)
  const service = url.searchParams.get('service')
  console.log('service', service)
  if (service === 'database') {
    const db = await getDatabase()
    if (db)
      return sendRes({ status: 'ok', service })
    return sendRes({ error: 'db not answering as expected', service }, 500)
  }
  else if (service === 'update') {
    const supabaseRes = await postUpdate(baseSupabase)
    let valid = true
    Object.entries(supabaseRes).forEach(([key, value]) => {
      if (key !== 'url' && value !== defaultUpdateRes[key as keyof typeof supabaseRes])
        valid = false
      if (key === 'url' && value && !value.startsWith(defaultUpdateRes[key as keyof typeof defaultUpdateRes] || ''))
        valid = false
    })
    if (valid)
      return sendRes({ status: 'ok', service })
    return sendRes({ error: 'db not answering as expected', service }, 500)
  }
  else if (service === 'stats') {
    const supabaseRes = await postStats(baseSupabase)
    if (supabaseRes === defaultRes)
      return sendRes({ status: 'ok', service })
    return sendRes({ error: 'db not answering as expected', service }, 500)
  }
  else if (service === 'channel_self_post') {
    const supabaseRes = await setChannelSelf(baseSupabase)
    if (supabaseRes === defaultRes)
      return sendRes({ status: 'ok', service })
    return sendRes({ error: 'db not answering as expected', service }, 500)
  }
  else if (service === 'channel_self_get') {
    const supabaseRes = await putChannel(baseSupabase)
    if (supabaseRes === defaultPutChannelRes)
      return sendRes({ status: 'ok', service })
    return sendRes({ error: 'db not answering as expected', service }, 500)
  }
  else if (service === 'channel_get') {
    const supabaseRes = await getChannel(baseSupabase)
    if (supabaseRes === defaultGetChannelRes)
      return sendRes({ status: 'ok', service })
    return sendRes({ error: 'db not answering as expected', service }, 500)
  }
  else if (service === 'channel_post') {
    const supabaseRes = await setChannel(baseSupabase)
    if (supabaseRes === defaultRes)
      return sendRes({ status: 'ok', service })
    return sendRes({ error: 'db not answering as expected', service }, 500)
  }
  else if (service === 'device_get') {
    const supabaseRes = await getDevice(baseSupabase)
    if (supabaseRes === defaultGetDevicesRes)
      return sendRes({ status: 'ok', service })
    return sendRes({ error: 'db not answering as expected', service }, 500)
  }
  else if (service === 'device_post') {
    const supabaseRes = await postDevice(baseSupabase)
    if (supabaseRes === defaultRes)
      return sendRes({ status: 'ok', service })
    return sendRes({ error: 'db not answering as expected', service }, 500)
  }
  else if (service === 'device_delete') {
    const supabaseRes = await deleteDevice(baseSupabase)
    if (supabaseRes === defaultRes)
      return sendRes({ status: 'ok', service })
    return sendRes({ error: 'db not answering as expected', service }, 500)
  }
  else if (service === 'bundle_get') {
    const supabaseRes = await getBundle(baseSupabase)
    if (supabaseRes === defaultGetBundleRes)
      return sendRes({ status: 'ok', service })
    return sendRes({ error: 'db not answering as expected', service }, 500)
  }
  else if (service === 'bundle_delete') {
    const supabaseRes = await deleteBundle(baseSupabase)
    if (supabaseRes === defaultRes)
      return sendRes({ status: 'ok', service })
    return sendRes({ error: 'db not answering as expected', service }, 500)
  }
  return sendRes()
})
