import type { BaseHeaders } from 'supabase/functions/_utils/types'
import type { BackgroundHandler } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'
import gplay from 'google-play-scraper'
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
  return createClient<Database>(process.env.SUPABASE_URL || '', process.env.SUPABASE_ANON_KEY || '', options)
}

const getAppsInfo = async (appId: string) => {
  const items = await gplay.similar({ appId })

  return items.map((item) => {
    const insert = {
      app_id: item.appId,
    } as Database['public']['Tables']['store_apps']['Insert']
    return insert
  })
}

const main = async (url: URL, headers: BaseHeaders, method: string, body: any) => {
  console.log('main', url, headers, method, body)
  // remove from list apps already in supabase
  try {
    const res = await getAppsInfo(body.appId)
    // save in supabase
    const { error } = await supabaseClient()
      .from('store_apps')
      .upsert(res)
    if (error)
      console.log('error', error)
  }
  catch (e) {
    console.log('error getAppInfo', e)
    const { error } = await supabaseClient()
      .from('store_apps')
      .upsert({
        app_id: body.appId,
        to_get_similar: false,
        error_get_similar: JSON.stringify(e),
      })
    if (error)
      console.log('error insert', error)
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
    console.log('error general', e)
  }
}
