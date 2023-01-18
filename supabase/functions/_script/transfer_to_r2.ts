import 'https://deno.land/x/dotenv/load.ts' // set it to ../_utils/r2.ts too to make it work
import { createClient } from 'https://esm.sh/@supabase/supabase-js@^2.1.2'
import type { Database } from '../_utils/supabase.types.ts'
import { r2 } from '../_utils/r2.ts'

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

const createR2 = async (record: Database['public']['Tables']['app_versions']['Row']) => {
  // get the size of the storage and add it to the row
  if (!record.bucket_id) {
    console.log('Cannot find bucket_id', record.id)
    return Promise.resolve()
  }
  console.log('Download', record.id)
  const { data, error: error2 } = await useSupabase()
    .storage
    .from(`apps/${record.user_id}/${record.app_id}/versions`)
    .download(record.bucket_id)
  if (error2 || !data) {
    console.log('Error', record.bucket_id, error2)
    return Promise.resolve()
  }
  console.log('Upload to R2', record.bucket_id)
  // upload to r2
  try {
    const u = await data.arrayBuffer()
    const unit8 = new Uint8Array(u)
    await r2.upload(record.bucket_id, unit8)
    const { error: errorUpdateStorage } = await useSupabase()
      .from('app_versions')
      .update({
        storage_provider: 'r2',
      })
      .eq('id', record.id)
    if (errorUpdateStorage)
      console.log('errorUpdateStorage', errorUpdateStorage)
  }
  catch (error) {
    console.log('Cannot upload', record.bucket_id, error)
  }
  console.log('R2 uploaded', record.id)
  return Promise.resolve()
}

const pageSize = 1000
const createAll = async () => {
  // update all app_versions
  const allData: Database['public']['Tables']['app_versions']['Row'][] = []
  // loop through all app_versions
  let continueLoop = true
  let page = 0
  while (continueLoop) {
    // console.log('skip', skip, 'end', end)
    const { data: appVersions, error: appVersionsError } = await useSupabase()
      .from('app_versions')
      .select()
      .eq('deleted', false)
      .eq('storage_provider', 'supabase')
      .not('bucket_id', 'is', null)
      .order('id', { ascending: true })
      .range(page * pageSize, (page + 1) * pageSize)

    if (appVersionsError) {
      console.error(appVersionsError)
      return
    }
    console.log('app_versions', appVersions.length)
    // add to allData
    allData.push(...appVersions)
    if (appVersions && appVersions.length < pageSize)
      continueLoop = false
    console.log('page', page, 'count', appVersions.length)
    // continueLoop = false
    page++
  }
  console.log('app_versions to set', allData.length)

  if (allData.length) {
    // loop on all element and create metadata for each
    const all = []
    for (const version of allData)
      all.push(createR2(version))
    try {
      await Promise.all(all)
    }
    catch (error) {
      console.error(error)
    }
  }
}
createAll()
