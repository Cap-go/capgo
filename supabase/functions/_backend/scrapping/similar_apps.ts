import gplay from 'google-play-scraper'
import { Hono } from 'hono/tiny'
import type { Context } from '@hono/hono'
import { bulkUpdateStoreAppsCF, saveStoreInfoCF } from '../utils/cloudflare.ts'
import { countries } from '../utils/gplay_categ.ts'
import { BRES, middlewareAPISecret } from '../utils/hono.ts'

export const app = new Hono()

interface AppInfo {
  appId?: string
  appIds?: string[]
  countries?: string[]
}

async function getAppsInfo(appId: string, country: string): Promise<(any)[]> {
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
    const insert: any = {
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
    // console.log(c.get('requestId'), 'getSimilar', appId, country)
    const res = await getAppsInfo(appId, country)
    if (!res.length)
      return []
    // set to_get_similar to false
    await saveStoreInfoCF(c, {
      app_id: appId,
      to_get_similar: false,
    })
    console.log({ requestId: c.get('requestId'), context: 'getSimilar', id: appId, country, length: res.length })
    return res
  }
  catch (e) {
    console.log({ requestId: c.get('requestId'), context: 'error getAppInfo', error: e })
    await saveStoreInfoCF(c, {
      app_id: appId,
      to_get_similar: false,
    })
  }
  return []
}

app.post('/', middlewareAPISecret, async (c: Context) => {
  try {
    const body = await c.req.json<AppInfo>()
    // remove from list apps already in supabase
    const all: Promise<(any)[]>[] = []
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
      console.log({ requestId: c.get('requestId'), context: 'cannot get apps', body })
      return c.json({ status: 'Cannot get apps' }, 400)
    }
    const toSave = await Promise.all(all)
    const flattenToSave = toSave.flat()
    await bulkUpdateStoreAppsCF(c, flattenToSave)
    return c.json(BRES)
  }
  catch (e) {
    return c.json({ status: 'Cannot get similar apps', error: JSON.stringify(e) }, 500)
  }
})
