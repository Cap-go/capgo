/// <reference lib="deno.ns" />
import { createClient } from 'https://esm.sh/@supabase/supabase-js'
import type { Database } from '../_backend/utils/supabase.types.ts'

const supabaseUrl = 'https://xvwzpoazmxkqosrdewyv.supabase.co'
const supabaseAnonRole = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh2d3pwb2F6bXhrcW9zcmRld3l2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MDgwNzAyNzUsImV4cCI6MjAyMzY0NjI3NX0.snaF6idn1toeFB4oN7Gax1e0OfiPjDO28ep91SYbkKA'

async function main() {
  const supabase = createClient<Database>(supabaseUrl, supabaseAnonRole, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  })
  const { data } = await supabase
  .storage
  .from('images')
  .list('006350f3-2c63-4264-a172-4c4b01f95cbc', {
    limit: 100,
    offset: 0,
    sortBy: { column: 'name', order: 'asc' },
  })
  console.log('data', data)
  const { data: d1 } = await supabase.storage.from('images').getPublicUrl('006350f3-2c63-4264-a172-4c4b01f95cbc/com.passiveinvesting.twentyfourhourpickleball/icon_a1f6b93d-0d68-4785-bcf6-442b4fe169f5')
  console.log(d1.publicUrl)
}

await main()
