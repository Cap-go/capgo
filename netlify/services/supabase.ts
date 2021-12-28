import { createClient } from '@supabase/supabase-js'
const { VITE_SUPABASE_URL, SUPABASE_ADMIN_KEY } = process.env

export const useSupabase = () => {
  const options = {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  }
  return createClient(VITE_SUPABASE_URL || '', SUPABASE_ADMIN_KEY || '', options)
}
