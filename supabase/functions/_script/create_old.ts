import { crc32 } from 'https://deno.land/x/crc32@v0.2.2/mod.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@^2.2.3'
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

const createMeta = async (record: Database['public']['Tables']['app_versions']['Row']) => {
  // get the size of the storage and add it to the row
  if (!record.bucket_id) {
    console.log('Cannot find bucket_id', record.id)
    return Promise.resolve()
  }
  // check if exist already in the database
  const { data, error } = await useSupabase()
    .from('app_versions_meta')
    .select()
    .eq('id', record.id)
    .single()
  if (error && error.code !== 'PGRST116') {
    console.log('Error', record.id, error)
    return Promise.resolve()
  }
  if (error)
    console.log('Error', record.id, error)
  if (data && data.size > 0) {
    // console.log('Already exists', record.id)
    return Promise.resolve()
  }
  console.log('Download', record.id)
  const { data: data2, error: error2 } = await useSupabase()
    .storage
    .from(`apps/${record.user_id}/${record.app_id}/versions`)
    .download(record.bucket_id)
  if (error2 || !data2) {
    console.log('Error', record.bucket_id, error2)
    return Promise.resolve()
  }
  const u = await data2.arrayBuffer()
  // get the size of the Uint8Array
  const size = u.byteLength
  // cr32 hash the file
  const checksum = crc32(new Uint8Array(u))
  // create app version meta
  const { error: dbError } = await useSupabase()
    .from('app_versions_meta')
    .upsert({
      id: record.id,
      app_id: record.app_id,
      user_id: record.user_id,
      checksum,
      size,
    })
  if (dbError)
    console.error('Cannot create app version meta', dbError)
  console.log('app_versions_meta create', record.id)
  return Promise.resolve()
}
// delete all app_versions_meta as sql query
// delete from app_versions_meta where id in (select id from app_versions where deleted = true)

const pageSize = 1000
const createAll = async () => {
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
      .eq('deleted', false)
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
      all.push(createMeta(version))
    try {
      await Promise.all(all)
    }
    catch (error) {
      console.error(error)
    }
  }
}
createAll()
