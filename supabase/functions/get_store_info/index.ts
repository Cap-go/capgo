import { serve } from 'https://deno.land/std@0.179.0/http/server.ts'
import gplay from 'https://esm.sh/google-play-scraper?target=deno'
import type { Database } from '../_utils/supabase.types.ts'
import { getEnv, methodJson, sendRes } from '../_utils/utils.ts'
import type { BaseHeaders } from '../_utils/types.ts'
import { supabaseAdmin } from '../_utils/supabase.ts'

export const countries = [
  'af', 'ax', 'al', 'dz', 'as', 'ad', 'ao', 'ai', 'aq', 'ag', 'ar', 'am', 'aw', 'au', 'at', 'az', 'bh', 'bs', 'bd', 'bb', 'by', 'be', 'bz', 'bj', 'bm', 'bt', 'bo', 'bq', 'ba', 'bw', 'bv', 'br', 'io', 'bn', 'bg', 'bf', 'bi', 'kh', 'cm', 'ca', 'cv', 'ky', 'cf', 'td', 'cl', 'cn', 'cx', 'cc', 'co', 'km', 'cg', 'cd', 'ck', 'cr', 'ci', 'hr', 'cu', 'cw', 'cy', 'cz', 'dk', 'dj', 'dm', 'do', 'ec', 'eg', 'sv', 'gq', 'er', 'ee', 'et', 'fk', 'fo', 'fj', 'fi', 'fr', 'gf', 'pf', 'tf', 'ga', 'gm', 'ge', 'de', 'gh', 'gi', 'gr', 'gl', 'gd', 'gp', 'gu', 'gt', 'gg', 'gn', 'gw', 'gy', 'ht', 'hm', 'va', 'hn', 'hk', 'hu', 'is', 'in', 'id', 'ir', 'iq', 'ie', 'im', 'il', 'it', 'jm', 'jp', 'je', 'jo', 'kz', 'ke', 'ki', 'kp', 'kr', 'kw', 'kg', 'la', 'lv', 'lb', 'ls',
  'lr', 'ly', 'li', 'lt', 'lu', 'mo', 'mk', 'mg', 'mw', 'my', 'mv', 'ml', 'mt', 'mh', 'mq', 'mr', 'mu', 'yt', 'mx', 'fm', 'md', 'mc', 'mn', 'me', 'ms', 'ma', 'mz', 'mm', 'na', 'nr', 'np', 'nl', 'nc', 'nz', 'ni', 'ne', 'ng', 'nu', 'nf', 'mp', 'no', 'om', 'pk', 'pw', 'ps', 'pa', 'pg', 'py', 'pe', 'ph', 'pn', 'pl', 'pt', 'pr', 'qa', 're', 'ro', 'ru', 'rw', 'bl', 'sh', 'kn', 'lc', 'mf', 'pm', 'vc', 'ws', 'sm', 'st', 'sa', 'sn', 'rs', 'sc', 'sl', 'sg', 'sx', 'sk', 'si', 'sb', 'so', 'za', 'gs', 'ss', 'es', 'lk', 'sd', 'sr', 'sj', 'sz', 'se', 'ch', 'sy', 'tw', 'tj', 'tz', 'th', 'tl', 'tg', 'tk', 'to', 'tt', 'tn', 'tr', 'tm', 'tc', 'tv', 'ug', 'ua', 'ae', 'gb', 'us', 'um', 'uy', 'uz', 'vu', 've', 'vn', 'vg', 'vi', 'wf', 'eh', 'ye', 'zm', 'zw',
]

const getAppInfo = async (appId: string, country = 'en') => {
  const item = await gplay.app({ appId })
  // return upgraded
  const insert: Database['public']['Tables']['store_apps']['Insert'] = {
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
    category: item.genre,
    developer_email: item.developerEmail,
    installs: item.maxInstalls,
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

    const res = !data || !data.lang ? await findLang(appId) : await getAppInfo(appId, data.lang)
    if (!res)
      throw new Error(`no lang found ${appId}`)
    console.log('res', res)
    // save in supabase
    const { error } = await supabaseAdmin()
      .from('store_apps')
      .upsert(res)
    if (error)
      console.log('error', error)
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
    await getInfo(body.appId)
  }
  else if (body.appIds) {
    const all = []
    for (const appId of body.appIds)
      all.push(getInfo(appId))
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
