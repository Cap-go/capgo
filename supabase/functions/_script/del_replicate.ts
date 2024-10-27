
import { createClient } from 'https://esm.sh/@supabase/supabase-js'
import type { Database } from '../_backend/utils/supabase.types.ts'

const supabaseUrl = 'https://xvwzpoazmxkqosrdewyv.supabase.co'
const supabaseServiceRole = '***'
const ids = []

async function main() {

  // find id who are not in supabase
  const supabase = createClient<Database>(supabaseUrl, supabaseServiceRole, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  })
  const idsFound = await Promise.all(ids.map(async (obj) => {
    const { error } = await supabase.from('devices_override').select('id').eq('id', obj.id).single()
    if (error) {
      console.error(error)
      return obj.id
    }
    return null
  }))

  const idsNotFound = idsFound.filter((id) => !!id)
  console.log('idsNotFound', idsNotFound)
}
await main()
