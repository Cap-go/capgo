import { serve } from 'https://deno.land/std@0.171.0/http/server.ts'
import axios from 'https://deno.land/x/axiod@0.26.2/mod.ts'
import { supabaseAdmin } from '../_utils/supabase.ts'
import { getEnv, sendRes } from '../_utils/utils.ts'

serve(async (event: Request) => {
  const API_SECRET = getEnv('API_SECRET')
  const authorizationSecret = event.headers.get('apisecret')
  if (!authorizationSecret)
    return sendRes({ status: 'Cannot find authorization secret' }, 400)

  if (!authorizationSecret || !API_SECRET || authorizationSecret !== API_SECRET)
    return sendRes({ message: 'Fail Authorization', authorizationSecret, API_SECRET }, 400)

  try {
    const { data: appsToGetCapacitor } = await supabaseAdmin()
      .from('store_apps')
      .select()
      .eq('to_get_capacitor', true)
      .limit(50)
      .order('created_at', { ascending: true })

    const { data: appsToGetInfo } = await supabaseAdmin()
      .from('store_apps')
      .select()
      .eq('to_get_info', true)
      .limit(50)
      .order('created_at', { ascending: true })

    const { data: appsToGetSimilar } = await supabaseAdmin()
      .from('store_apps')
      .select()
      .eq('to_get_similar', true)
      .limit(50)
      .order('created_at', { ascending: true })

    const all = []
    console.log('appsToGetCapacitor', appsToGetCapacitor?.length || 0)
    console.log('appsToGetInfo', appsToGetInfo?.length || 0)
    console.log('appsToGetSimilar', appsToGetSimilar?.length || 0)
    for (const app of (appsToGetCapacitor || []))
      all.push(axios.get(`https://netlify.capgo.app/get_capacitor-background?appId=${app.app_id}`))

    for (const app of (appsToGetInfo || []))
      all.push(axios.get(`https://netlify.capgo.app/get_store_info-background?appId=${app.app_id}`))

    for (const app of (appsToGetSimilar || []))
      all.push(axios.get(`https://netlify.capgo.app/get_similar_app-background?appId=${app.app_id}`))

    await Promise.all(all)
    return sendRes()
  }
  catch (e) {
    return sendRes({
      status: 'Error unknow',
      error: JSON.stringify(e),
    }, 500)
  }
})
