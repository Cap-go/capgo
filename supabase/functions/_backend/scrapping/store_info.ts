import type { Context } from '@hono/hono'
import gplay from 'google-play-scraper'
import { Hono } from 'hono/tiny'
import { bulkUpdateStoreAppsCF, getStoreAppByIdCF, saveStoreInfoCF } from '../utils/cloudflare.ts'
import { countries } from '../utils/gplay_categ.ts'
import { BRES, middlewareAPISecret } from '../utils/hono.ts'

export const app = new Hono()

interface AppInfo {
  appId?: string
  appIds?: string[]
}

gplay.memoized()

async function getAppInfo(appId: string, country = 'en') {
  // IOS: https://itunes.apple.com/lookup?bundleId=APP_ID
  // ANDROID: https://play.google.com/store/apps/details?id=APP_ID
  const item = await gplay.app({
    appId,
    // throttle: 50,
  })
  if (!item)
    return null
  // return upgraded
  const insert: any = {
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

async function findLang(c: Context, appId: string) {
  // loop on all countries with getAppInfo until answer
  for (const country of countries) {
    try {
      const res = await getAppInfo(appId, country)
      console.log({ requestId: c.get('requestId'), context: 'res', res })
      return res
    }
    catch (e) {
      console.log({ requestId: c.get('requestId'), context: 'error getAppInfo', error: e })
    }
  }
  return null
}

async function getInfo(c: Context, appId: string) {
  try {
    // console.log(c.get('requestId'), 'getInfo', appId)
    const data = await getStoreAppByIdCF(c, appId)

    const res = (!data || !data.lang) ? await findLang(c, appId) : await getAppInfo(appId, data.lang)
    if (!res) {
      console.error({ requestId: c.get('requestId'), context: 'no lang found', appId })
      await saveStoreInfoCF(c, {
        app_id: appId,
        to_get_info: false,
      })
      return []
    }
    console.log({ requestId: c.get('requestId'), context: 'getInfo', appId, res })
    return [res]
  }
  catch (e) {
    console.error({ requestId: c.get('requestId'), context: 'error getAppInfo', error: e })
    await saveStoreInfoCF(c, {
      app_id: appId,
      to_get_info: false,
    })
  }
  return []
}

app.post('/', middlewareAPISecret, async (c: Context) => {
  try {
    const body = await c.req.json<AppInfo>()
    const all: Promise<(any)[]>[] = []
    // remove from list apps already in supabase
    if (body.appId) {
      all.push(getInfo(c, body.appId))
    }
    else if (body.appIds) {
      for (const appId of body.appIds)
        all.push(getInfo(c, appId))
    }
    else {
      console.log({ requestId: c.get('requestId'), context: 'cannot get apps', body })
      return c.json({ status: 'Error', error: 'cannot get apps' }, 500)
    }
    const toSave = await Promise.all(all)
    const flattenToSave = toSave.flat()
    await bulkUpdateStoreAppsCF(c, flattenToSave)
    return c.json(BRES)
  }
  catch (e) {
    return c.json({ status: 'Cannot invalidate cache', error: JSON.stringify(e) }, 500)
  }
})
