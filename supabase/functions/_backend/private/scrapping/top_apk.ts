import { Hono } from 'hono'
import type { Context } from 'hono'
import gplay from 'google-play-scraper'
import { BRES, middlewareAPISecret } from '../../_utils/hono.ts'
import { saveStoreInfo } from '../../_utils/supabase.ts';
import { Database } from '../../_utils/supabase.types.ts';
import { countries } from '../../_utils/gplay_categ.ts';

export const app = new Hono()

interface TopApk {
  countries?: string[]
  categories?: gplay.category[]
  category?: gplay.category
  collection: gplay.collection
  limit: number
}

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

app.post('/', middlewareAPISecret, async (c: Context) => {
  try {
    const body = await c.req.json<TopApk>()
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
    await saveStoreInfo(c, flattenToSave)
    return c.json(BRES)
  }
  catch (e) {
    return c.json({ status: 'Cannot Find top APK', error: JSON.stringify(e) }, 500)
  }
})
