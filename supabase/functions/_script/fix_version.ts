import { createClient } from 'https://esm.sh/@supabase/supabase-js@^2.1.2'
import 'https://deno.land/x/dotenv/load.ts'
import type { Database } from '../_utils/supabase.types.ts'

// deno run  --allow-env --allow-read --allow-net  functions/_script/fix_version.ts

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '***'
const supabaseAnonKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '***'

const useSupabase = () => {
  const options = {
    // const options: SupabaseClientOptions = {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  }
  return createClient<Database>(supabaseUrl, supabaseAnonKey, options)
}
// get all users from supabase
const main = async () => {
// list all app_versions with deleted true get all pages
  const app_versions: any = []
  let continueLoop = true
  let page = 0
  while (continueLoop) {
    const { data, error } = await useSupabase()
      .from('app_versions')
      .select('id')
      .eq('deleted', true)
      .range(page * 1000, (page + 1) * 1000)
    if (error) {
      console.log('Error', error)
      return
    }
    if (data)
      app_versions.push(...data)

    if (data && data.length < 1000)
      continueLoop = false
    console.log('page', page, 'count', data.length)
    page++
  }

  console.log('app_versions', app_versions.length)
  // find all app_versions_meta with app_version_id and update size: 0
  await useSupabase()
    .from('app_versions_meta')
    .update({
      size: 0,
    })
    .in('app_version_id', app_versions.map((v: any) => v.id))
}

main()
