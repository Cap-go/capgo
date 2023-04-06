import { createClient } from 'https://esm.sh/@supabase/supabase-js@^2.2.3'
import 'https://deno.land/x/dotenv/load.ts'
import type { Database } from '../_utils/supabase.types.ts'

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '***'
const supabaseAnonKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '***'
function useSupabase() {
  const options = {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  }
  return createClient<Database>(supabaseUrl, supabaseAnonKey, options)
}

async function deleteBucket(record: Database['public']['Tables']['app_versions']['Row']) {
  // get the size of the storage and add it to the row
  if (!record.bucket_id) {
    console.log('Cannot find bucket_id', record.id)
    return Promise.resolve()
  }
  // check if exist already in the database
  const { error } = await useSupabase()
    .from('app_versions')
    .update({ bucket_id: null })
    .eq('id', record.id)
    .single()
  if (error && error.code !== 'PGRST116') {
    console.log('Error', record.id, error)
    return Promise.resolve()
  }
  if (error) {
    console.log('Error', record.id, error)
    return Promise.resolve()
  }
  const { error: errorUpdate } = await useSupabase()
    .from('app_versions_meta')
    .update({ size: 0 })
    .eq('id', record.id)
  if (errorUpdate) {
    console.log('Error', record.id, errorUpdate)
    return Promise.resolve()
  }
  console.log('remove', record.id)
  const { data: data2, error: error2 } = await useSupabase()
    .storage
    .from(`apps/${record.user_id}/${record.app_id}/versions`)
    .remove([record.bucket_id])
  if (error2 || !data2) {
    console.log('Error', record.bucket_id, error2)
    return Promise.resolve()
  }
  console.log('app_versions storage delete', record.id)
  return Promise.resolve()
}
// delete all app_versions_meta as sql query
// delete from app_versions_meta where id in (select id from app_versions where deleted = true)

const pageSize = 1000
async function createAll() {
  // list all app_versions
  const allData: Database['public']['Tables']['app_versions']['Row'][] = []
  // loop through all app_versions
  let continueLoop = true
  let page = 0
  while (continueLoop) {
    // console.log('skip', skip, 'end', end)
    const { data: appVersions, error: appVersionsError } = await useSupabase()
      .from('app_versions')
      .select()
      .eq('deleted', true)
      .not('bucket_id', 'is', null)
      .range(page * pageSize, (page + 1) * pageSize)

    if (appVersionsError) {
      console.error(appVersionsError)
      return
    }
    // console.log('app_versions', appVersions.length)
    // add to allData
    allData.push(...appVersions)
    if (appVersions && appVersions.length < pageSize)
      continueLoop = false
    console.log('page', page, 'count', appVersions.length)
    page++
  }
  console.log('app_versions to set', allData.length)

  if (allData.length) {
    // loop on all element and create metadata for each
    const all = []
    for (const version of allData)
      all.push(deleteBucket(version))
    try {
      await Promise.all(all)
    }
    catch (error) {
      console.error(error)
    }
  }
}
createAll()
