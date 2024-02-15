import { Hono } from 'hono'
import type { Context } from 'hono'
import gplay from 'google-play-scraper'
import { BRES, middlewareAPISecret } from '../../utils/hono.ts'
import type { Database } from '../../utils/supabase.types.ts'
import { saveStoreInfo, supabaseAdmin } from '../../utils/supabase.ts'
import { countries } from '../../utils/gplay_categ.ts'

export const app = new Hono()

interface AppInfo {
  appId?: string
  appIds?: string[]
}

gplay.memoized()

async function getAppInfo(appId: string, country = 'en') {
  const item = await gplay.app({
    appId,
    // throttle: 50,
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

async function findLang(appId: string) {
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

async function getInfo(c: Context, appId: string) {
  try {
    // console.log('getInfo', appId)
    const { data } = await supabaseAdmin(c)
      .from('store_apps')
      .select()
      .eq('app_id', appId)
      .single()

    const res = (!data || !data.lang) ? await findLang(appId) : await getAppInfo(appId, data.lang)
    if (!res) {
      console.error('no lang found', appId)
      await supabaseAdmin(c)
        .from('store_apps')
        .upsert({
          app_id: appId,
          to_get_info: false,
          error_get_info: 'no lang found',
        })
      return []
    }
    console.log('getInfo', appId, res)
    return [res]
  }
  catch (e) {
    console.log('error getAppInfo', e)
    const { error } = await supabaseAdmin(c)
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

app.post('/', middlewareAPISecret, async (c: Context) => {
  try {
    const body = await c.req.json<AppInfo>()
    const all: Promise<(Database['public']['Tables']['store_apps']['Insert'])[]>[] = []
    // remove from list apps already in supabase
    if (body.appId) {
      all.push(getInfo(c, body.appId))
    }
    else if (body.appIds) {
      for (const appId of body.appIds)
        all.push(getInfo(c, appId))
    }
    else {
      console.log('cannot get apps', body)
      return c.json({ status: 'Error', error: 'cannot get apps' }, 500)
    }
    const toSave = await Promise.all(all)
    const flattenToSave = toSave.flat()
    await saveStoreInfo(c, flattenToSave)
    return c.json(BRES)
  }
  catch (e) {
    return c.json({ status: 'Cannot invalidate cache', error: JSON.stringify(e) }, 500)
  }
})
