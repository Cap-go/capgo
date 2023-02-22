import type { BaseHeaders } from 'supabase/functions/_utils/types'
import type { BackgroundHandler } from '@netlify/functions'
import gplay from 'google-play-scraper'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '~/types/supabase.types'

export const methodJson = ['POST', 'PUT', 'PATCH']

export const supabaseClient = () => {
  const options = {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  }
  return createClient<Database>(process.env.SUPABASE_URL || '', process.env.SUPABASE_SERVICE_ROLE_KEY || '', options)
}

const getList = async (category = gplay.category.APPLICATION, collection = gplay.collection.TOP_FREE, limit = 1000, country = 'us') => {
  const res = (await gplay.list({
    category,
    collection,
    fullDetail: false,
    country,
    num: limit,
  }))
  // remove the first skip
  const ids = res.map(item => item.appId)
  console.log('ids', ids, ids.length)
  const { data, error } = await supabaseClient()
    .from('store_apps')
    .select('app_id')
    .in('app_id', ids)
  if (error) {
    console.log('error', error)
    return []
  }
  // use data to filter res
  const filtered = res.filter(item => !data?.find((row: { app_id: string }) => row.app_id === item.appId))
  const upgraded = filtered.map((item) => {
    // console.log('item', item.appId)
    // check if already exist in db and skip
    return gplay.app({ appId: item.appId, country })
      .then((res) => {
        const row: Database['public']['Tables']['store_apps']['Insert'] = {
          url: item.url,
          app_id: item.appId,
          title: item.title,
          summary: item.summary,
          developer: item.developer,
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
      .catch((err) => {
        console.log('err', err)
        const row: Database['public']['Tables']['store_apps']['Insert'] = {
          url: item.url,
          app_id: item.appId,
          title: item.title,
          summary: item.summary,
          developer: item.developer,
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
  // save in supabase
  const { error } = await supabaseClient()
    .from('store_apps')
    .upsert(list)
  if (error)
    console.log('error', error)
}

const main = async (url: URL, headers: BaseHeaders, method: string, body: any) => {
  console.log('main', url, headers, method, body)
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
  }
}
// upper is ignored during netlify generation phase
// import from here
export const handler: BackgroundHandler = async (event) => {
  try {
    const url: URL = new URL(event.rawUrl)
    console.log('queryStringParameters', event.queryStringParameters)
    const headers: BaseHeaders = { ...event.headers }
    const method: string = event.httpMethod
    const body: any = methodJson.includes(method) ? JSON.parse(event.body || '{}') : event.queryStringParameters
    await main(url, headers, method, body)
  }
  catch (e) {
    console.log('error', e)
  }
}
