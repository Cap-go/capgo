// list all apps in supabase and create version unknown for each
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://***.supabase.co'
const supabaseAnonKey = '***'

export const useSupabase = () => {
  const options = {
    // const options: SupabaseClientOptions = {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  }
  return createClient(supabaseUrl, supabaseAnonKey, options)
}

const fix_apps = async () => {
  const supabase = useSupabase()

  const { data } = await supabase
    .from('apps')
    // .from('apps')
    .select()

  if (!data || !data.length) {
    console.error('No apps found')
    return
  }

  for (const app of data) {
    console.log('app', app.app_id)
    const { data } = await supabase
      .from('app_versions')
      // .from('app_versions')
      .select()
      .eq('app_id', app.app_id)
      .eq('name', 'unknown')
      .single()
    if (!data) {
      const { error: dbVersionUError } = await supabase
        .from('app_versions')
      // .from('app_versions')
        .insert({
          user_id: app.user_id,
          deleted: true,
          name: 'unknown',
          app_id: app.app_id,
        }, { returning: 'minimal' })
      if (dbVersionUError)
        console.log('Cannot create version unknown', app.app_id, dbVersionUError)
    }
    const { data: data2 } = await supabase
      .from('app_versions')
      // .from('app_versions')
      .select()
      .eq('app_id', app.app_id)
      .eq('name', 'builtin')
      .single()
    if (!data2) {
      const { error: dbVersionUError } = await supabase
        .from('app_versions')
      // .from('app_versions')
        .insert({
          user_id: app.user_id,
          deleted: true,
          name: 'builtin',
          app_id: app.app_id,
        }, { returning: 'minimal' })
      if (dbVersionUError)
        console.log('Cannot create version unknown', app.app_id, dbVersionUError)
    }
  }
}

fix_apps()
