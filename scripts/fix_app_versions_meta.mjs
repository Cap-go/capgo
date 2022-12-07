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
    .from('app_versions')
    .select()
    .eq('deleted', true)

  if (!data || !data.length) {
    console.error('No apps_versions found')
    return
  }

  for (const version of data) {
    console.log('versions', version.app_id)
    await supabase
      .from('app_version_meta')
      // .from('app_versions')
      .update({ size: 0 })
      .eq('app_id', version.app_id)
      .eq('version_id', version.id)
      .single()
  }
}

fix_apps()
