import { Hono } from 'hono'
import type { Context } from 'hono'
import { middlewareKey } from '../../_utils/hono.ts'
import { supabaseAdmin } from '../../_utils/supabase.ts'

export const app = new Hono()

app.post('/', middlewareKey, async (c: Context) => {
  try {
    // count allapps
    const mode = c.req.query('mode') || 'capacitor'
    const { count } = await supabaseAdmin(c)
      .from('store_apps')
      .select('*', { count: 'exact', head: true })
    const total = count || 0

    let req = supabaseAdmin(c)
      .from('store_apps')
      .select('url, title, icon, summary, installs, category')
      .order('installs', { ascending: false })
      .limit(100)
    const reqTotal = supabaseAdmin(c)
      .from('store_apps')
      .select('*', { count: 'exact', head: true })

    if (mode === 'cordova') {
      req = req.eq('cordova', true)
        .eq('capacitor', false)
      // get toal categ
      reqTotal.eq('cordova', true)
        .eq('capacitor', false)
    }
    else if (mode === 'flutter') {
      req = req.eq('flutter', true)
      // get toal categ
      reqTotal.eq('flutter', true)
    }
    else if (mode === 'reactNative') {
      req = req.eq('react_native', true)
      // get toal categ
      reqTotal.eq('react_native', true)
    }
    else if (mode === 'nativeScript') {
      req.eq('native_script', true)
      // get toal categ
      reqTotal.eq('native_script', true)
    }
    else {
      req = req.eq('capacitor', true)
      // get toal categ
      reqTotal.eq('capacitor', true)
    }

    const { data, error } = await req
    const { count: countTotal } = await reqTotal
    const totalCategory = countTotal || 0

    if (data && !error) {
      return c.json({
        apps: data || [],
        // calculate percentage usage
        usage: ((totalCategory * 100) / total).toFixed(2),
      })
    }
    console.log('Supabase error:', error)
    return c.json({
      status: 'Error unknow',
    }, 500)
  }
  catch (e) {
    return c.json({ status: 'Cannot get upload link', error: JSON.stringify(e) }, 500)
  }
})
