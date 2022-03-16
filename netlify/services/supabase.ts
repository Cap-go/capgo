import { createClient } from '@supabase/supabase-js'
import type { definitions } from '~/types/supabase'
const { VITE_SUPABASE_URL, SUPABASE_ADMIN_KEY } = process.env

export const useSupabase = () => {
  const options = {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  }
  return createClient(VITE_SUPABASE_URL || '', SUPABASE_ADMIN_KEY || '', options)
}

export const updateOrCreateVersion = async(update: Partial<definitions['app_versions']>) => {
  const supabase = useSupabase()
  console.log('updateOrCreateVersion', update)
  const { data, error } = await supabase
    .from<definitions['app_versions']>('app_versions')
    .select()
    .eq('app_id', update.app_id)
    .eq('name', update.name)
  if (data && data.length && !error) {
    return supabase
      .from<definitions['app_versions']>('app_versions')
      .update(update)
      .eq('app_id', update.app_id)
      .eq('name', update.name)
  }
  else {
    return supabase
      .from<definitions['app_versions']>('app_versions')
      .insert(update)
  }
}

export const updateOrCreateChannel = async(update: Partial<definitions['channels']>) => {
  const supabase = useSupabase()
  console.log('updateOrCreateChannel', update)
  const { data, error } = await supabase
    .from<definitions['channels']>('channels')
    .select()
    .eq('app_id', update.app_id)
    .eq('name', update.name)
    .eq('created_by', update.created_by)
  if (data && data.length && !error) {
    return supabase
      .from<definitions['channels']>('channels')
      .update(update)
      .eq('app_id', update.app_id)
      .eq('name', update.name)
      .eq('created_by', update.created_by)
  }
  else {
    return supabase
      .from<definitions['channels']>('channels')
      .insert(update)
  }
}
