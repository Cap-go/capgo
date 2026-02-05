import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~/types/supabase.types'

export async function createDefaultApiKey(
  supabase: SupabaseClient<Database>,
  name: string,
) {
  return supabase.functions.invoke('apikey', {
    method: 'POST',
    body: {
      name,
      mode: 'all',
    },
  })
}
