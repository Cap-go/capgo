// list all apps in supabase and create version unknown for each
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://****.supabase.co'
// anonymous
const supabaseKey = '***'
// admin

export function useSupabase() {
  const options = {
    // db: {
    //   schema: 'clickhouse',
    // },
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  }
  return createClient(supabaseUrl, supabaseKey, options)
}

async function test() {
  const supabase = useSupabase()

  const { data } = await supabase
    .from('clickhouse_stats2')
    .select()

  if (!data || !data.length) {
    console.error('No stats found')
    return
  }

  console.log('data', data)
}

test()
