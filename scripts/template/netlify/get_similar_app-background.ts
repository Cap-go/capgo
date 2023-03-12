import type { BaseHeaders } from 'supabase/functions/_utils/types'
import type { BackgroundHandler } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'
import gplay from 'google-play-scraper'
import type { Database } from '~/types/supabase.types'

export const methodJson = ['POST', 'PUT', 'PATCH']

export const supabaseClient = () => {
  const options = {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  }
  return createClient<Database>(process.env.SUPABASE_URL || '', process.env.SUPABASE_SERVICE_ROLE_KEY || '', options)
}

const getAppsInfo = async (appId: string, country: string) => {
  const { title } = await gplay.app({ appId }).catch(() => ({ title: '' }))
  const itemsSim = await gplay.similar({ appId, num: 250, country }).catch(() => [])
  const itemsSearch = title ? await gplay.search({ term: title, num: 250, country }).catch(() => []) : []

  return [...itemsSim, ...itemsSearch].map((item) => {
    const insert = {
      url: item.url,
      app_id: item.appId,
      title: item.title,
      summary: item.summary,
      developer: item.developer,
      icon: item.icon,
      score: item.score,
      free: item.free,
    } as Database['public']['Tables']['store_apps']['Insert']
    return insert
  })
}

const getSimilar = async (appId: string, country = 'us') => {
  try {
    console.log('getInfo', appId)
    const res = await getAppsInfo(appId, country)
    // save in supabase
    const { error } = await supabaseClient()
      .from('store_apps')
      .upsert(res)
    if (error)
      console.log('error', error)
    // set to_get_similar to false
    const { error: error2 } = await supabaseClient()
      .from('store_apps')
      .update({ to_get_similar: false })
      .eq('app_id', appId)
    if (error2)
      console.log('error', error2)
    console.log('getSimilar', appId, res.length)
  }
  catch (e) {
    console.log('error getAppInfo', e)
    const { error } = await supabaseClient()
      .from('store_apps')
      .upsert({
        app_id: appId,
        to_get_similar: false,
        error_get_similar: JSON.stringify(e),
      })
    if (error)
      console.log('error insert', error)
  }
}

const main = async (url: URL, headers: BaseHeaders, method: string, body: any) => {
  console.log('main', method, body)
  // remove from list apps already in supabase
  if (body.appId) {
    await getSimilar(body.appId)
  }
  else if (body.countries && body.appIds) {
    // call getTop with all countries and categories
    const countries = body.countries
    const all = []
    for (const appId of body.appIds) {
      for (const country of countries)
        all.push(getSimilar(appId, country))
    }
    await Promise.all(all)
  }
  else if (body.appIds) {
    const all = []
    for (const appId of body.appIds)
      all.push(getSimilar(appId))
    await Promise.all(all)
  }
  else {
    console.log('cannot get apps', body)
  }
}
// upper is ignored during netlify generation phase
// import from here
export const handler: BackgroundHandler = async (event) => {
  try {
    const url: URL = new URL(event.rawUrl)
    console.log('queryStringParameters', event.queryStringParameters)
    const headers: BaseHeaders = { ...event.headers }
    const method: string = event.httpMethod
    const body: any = methodJson.includes(method) ? JSON.parse(event.body || '{}') : event.queryStringParameters
    await main(url, headers, method, body)
  }
  catch (e) {
    console.log('error general', e)
  }
}
