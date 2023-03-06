import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { methodJson, sendRes } from '../_utils/utils.ts'
import { supabaseAdmin } from '../_utils/supabase.ts'
import type { BaseHeaders } from '../_utils/types.ts'

interface TopStore {
  mode?: 'capacitor' | 'cordova' | 'flutter' | 'reactNative'
}

const main = async (url: URL, headers: BaseHeaders, method: string, body: TopStore) => {
  try {
    console.log('body', body)
    const req = supabaseAdmin()
      .from('store_apps')
      .select('url, title, icon, summary, installs, category')
      .order('installs', { ascending: false })
      .limit(100)

    if (body.mode === 'cordova') {
      req.eq('react_native', true)
      req.eq('flutter', false)
      req.eq('cordova', true)
      req.eq('capacitor', false)
    }
    else if (body.mode === 'flutter') {
      req.eq('react_native', false)
      req.eq('flutter', true)
      req.eq('cordova', false)
      req.eq('capacitor', false)
    }
    else if (body.mode === 'reactNative') {
      req.eq('react_native', true)
      req.eq('flutter', false)
      req.eq('cordova', false)
      req.eq('capacitor', false)
    }
    else {
      req.eq('react_native', false)
      req.eq('flutter', false)
      req.eq('cordova', true)
      req.eq('capacitor', true)
    }

    const { data, error } = await req

    if (data && !error)
      return sendRes({ apps: data || [] })
    console.log('Supabase error:', error)
    return sendRes({
      apps: 190,
      updates: 130000,
      stars: 125,
    })
  }
  catch (e) {
    return sendRes({
      status: 'Error unknow',
      error: JSON.stringify(e),
    }, 500)
  }
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
