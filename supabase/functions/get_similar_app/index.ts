import { serve } from 'https://deno.land/std@0.182.0/http/server.ts'
import gplay from 'https://esm.sh/google-play-scraper?target=deno'
import { supabaseAdmin } from '../_utils/supabase.ts'
import type { Database } from '../_utils/supabase.types.ts'
import { getEnv, methodJson, sendRes } from '../_utils/utils.ts'
import type { BaseHeaders } from '../_utils/types.ts'

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
      developer_id: item.developerId,
      lang: country,
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
    const { error } = await supabaseAdmin()
      .from('store_apps')
      .upsert(res)
    if (error)
      console.log('error', error)
    // set to_get_similar to false
    const { error: error2 } = await supabaseAdmin()
      .from('store_apps')
      .update({ to_get_similar: false })
      .eq('app_id', appId)
    if (error2)
      console.log('error', error2)
    console.log('getSimilar', appId, res.length)
  }
  catch (e) {
    console.log('error getAppInfo', e)
    const { error } = await supabaseAdmin()
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
  const API_SECRET = getEnv('API_SECRET')
  const authorizationSecret = headers.apisecret
  if (!authorizationSecret)
    return sendRes({ status: 'Cannot find authorization secret' }, 400)

  if (!authorizationSecret || !API_SECRET || authorizationSecret !== API_SECRET) {
    console.error('Fail Authorization', { authorizationSecret, API_SECRET })
    return sendRes({ message: 'Fail Authorization', authorizationSecret }, 400)
  }

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
    return sendRes({ status: 'Error', error: 'cannot get apps' }, 500)
  }
  return sendRes()
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
