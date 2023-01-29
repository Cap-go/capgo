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

const getList = async (category = gplay.category.APPLICATION, collection = gplay.collection.TOP_FREE, limit = 1000) => {
  const res = (await gplay.list({
    category,
    collection,
    fullDetail: false,
    num: limit,
  }))
  // remove the first skip
  const ids = res.map(item => item.appId)
  console.log('ids', ids, ids.length)
  // console.log('res', res)
  // const upgraded = res.map((item, i) => {
  //   return {
  //     url: item.url,
  //     appId: item.appId,
  //     title: item.title,
  //     summary: item.summary,
  //     developer: item.developer,
  //     icon: item.icon,
  //     score: item.score,
  //     free: item.free,
  //     category,
  //     collection,
  //     rank: i + 1,
  //     developer_email: item.developerEmail,
  //     installs: item.maxInstalls,
  //   } as Database['public']['Tables']['store_apps']['Insert']
  // })
  // return upgraded
  const upgraded = res.map((item, i) => {
    console.log('item', item.appId)

    return gplay.app({ appId: item.appId })
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
        }
        return row
      })
      .catch((err) => {
        console.log('err', err)
        return {
          url: item.url,
          app_id: item.appId,
          title: item.title,
          summary: item.summary,
          developer: item.developer,
          icon: item.icon,
          score: item.score,
          free: item.free,
          category,
          collection,
          rank: i + 1,
          developer_email: '',
          installs: 0,
        } as Database['public']['Tables']['store_apps']['Insert']
      })
  })
  return await Promise.all(upgraded)
  // const enriched = await Promise.all(upgraded)
  // // filter out null
  // const filtered = enriched.filter(item => item != null)
  // return filtered
}
// getList()
const main = async (url: URL, headers: BaseHeaders, method: string, body: any) => {
  console.log('main', url, headers, method, body)
  const list = await getList(body.category, body.collection, body.limit)
  // save in supabase
  const { error } = await supabaseClient()
    .from('store_apps')
    .upsert(list)
  if (error)
    console.log('error', error)
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
