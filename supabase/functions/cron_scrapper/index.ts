import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import axios from 'https://deno.land/x/axiod@0.26.2/mod.ts'
import { categories, countries } from '../_utils/gplay_categ.ts'
import { supabaseAdmin } from '../_utils/supabase.ts'
import { getEnv, sendRes } from '../_utils/utils.ts'

const toGetFramwork = 5000
const toGetInfo = 5000
const toGetSimilar = 500

serve(async (event: Request) => {
  const API_SECRET = getEnv('API_SECRET')
  const authorizationSecret = event.headers.get('apisecret')
  if (!authorizationSecret)
    return sendRes({ status: 'Cannot find authorization secret' }, 400)

  if (!authorizationSecret || !API_SECRET || authorizationSecret !== API_SECRET)
    return sendRes({ message: 'Fail Authorization', authorizationSecret, API_SECRET }, 400)

  try {
    const { data: appsToGetFramework } = await supabaseAdmin()
      .from('store_apps')
      .select()
      .eq('to_get_framework', true)
      .limit(toGetFramwork)
      .order('created_at', { ascending: true })

    const { data: appsToGetInfo } = await supabaseAdmin()
      .from('store_apps')
      .select()
      .eq('to_get_info', true)
      .limit(toGetInfo)
      .order('created_at', { ascending: true })

    const { data: appsToGetSimilar } = await supabaseAdmin()
      .from('store_apps')
      .select()
      .eq('to_get_similar', true)
      .limit(toGetSimilar)
      .order('created_at', { ascending: true })

    const all = []
    console.log('appsToGetFramework', appsToGetFramework?.length || 0)
    console.log('appsToGetInfo', appsToGetInfo?.length || 0)
    console.log('appsToGetSimilar', appsToGetSimilar?.length || 0)
    // loop 100 times to get more random apps
    // for (let i = 0; i < toGetTop; i++) {
    //   const randomCategory = categories[Math.floor(Math.random() * categories.length)]
    //   const randomCountryCode = countries[Math.floor(Math.random() * countries.length)]
    //   console.log('randomCategory', randomCategory, 'randomCountryCode', randomCountryCode)
    all.push(axios.post('https://netlify.capgo.app/get_top_apk-background', {
      categories,
      countries,
    }))
    if (appsToGetFramework?.length) {
      all.push(axios.post('https://netlify.capgo.app/get_framework-background', {
        appIds: appsToGetFramework.map(app => app.app_id),
      }))
    }
    if (appsToGetInfo?.length) {
      all.push(axios.post('https://netlify.capgo.app/get_store_info-background', {
        appIds: appsToGetInfo.map(app => app.app_id),
      }))
    }
    if (appsToGetSimilar?.length) {
      all.push(axios.post('https://netlify.capgo.app/get_framework-background', {
        appIds: appsToGetSimilar.map(app => app.app_id),
      }))
    }
    await Promise.all(all)
    return sendRes()
  }
  catch (e) {
    console.log('error', e)
    return sendRes({
      status: 'Error unknow',
      error: JSON.stringify(e),
    }, 500)
  }
})
