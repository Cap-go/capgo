import { createClient } from 'https://esm.sh/@supabase/supabase-js@^2.2.3'
import { load } from "https://deno.land/std@0.207.0/dotenv/mod.ts";
import type { Database } from '../_utils/supabase.types.ts'
import { readCSVObjects } from 'https://deno.land/x/csv/mod.ts';

const bucketName = 'apps';

const env = await load();

function getEnv(envName: string) {
  return Deno.env.get(envName) ?? env[envName] ?? ''
}

function useSupabase() {
  const options = {
    auth: {
      autoRefreshToken: true,
      persistSession: false,
      detectSessionInUrl: false,
    },
  }
  return createClient<Database>(getEnv('SUPABASE_URL') || '***', getEnv('SUPABASE_SERVICE_ROLE_KEY') || '***', options)
}

async function main2() { 
  const supabase = useSupabase()
  const f = await Deno.open("./functions/_script/objects_storage_filtered.csv");
  const filePaths = [];

  for await (const obj of readCSVObjects(f)) {
    // console.log("row:", obj);
    // console.log(filePath);
    if (obj.bucket_id === 'apps')
      filePaths.push(obj.name);
  }

  f.close();

  console.log('filePaths', filePaths)
  const response = await supabase.storage.from('apps').remove(filePaths);
  if (response.error) {
    console.error('Error deleting files:', response.error);
  } else {
    console.log('All files deleted');
  }
}

async function main() {

  // console.log(Deno.env.toObject())

  const supabase = useSupabase()
  // get all app_versions with deleted = true and storage_provider = supabase and loop until all get from db
  const allVerions: Database['public']['Tables']['app_versions']['Row'][] = []
  while (true) {
    const { data } = await supabase
    .from('app_versions')
      .select()
      .eq('deleted', true)
      .eq('storage_provider', 'supabase')
      // bucket_id not null
      .not('bucket_id', 'eq', null)
      .range(allVerions.length, allVerions.length + 1000)
    if (!data || data?.length === 0)
      break
    allVerions.push(...data)
  }
  // show the length of allVerions
  console.log('allVerions', allVerions.length)
  // now delete all files from supabase storage
  // use user_id / app_id / versions / bucket_id , to create the path in the storage
  // then delete the file
  const allPath: string[] = []
  for (const version of allVerions) {
    const path = `${version.user_id}/${version.app_id}/versions/${version.bucket_id}`
    console.log('path', path)
    // store all path and delete after
    allPath.push(path)
  }
  // delete all path
  await supabase.storage.from(bucketName).remove(allPath)
  console.log('allPath deleted')
  // now set all bucket_id to null
  const allVerionsId = allVerions.map(v => v.id)
  await supabase.from('app_versions').update({ bucket_id: null }).in('id', allVerionsId)
  console.log('allVerionsId updated')
}


async function listFiles() {
  const supabase = useSupabase()

  const { data, error } = await supabase.storage.from(bucketName).list();

  if (error) {
    console.error('Error listing files:', error);
    return;
  }

  return data;
}

async function calculateBucketSize() {
  const files = await listFiles();
  const supabase = useSupabase()

  if (!files) {
    console.error('No files found or error occurred.');
    return;
  }

  // iterate over files and calculate total size
  for (const file of files) {

    console.log('file.metadata', file)
  }
  const totalSize = files.reduce((acc, file) => acc + file.bucket_id, 0);
  console.log(`Total size of bucket "${bucketName}" is: ${totalSize} bytes`);
  
  return totalSize;
}


async function main3() {

  // console.log(Deno.env.toObject())

  const supabase = useSupabase()
  await supabase.from('app_versions')
  .update({ bucket_id: null, deleted: true })
  .eq('storage_provider', 'supabase')
  .eq('deleted', false)
  console.log('allVerionsId updated')
}

// calculateBucketSize();

main3()

// main()
// main2()

