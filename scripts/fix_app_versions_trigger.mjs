// list all apps in supabase and create version unknown for each
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://***.supabase.co'
const supabaseAnonKey = '***'
export const useSupabase = () => {
  const options = {
    // const options: SupabaseClientOptions = {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  }
  return createClient(supabaseUrl, supabaseAnonKey, options)
}

const fix_apps = async () => {
  const supabase = useSupabase()

  const { data } = await supabase
    .from('apps')
    .select()
    // .eq('app_id', 'com.x_b_e.client')
    // .eq('deleted', true)

  // if (!data || !data.length) {
  //   console.error('No apps_versions found')
  //   return
  // }
  const d = new Date()
  d.setDate(d.getDate() - 5)
  const today_id = d.toISOString().slice(0, 10)
  console.log('today_id', today_id)
  const all = []
  for (const app of data) {
    all.push(supabase
      .from('app_stats')
    // .from('app_versions')
      .update({ devices_real: 1 })
      .eq('app_id', app.app_id)
      .eq('date_id', today_id)
    // .eq('id', version.id)
      .then((res) => {
        console.log('app', app.app_id)
        if (res?.error?.message)
          console.log('res', res)
      }))
  }
  await Promise.all(all)
}

fix_apps()
