import { serve } from 'https://deno.land/std@0.180.0/http/server.ts'
import { methodJson, sendRes } from '../_utils/utils.ts'
import { supabaseAdmin } from '../_utils/supabase.ts'
import type { BaseHeaders } from '../_utils/types.ts'

interface TopStore {
  mode?: 'capacitor' | 'cordova' | 'flutter' | 'reactNative' | 'nativeScript'
}

const main = async (url: URL, headers: BaseHeaders, method: string, body: TopStore) => {
  try {
    console.log('body', body)
    // count allapps
    const { count } = await supabaseAdmin()
      .from('store_apps')
      .select('*', { count: 'exact', head: true })
    const total = count || 0

    const req = supabaseAdmin()
      .from('store_apps')
      .select('url, title, icon, summary, installs, category')
      .order('installs', { ascending: false })
      .limit(100)
    const reqTotal = supabaseAdmin()
      .from('store_apps')
      .select('*', { count: 'exact', head: true })

    if (body.mode === 'cordova') {
      req.eq('cordova', true)
        .eq('capacitor', false)
      // get toal categ
      reqTotal.eq('cordova', true)
        .eq('capacitor', false)
    }
    else if (body.mode === 'flutter') {
      req.eq('flutter', true)
      // get toal categ
      reqTotal.eq('flutter', true)
    }
    else if (body.mode === 'reactNative') {
      req.eq('react_native', true)
      // get toal categ
      reqTotal.eq('react_native', true)
    }
    else if (body.mode === 'nativeScript') {
      req.eq('native_script', true)
      // get toal categ
      reqTotal.eq('native_script', true)
    }
    else {
      req.eq('capacitor', true)
      // get toal categ
      reqTotal.eq('capacitor', true)
    }

    const { data, error } = await req
    const { count: countTotal } = await reqTotal
    const totalCategory = countTotal || 0

    if (data && !error) {
      return sendRes({
        apps: data || [],
        // calculate percentage usage
        usage: ((totalCategory * 100) / total).toFixed(2),
      })
    }
    console.log('Supabase error:', error)
    return sendRes({
      status: 'Error unknow',
    }, 500)
  }
  catch (e) {
    console.log('Error:', e)
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
