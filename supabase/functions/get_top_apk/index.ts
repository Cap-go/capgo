import { serve } from 'https://deno.land/std@0.200.0/http/server.ts'
import gplay from 'https://esm.sh/google-play-scraper?target=deno'
import { saveStoreInfo } from '../_utils/supabase.ts'
import type { Database } from '../_utils/supabase.types.ts'
import { getEnv, methodJson, sendRes } from '../_utils/utils.ts'
import type { BaseHeaders } from '../_utils/types.ts'
import { countries } from '../_utils/gplay_categ.ts'

gplay.memoized()
async function getList(category = gplay.category.APPLICATION, collection = gplay.collection.TOP_FREE, limit = 1000, country = 'us') {
  const res = (await gplay.list({
    category,
    collection,
    fullDetail: false,
    country,
    num: limit,
    throttle: 50,
  }).catch(() => []))
  const upgraded = res.map((item: any) => {
    const row: Database['public']['Tables']['store_apps']['Insert'] = {
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
      category,
    }
    return row
  })
  return upgraded
}

async function getTop(category = gplay.category.APPLICATION, country = 'us', collection = gplay.collection.TOP_FREE, limit = 1000) {
  try {
    // console.log('getTop', category, country, collection)
    const res = await getList(category, collection, limit, country)
    if (!res.length)
      return []
    // set to_get_similar to false
    console.log('getTop', category, country, collection, res.length)
    return res
  }
  catch (e) {
    console.log('error getTop', e)
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
  const all: Promise<(Database['public']['Tables']['store_apps']['Insert'])[]>[] = []
  // console.log('main', url, headers, method, body)
  if (body.countries && body.categories) {
    // call getTop with all countries and categories
    for (const country of body.countries) {
      for (const category of body.categories)
        all.push(getTop(category, country, body.collection, body.limit))
    }
  }
  else if (body.categories) {
    // call getTop with all countries and categories
    for (const country of countries) {
      for (const category of body.categories)
        all.push(getTop(category, country, body.collection, body.limit))
    }
  }
  else {
    for (const country of countries)
      all.push(getTop(body.category, country, body.collection, body.limit))
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
