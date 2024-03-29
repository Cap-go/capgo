import { Hono } from 'hono/tiny'
import type { Context } from 'hono'
import gplay from 'google-play-scraper'
import { BRES, middlewareAPISecret } from '../utils/hono.ts'
import type { Database } from '../utils/supabase.types.ts'
import { countries } from '../utils/gplay_categ.ts'
import { bulkUpdateStoreApps, saveStoreInfo } from '../utils/clickhouse.ts'

export const app = new Hono()

interface AppInfo {
  appId?: string
  appIds?: string[]
  countries?: string[]
}

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

async function getSimilar(c: Context, appId: string, country = 'us') {
  try {
    // console.log('getSimilar', appId, country)
    const res = await getAppsInfo(appId, country)
    if (!res.length)
      return []
    // set to_get_similar to false
    await saveStoreInfo(c, {
      app_id: appId,
      to_get_similar: false,
    })
    console.log('getSimilar', appId, country, res.length)
    return res
  }
  catch (e) {
    console.log('error getAppInfo', e)
    await saveStoreInfo(c, {
      app_id: appId,
      to_get_similar: false,
      error_get_similar: JSON.stringify(e),
    })
  }
  return []
}

app.post('/', middlewareAPISecret, async (c: Context) => {
  try {
    const body = await c.req.json<AppInfo>()
    // remove from list apps already in supabase
    const all: Promise<(Database['public']['Tables']['store_apps']['Insert'])[]>[] = []
    if (body.appId) {
      for (const country of countries)
        all.push(getSimilar(c, body.appId, country))
    }
    else if (body.countries && body.appIds) {
      // call getTop with all countries and categories
      for (const appId of body.appIds) {
        for (const country of body.countries)
          all.push(getSimilar(c, appId, country))
      }
    }
    else if (body.appIds) {
      for (const appId of body.appIds) {
        for (const country of countries)
          all.push(getSimilar(c, appId, country))
      }
    }
    else {
      console.log('cannot get apps', body)
      return c.json({ status: 'Cannot get apps' }, 400)
    }
    const toSave = await Promise.all(all)
    const flattenToSave = toSave.flat()
    await bulkUpdateStoreApps(c, flattenToSave)
    return c.json(BRES)
  }
  catch (e) {
    return c.json({ status: 'Cannot get similar apps', error: JSON.stringify(e) }, 500)
  }
})
