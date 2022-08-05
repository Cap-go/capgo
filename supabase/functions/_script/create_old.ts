import { crc32 } from 'https://deno.land/x/crc32/mod.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@^1.35.3'
import type { definitions } from '../_utils/types_supabase.ts'

const supabaseUrl = 'https://***.supabase.co'
const supabaseAnonKey = '***'

const useSupabase = () => {
  const options = {
    // const options: SupabaseClientOptions = {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  }
  return createClient(supabaseUrl, supabaseAnonKey, options)
}

const createMeta = async (record: definitions['app_versions']) => {
  // get the size of the storage and add it to the row
  if (!record.bucket_id) {
    console.log('Cannot find bucket_id', record.id)
    return
  }
  // check if exist already in the database
  const { data, error } = await useSupabase()
    .from<definitions['app_versions_meta']>('app_versions_meta')
    .select()
    .eq('id', record.id)
    .single()
  if (!error || data) {
    console.log('app_versions_meta found', record.id)
    return
  }
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
    .from<definitions['app_versions_meta']>('app_versions_meta')
    .insert({
      id: record.id,
      app_id: record.app_id,
      user_id: record.user_id,
      checksum,
      size,
    })
  if (dbError)
    console.error('Cannot create app version meta', dbError)
}
// delete all app_versions_meta as sql query
// delete from app_versions_meta where id in (select id from app_versions where deleted = true)

const createAll = async () => {
  // list all app_versions
  const { data, error } = await useSupabase()
    .from<definitions['app_versions']>('app_versions')
    .select()
    .eq('deleted', false)
    .not('bucket_id', 'is', null)
  if (error) { console.log('error', error) }
  else if (data && data.length) {
    // loop on all element and create metadata for each
    const all = []
    for (const version of data)
      all.push(createMeta(version))
    // all.push(createMeta(data[0]))

    await Promise.all(all)
  }
}
createAll()
