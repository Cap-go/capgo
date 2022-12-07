import { crc32 } from 'https://deno.land/x/crc32/mod.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@^2.1.2'
import type { Database } from '../_utils/supabase.types.ts'

const supabaseUrl = 'https://***.supabase.co'
const supabaseAnonKey = '***'

const useSupabase = () => {
  const options = {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  }
  return createClient(supabaseUrl, supabaseAnonKey, options)
}

const createMeta = async (record: Database['public']['Tables']['app_versions']['Row']) => {
  // get the size of the storage and add it to the row
  if (!record.bucket_id) {
    console.log('Cannot find bucket_id', record.id)
    return
  }
  // check if exist already in the database
  const { data, error } = await useSupabase()
    .from('app_versions_meta')
    .select()
    .eq('id', record.id)
    .single()
  if (!error || data)
    return
  const { data: data2, error: error2 } = await useSupabase()
    .storage
    .from(`apps/${record.user_id}/${record.app_id}/versions`)
    .download(record.bucket_id)
  if (error2 || !data2) {
    console.log('Error', record.bucket_id, error2)
    return
  }
  const u = await new Response(data2).arrayBuffer()
  // get the size of the Uint8Array
  const size = u.byteLength
  // cr32 hash the file
  const checksum = crc32(new Uint8Array(u))
  // create app version meta
  const { error: dbError } = await useSupabase()
    .from('app_versions_meta')
    .insert({
      id: record.id,
      app_id: record.app_id,
      user_id: record.user_id,
      checksum,
      size,
    })
  if (dbError)
    console.error('Cannot create app version meta', dbError)
  console.log('app_versions_meta create', record.id)
}
// delete all app_versions_meta as sql query
// delete from app_versions_meta where id in (select id from app_versions where deleted = true)

const pageSize = 100
const createAll = async () => {
  // list all app_versions
  const allData: Database['public']['Tables']['app_versions']['Row'][] = []
  // loop through all app_versions
  for (let skip = 0; skip >= 0;) {
    const end = skip + pageSize
    // console.log('skip', skip, 'end', end)
    const { data: appVersions, error: appVersionsError } = await useSupabase()
      .from('app_versions')
      .select()
      .eq('deleted', false)
      .not('bucket_id', 'is', null)
      .range(skip, end)

    if (appVersionsError) {
      console.error(appVersionsError)
      return
    }
    // console.log('app_versions', appVersions.length)
    // add to allData
    allData.push(...appVersions)
    if (appVersions.length !== pageSize + 1) {
      console.log('No more app_versions to delete')
      skip = -1
    }
    else {
      skip += pageSize
    }
  }
  console.log('app_versions to delete', allData.length)

  if (allData.length) {
    // loop on all element and create metadata for each
    const all = []
    for (const version of allData)
      all.push(createMeta(version))
    // all.push(createMeta(data[0]))

    await Promise.all(all)
  }
}
createAll()
