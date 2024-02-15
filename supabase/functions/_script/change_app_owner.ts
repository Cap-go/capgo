/// <reference lib="deno.ns" />
import { S3Client } from 'https://deno.land/x/s3_lite_client@0.7.0/mod.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js'
import { ensureFile } from 'https://deno.land/std/fs/ensure_file.ts'
import type { Database } from '../_backend/utils/supabase.types.ts'

const supabaseUrl = 'http://127.0.0.1:54321'
const supabaseServiceRole = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const appToTransfer = 'com.demo.app'
const newOwnerEmail = 'admin@capgo.app'

async function main() {
  const s3client = new S3Client({
    endPoint: '0.0.0.0',
    port: 9000,
    useSSL: false,
    region: 'auto',
    accessKey: 'ROOTUSER',
    secretKey: 'CHANGEME123',
    bucket: 'capgo',
  })

  const supabase = createClient<Database>(supabaseUrl, supabaseServiceRole, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  })

  const { data: oldUser, error: error1 } = await supabase.from('apps')
    .select('*')
    .eq('app_id', appToTransfer)
    .single()

  if (error1)
    throw error1

  const { data: newUser, error: error2 } = await supabase.from('users')
    .select('*')
    .eq('email', newOwnerEmail)
    .single()

  if (error2)
    throw error1

  const oldUserId = (oldUser as any).user_id as string
  const newUserId = (newUser as any).id as string

  console.log(`old id: ${JSON.stringify(oldUserId)}`)
  console.log(`new id: ${JSON.stringify(newUserId)}`)

  console.log(`tmp dir: /tmp/move-tmp`)
  try {
    await Deno.mkdir('/tmp/move-tmp')
  }
  catch (err) {
    if (!(err instanceof Deno.errors.AlreadyExists))
      throw err
  }

  for await (const obj of s3client.listObjects({ prefix: `apps/${oldUserId}/` })) {
    console.log(`Processing ${obj.key}`)
    const getObj = await s3client.getObject(obj.key)
    await ensureFile(`/tmp/move-tmp/${obj.key}`)
    const file = await Deno.create(`/tmp/move-tmp/${obj.key}`)
    await getObj.body?.pipeTo(file.writable)

    await s3client.copyObject({ sourceKey: obj.key }, obj.key.replace(oldUserId, newUserId))
    await s3client.deleteObject(obj.key)
  }

  const { error: error3 } = await supabase.from('apps')
    .update({ user_id: newUserId })
    .eq('user_id', oldUserId)

  if (error3)
    throw error3

  const { error: error4 } = await supabase.from('app_versions')
    .update({ user_id: newUserId })
    .eq('app_id', appToTransfer)

  if (error4)
    throw error4

  const { error: error5 } = await supabase.from('app_versions_meta')
    .update({ user_id: newUserId })
    .eq('app_id', appToTransfer)

  if (error5)
    throw error5

  const { error: error6 } = await supabase.from('channel_devices')
    .update({ created_by: newUserId })
    .eq('app_id', appToTransfer)

  if (error6)
    throw error6

  const { error: error7 } = await supabase.from('channels')
    .update({ created_by: newUserId })
    .eq('app_id', appToTransfer)

  if (error7)
    console.log(JSON.stringify(error7))

  const { error: error8 } = await supabase.from('devices_override')
    .update({ created_by: newUserId })
    .eq('app_id', appToTransfer)

  if (error8)
    console.log(JSON.stringify(error8))
}

await main()
