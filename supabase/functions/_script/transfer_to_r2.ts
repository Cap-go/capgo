import { createClient } from 'https://esm.sh/@supabase/supabase-js@^2.1.2'
import 'https://deno.land/x/dotenv/load.ts'
import type { Database } from '../_utils/supabase.types.ts'

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '***'
const supabaseAnonKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '***'
const useSupabase = () => {
  const options = {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  }
  return createClient<Database>(supabaseUrl, supabaseAnonKey, options)
}

const createAll = async () => {
  // update all app_versions
  const { error: appVersionsError } = await useSupabase()
    .from('app_versions')
    .update({ updated_at: new Date().toISOString() })
    .eq('deleted', false)
    .eq('storage_provider', 'supabase')
    .not('bucket_id', 'is', null)
  // .range(page * pageSize, (page + 1) * pageSize)

  if (appVersionsError)
    console.error(appVersionsError)
}
createAll()
