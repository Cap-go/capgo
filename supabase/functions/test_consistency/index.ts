import { serve } from 'https://deno.land/std@0.167.0/http/server.ts'
import { baseNetlify, baseSupabase, getChannels, getDevices, postUpdate, putChannel, setChannel } from '../_tests/api.ts'

import { sendRes } from '../_utils/utils.ts'

serve(async () => {
  // check if netlify and supbase send same
  // check if they send updates
  try {
    const supabaseUpdate = await postUpdate(baseSupabase)
    const netlifyUpdate = await postUpdate(baseNetlify)
    if (supabaseUpdate !== netlifyUpdate)
      sendRes({ error: 'supabaseUpdate !== netlifyUpdate' }, 500)

    // check if they setChannel
    const supabaseSetChannel = await setChannel(baseSupabase)
    const netlifySetChannel = await setChannel(baseNetlify)
    if (supabaseSetChannel !== netlifySetChannel)
      sendRes({ error: 'supabaseSetChannel !== netlifySetChannel' }, 500)

    // check if they putChannel
    const supabasePutChannel = await putChannel(baseSupabase)
    const netlifyPutChannel = await putChannel(baseNetlify)
    if (supabasePutChannel !== netlifyPutChannel)
      sendRes({ error: 'supabasePutChannel !== netlifyPutChannel' }, 500)

    // check if they send device list
    const supabaseDevices = await getDevices(baseSupabase)
    const netlifyDevices = await getDevices(baseNetlify)
    if (supabaseDevices !== netlifyDevices)
      sendRes({ error: 'supabaseDevices !== netlifyDevices' }, 500)

    // check if they send channel list
    const supabaseChannels = await getChannels(baseSupabase)
    const netlifyChannels = await getChannels(baseNetlify)
    if (supabaseChannels !== netlifyChannels)
      sendRes({ error: 'supabaseChannels !== netlifyChannels' }, 500)

    return sendRes()
  }
  catch (error) {
    return sendRes({ error }, 500)
  }
})
