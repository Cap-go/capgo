import { serve } from 'https://deno.land/std@0.171.0/http/server.ts'
import axios from 'https://deno.land/x/axiod@0.26.2/mod.ts'
import { supabaseAdmin } from '../_utils/supabase.ts'
import { getEnv, sendRes } from '../_utils/utils.ts'

const countryCode = [
  'us',
  'fr',
  'de',
  'gb',
  'jp',
  'kr',
  'cn',
  'br',
  'ru',
  'in',
  'au',
  'ca',
  'mx',
  'es',
  'it',
  'nl',
  'se',
  'dk',
  'no',
  'fi',
  'tr',
  'pl',
  'cz',
  'hu',
  'ro',
  'gr',
  'pt',
  'bg',
  'il',
  'ua',
  'hr',
  'sk',
  'si',
  'lt',
  'lv',
  'ee',
  'by',
  'mk',
  'al',
  'me',
  'rs',
  'ba',
  'md',
  'am',
  'ge',
  'az',
  'kg',
  'kz',
  'uz',
  'tj',
  'tm',
  'cy',
  'mt',
  'at',
  'be',
  'ch',
  'ie',
  'lu',
  'li',
  'is',
  'mt',
  'ad',
]

const categories = [
  'APPLICATION',
  'ANDROID_WEAR',
  'ART_AND_DESIGN',
  'AUTO_AND_VEHICLES',
  'BEAUTY',
  'BOOKS_AND_REFERENCE',
  'BUSINESS',
  'COMICS',
  'COMMUNICATION',
  'DATING',
  'EDUCATION',
  'ENTERTAINMENT',
  'EVENTS',
  'FINANCE',
  'FOOD_AND_DRINK',
  'HEALTH_AND_FITNESS',
  'HOUSE_AND_HOME',
  'LIBRARIES_AND_DEMO',
  'LIFESTYLE',
  'MAPS_AND_NAVIGATION',
  'MEDICAL',
  'MUSIC_AND_AUDIO',
  'NEWS_AND_MAGAZINES',
  'PARENTING',
  'PERSONALIZATION',
  'PHOTOGRAPHY',
  'PRODUCTIVITY',
  'SHOPPING',
  'SOCIAL',
  'SPORTS',
  'TOOLS',
  'TRAVEL_AND_LOCAL',
  'VIDEO_PLAYERS',
  'WATCH_FACE',
  'WEATHER',
  'GAME',
  'GAME_ACTION',
  'GAME_ADVENTURE',
  'GAME_ARCADE',
  'GAME_BOARD',
  'GAME_CARD',
  'GAME_CASINO',
  'GAME_CASUAL',
  'GAME_EDUCATIONAL',
  'GAME_MUSIC',
  'GAME_PUZZLE',
  'GAME_RACING',
  'GAME_ROLE_PLAYING',
  'GAME_SIMULATION',
  'GAME_SPORTS',
  'GAME_STRATEGY',
  'GAME_TRIVIA',
  'GAME_WORD',
  'FAMILY',
]

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
      .limit(5000)
      .order('created_at', { ascending: true })

    const { data: appsToGetInfo } = await supabaseAdmin()
      .from('store_apps')
      .select()
      .eq('to_get_info', true)
      .limit(5000)
      .order('created_at', { ascending: true })

    const { data: appsToGetSimilar } = await supabaseAdmin()
      .from('store_apps')
      .select()
      .eq('to_get_similar', true)
      .limit(500)
      .order('created_at', { ascending: true })

    const all = []
    console.log('appsToGetCapacitor', appsToGetCapacitor?.length || 0)
    console.log('appsToGetInfo', appsToGetInfo?.length || 0)
    console.log('appsToGetSimilar', appsToGetSimilar?.length || 0)
    // loop 100 times to get more random apps
    for (let i = 0; i < 100; i++) {
      const randomCategory = categories[Math.floor(Math.random() * categories.length)]
      const randomCountryCode = countryCode[Math.floor(Math.random() * countryCode.length)]
      console.log('randomCategory', randomCategory,'randomCountryCode', randomCountryCode)
      all.push(axios.get(`https://netlify.capgo.app/get_top_apk-background?category=${randomCategory}&country=${randomCountryCode}`))
    }
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
