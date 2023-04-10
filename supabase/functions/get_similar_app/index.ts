import { serve } from 'https://deno.land/std@0.182.0/http/server.ts'
import gplay from 'https://esm.sh/google-play-scraper?target=deno'
import { saveStoreInfo, supabaseAdmin } from '../_utils/supabase.ts'
import type { Database } from '../_utils/supabase.types.ts'
import { getEnv, methodJson, sendRes } from '../_utils/utils.ts'
import type { BaseHeaders } from '../_utils/types.ts'
import { countries } from '../_utils/gplay_categ.ts'

gplay.memoized()

async function getAppsInfo(appId: string, country: string): Promise<(Database['public']['Tables']['store_apps']['Insert'])[]> {
  const { title } = await gplay.app({
    appId,
    // throttle: 50,
  }).catch(() => ({ title: '' }))
  if (!title)
    return []

  const itemsSim = await gplay.similar({
    appId,
    num: 250,
    country,
    // throttle: 10,
  }).catch(() => [])
  const itemsSearch = title ? await gplay.search({ term: title, num: 250, country }).catch(() => []) : []

  return [...itemsSim, ...itemsSearch].map((item) => {
    const insert: Database['public']['Tables']['store_apps']['Insert'] = {
      url: item.url || '',
      app_id: item.appId,
      title: item.title || '',
      summary: item.summary || '',
      developer: item.developer || '',
      developer_id: item.developerId || '',
      lang: country || '',
      icon: item.icon || '',
      score: item.score || 0,
      free: item.free || true,
    }
    return insert
  })
}

async function getSimilar(appId: string, country = 'us') {
  try {
    // console.log('getSimilar', appId, country)
    const res = await getAppsInfo(appId, country)
    if (!res.length)
      return []
    // set to_get_similar to false
    const { error: error2 } = await supabaseAdmin()
      .from('store_apps')
      .update({ to_get_similar: false })
      .eq('app_id', appId)
    if (error2)
      console.log('error', error2)
    console.log('getSimilar', appId, country, res.length)
    return res
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
  return []
}

async function main(url: URL, headers: BaseHeaders, method: string, body: any) {
  const API_SECRET = getEnv('API_SECRET')
  const authorizationSecret = headers.apisecret
  if (!authorizationSecret) {
    console.error('Fail Authorization', headers)
    return sendRes({ status: 'Cannot find authorization secret' }, 400)
  }
  if (!authorizationSecret || !API_SECRET || authorizationSecret !== API_SECRET) {
    console.error('Fail Authorization', { authorizationSecret, API_SECRET })
    return sendRes({ message: 'Fail Authorization', authorizationSecret }, 400)
  }

  console.log('main', method, body)
  // remove from list apps already in supabase
  const all: Promise<(Database['public']['Tables']['store_apps']['Insert'])[]>[] = []
  if (body.appId) {
    for (const country of countries)
      all.push(getSimilar(body.appId, country))
  }
  else if (body.countries && body.appIds) {
    // call getTop with all countries and categories
    for (const appId of body.appIds) {
      for (const country of body.countries)
        all.push(getSimilar(appId, country))
    }
  }
  else if (body.appIds) {
    for (const appId of body.appIds) {
      for (const country of countries)
        all.push(getSimilar(appId, country))
    }
  }
  else {
    console.log('cannot get apps', body)
    return sendRes({ status: 'Error', error: 'cannot get apps' }, 500)
  }
  const toSave = await Promise.all(all)
  const flattenToSave = toSave.flat()
  await saveStoreInfo(flattenToSave)
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
