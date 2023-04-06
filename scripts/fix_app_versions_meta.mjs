// list all apps in supabase and create version unknown for each
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://***.supabase.co'
const supabaseAnonKey = '***'
export function useSupabase() {
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

async function fix_apps() {
  const supabase = useSupabase()

  const { data } = await supabase
    .from('app_versions')
    .select()
    // .eq('app_id', 'com.x_b_e.client')
    .eq('deleted', true)

  if (!data || !data.length) {
    console.error('No apps_versions found')
    return
  }

  const all = []
  for (const version of data) {
    all.push(supabase
      .from('app_versions_meta')
      // .from('app_versions')
      .update({ size: 0 })
      .eq('app_id', version.app_id)
      .eq('id', version.id).then((res) => {
        console.log('versions', version.app_id, version.id)
        if (res?.error?.message)
          console.log('res', res)
      }))
  }
  await Promise.all(all)
}

fix_apps()
