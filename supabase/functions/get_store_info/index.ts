import { serve } from 'https://deno.land/std@0.182.0/http/server.ts'
import gplay from 'https://esm.sh/google-play-scraper?target=deno'
import type { Database } from '../_utils/supabase.types.ts'
import { getEnv, methodJson, sendRes } from '../_utils/utils.ts'
import type { BaseHeaders } from '../_utils/types.ts'
import { saveStoreInfo, supabaseAdmin } from '../_utils/supabase.ts'
import { countries } from '../_utils/gplay_categ.ts'

gplay.memoized()

const getAppInfo = async (appId: string, country = 'en') => {
  const item = await gplay.app({
    appId,
    // throttle: 10,
  })
  if (!item)
    return null
  // return upgraded
  const insert: Database['public']['Tables']['store_apps']['Insert'] = {
    url: item.url || '',
    app_id: item.appId,
    title: item.title || '',
    summary: item.summary || '',
    developer: item.developer || '',
    developer_id: item.developerId || '',
    lang: country,
    icon: item.icon || '',
    score: item.score || 0,
    free: item.free || true,
    category: item.genre || '',
    developer_email: item.developerEmail || '',
    installs: item.maxInstalls || 0,
    to_get_info: false,
  }

  return insert
}

const findLang = async (appId: string) => {
  // loop on all countries with getAppInfo until answer
  for (const country of countries) {
    try {
      const res = await getAppInfo(appId, country)
      console.log('res', res)
      return res
    }
    catch (e) {
      // console.log('error getAppInfo', e)
    }
  }
  return null
}

const getInfo = async (appId: string) => {
  try {
    console.log('getInfo', appId)
    const { data } = await supabaseAdmin()
      .from('store_apps')
      .select()
      .eq('app_id', appId)
      .single()

    const res = (!data || !data.lang) ? await findLang(appId) : await getAppInfo(appId, data.lang)
    if (!res)
      throw new Error(`no lang found ${appId}`)
    console.log('res', res)
    return [res]
  }
  catch (e) {
    console.log('error getAppInfo', e)
    const { error } = await supabaseAdmin()
      .from('store_apps')
      .upsert({
        app_id: appId,
        to_get_info: false,
        error_get_info: JSON.stringify(e),
      })
    if (error)
      console.log('error insert', error)
  }
  return []
}

const main = async (url: URL, headers: BaseHeaders, method: string, body: any) => {
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
  const all: Promise<(Database['public']['Tables']['store_apps']['Insert'])[]>[] = []
  // remove from list apps already in supabase
  if (body.appId) {
    all.push(getInfo(body.appId))
  }
  else if (body.appIds) {
    for (const appId of body.appIds)
      all.push(getInfo(appId))
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
