import { createClient } from 'https://esm.sh/@supabase/supabase-js@^2.2.3'
import { config } from 'https://deno.land/x/dotenv/mod.ts'
import { S3Client } from 'https://deno.land/x/s3_lite_client@0.6.1/mod.ts'
import type { Database } from '../_utils/supabase.types.ts'

function useSupabase() {
  const options = {
    auth: {
      autoRefreshToken: true,
      persistSession: false,
      detectSessionInUrl: false,
    },
  }
  return createClient<Database>(Deno.env.get('SUPABASE_URL') || '***', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '***', options)
}

function getEnv(env: string) {
  return Deno.env.get(env) ?? ''
}

function initR2() {
  const accountid = getEnv('R2_ACCOUNT_ID')
  const access_key_id = getEnv('R2_ACCESS_KEY_ID')
  const access_key_secret = getEnv('R2_SECRET_ACCESS_KEY')
  const storageEndpoint = getEnv('S3_ENDPOINT')
  const storageRegion = getEnv('S3_REGION')
  const storagePort = Number.parseInt(getEnv('S3_PORT'))
  const storageUseSsl = getEnv('S3_SSL').toLocaleLowerCase() === 'true'
  const bucket = 'capgo'

  const params = {
    endPoint: accountid ? `${accountid}.r2.cloudflarestorage.com` : storageEndpoint,
    region: storageRegion ?? 'us-east-1',
    useSSL: accountid ? true : storageUseSsl,
    port: storagePort ? (!Number.isNaN(storagePort) ? storagePort : undefined) : undefined,
    bucket,
    accessKey: access_key_id,
    secretKey: access_key_secret,
  }

  return new S3Client(params)
}

async function gen2array<T>(gen: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = []
  for await (const x of gen)
    out.push(x)

  return out
}

async function main() {
  config({
    path: 'supabase/.env.local',
    export: true,
  })

  // console.log(Deno.env.toObject())

  const supabase = useSupabase()
  const { data: apps, error: appError } = await supabase.from('apps').select('app_id, user_id')

  if (appError) {
    console.error('app error')
    throw appError
  }

  const r2 = initR2()
  // apps/${userId}/${body.app_id}/versions

  const appsWithR2AndSupabase = await Promise.all(apps.map(async (app) => {
    const r2Versions = r2.listObjects({ prefix: `apps/${app.user_id}/${app.app_id}/versions` })
    const r2VersionsArr = await gen2array(r2Versions)
      .then(arr => arr.map((s3Obj) => {
        const split = s3Obj.key.split('/')
        return { orginalName: s3Obj.key, name: split[split.length - 1].replace('.zip', '') }
      }))

    const supabaseVersions = await supabase.from('app_versions')
      .select('name')
      .eq('app_id', app.app_id)

    if (supabaseVersions.error) {
      console.error(`App ${app.app_id} get supaabse version error`)
      throw supabaseVersions.error
    }

    const supabaseVersionsMap = new Map(supabaseVersions.data.map(supabaseVersion => [supabaseVersion.name, '']))

    return {
      app,
      r2Version: r2VersionsArr,
      supabaseVersions: supabaseVersionsMap,
    }
  }))

  const appWithMissingSupabaseVersion = appsWithR2AndSupabase.map((app) => {
    return {
      app: app.app,
      missingSupabase: app.r2Version.filter(r2Ver => app.supabaseVersions.get(r2Ver.name) === undefined),
    }
  }).filter(app => app.missingSupabase.length > 0)

  console.log(`Found ${appWithMissingSupabaseVersion.length} apps that have a version missing from supabase`)

  const tmpFolder = await Deno.makeTempDir()
  console.log(`Temp folder for downloading data: ${tmpFolder}`)

  for (const app of appWithMissingSupabaseVersion)
    console.log(`Processing app ${app.app.app_id}`)
}

main()
