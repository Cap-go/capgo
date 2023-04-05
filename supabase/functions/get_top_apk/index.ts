import { serve } from 'https://deno.land/std@0.182.0/http/server.ts'
import gplay from 'https://esm.sh/google-play-scraper?target=deno'
import { supabaseAdmin } from '../_utils/supabase.ts'
import type { Database } from '../_utils/supabase.types.ts'
import { getEnv, methodJson, sendRes } from '../_utils/utils.ts'
import type { BaseHeaders } from '../_utils/types.ts'

gplay.memoized()
const getList = async (category = gplay.category.APPLICATION, collection = gplay.collection.TOP_FREE, limit = 1000, country = 'us') => {
  const res = (await gplay.list({
    category,
    collection,
    fullDetail: false,
    country,
    num: limit,
  }))
  // remove the first skip
  const ids = res.map((item: any) => item.appId)
  // console.log('ids', ids.length, ids)
  const { data, error } = await supabaseAdmin()
    .from('store_apps')
    .select('app_id')
    .in('app_id', ids)
  if (error) {
    console.log('error', error)
    return []
  }
  // use data to filter res
  const filtered = res.filter((item: any) => !data?.find((row: { app_id: string }) => row.app_id === item.appId))
  console.log('filtered', filtered.length, filtered)
  const upgraded = filtered.map((item: any) => {
    // console.log('item', item.appId)
    // check if already exist in db and skip
    return gplay.app({ appId: item.appId, country })
      .then((res: any) => {
        const row: Database['public']['Tables']['store_apps']['Insert'] = {
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
          category,
          developer_email: res.developerEmail,
          installs: res.maxInstalls,
          to_get_info: false,
        }
        return row
      })
      .catch((err: any) => {
        console.log('err', err)
        const row: Database['public']['Tables']['store_apps']['Insert'] = {
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
          category,
          developer_email: '',
          installs: 0,
          to_get_info: false,
          error_get_info: err.message,
        }
        return row
      })
  })
  return await Promise.all(upgraded)
}

const getTop = async (category = gplay.category.APPLICATION, country: string, collection = gplay.collection.TOP_FREE, limit = 1000) => {
  const list = await getList(category, collection, limit, country)
  console.log('getTop', category, country, collection, list.length)
  // save in supabase
  const { error } = await supabaseAdmin()
    .from('store_apps')
    .upsert(list)
  if (error)
    console.log('error', error)
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

  // console.log('main', url, headers, method, body)
  if (body.country && body.category) {
    await getTop(body.category, body.country, body.collection, body.limit)
  }
  else if (body.countries && body.categories) {
    // call getTop with all countries and categories
    const countries = body.countries
    const categories = body.categories
    const all = []
    for (const country of countries) {
      for (const category of categories)
        all.push(getTop(category, country, body.collection, body.limit))
    }
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
