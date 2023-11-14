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
  return createClient<Database>(Deno.env.get('S_SUPABASE_URL') || '***', Deno.env.get('S_SUPABASE_SERVICE_ROLE_KEY') || '***', options)
}

function getEnv(env: string) {
  return Deno.env.get(env) ?? ''
}

const UUID_REGEX = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/

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
      .select('name, deleted')
      .eq('app_id', app.app_id)
      .or('storage_provider.in.("r2-direct","r2")')

    if (supabaseVersions.error) {
      console.error(`App ${app.app_id} get supaabse version error`)
      throw supabaseVersions.error
    }

    const supabaseVersionsMap = new Map(supabaseVersions.data.map(supabaseVersion => [supabaseVersion.name, supabaseVersion.deleted]))

    return {
      app,
      r2Version: r2VersionsArr,
      supabaseVersions: supabaseVersionsMap,
    }
  }))

  const appWithMissingSupabaseVersion = appsWithR2AndSupabase.map((app) => {
    return {
      app: app.app,
      missingSupabase: app.r2Version.filter((r2Ver) => {
        const supabaseVer = app.supabaseVersions.get(r2Ver.name)
        return supabaseVer === undefined || supabaseVer === true
      }),
    }
  }).filter(app => app.missingSupabase.length > 0)

  console.log(`Found ${appWithMissingSupabaseVersion.length} apps that have a version missing from supabase`)

  const tmpFolder = await Deno.makeTempDir()
  console.log(`Temp folder for downloading data: ${tmpFolder}`)

  for (const app of appWithMissingSupabaseVersion) {
    console.log(`Processing app ${app.app.app_id}`)

    await Promise.all(app.missingSupabase.map(async (missingVersion) => {
      console.log(`Downloading ${missingVersion.name} for app ${app.app.app_id}`)

      const filePath = `${tmpFolder}/${missingVersion.orginalName}`
      const folderPath = filePath.split('/').slice(0, -1).join('/')
      await Deno.mkdir(folderPath, { recursive: true })

      const downloadObjectResponse = await r2.getObject(missingVersion.orginalName)
      const downloadFile = await Deno.open(`${tmpFolder}/${missingVersion.orginalName}`, { create: true, write: true })
      if (!downloadObjectResponse.body) {
        console.error(`Body null for download ${missingVersion.name} for app ${app.app.app_id}`)
        Deno.exit(1)
      }

      const toPipe = downloadFile.writable
      await downloadObjectResponse.body.pipeTo(toPipe)

      // https://github.com/denoland/deno/issues/14210
      try {
        Deno.close(downloadFile.rid)
      }
      catch (_) {
        // pass
      }

      console.log(`Downloading ${missingVersion.name} for app ${app.app.app_id}. Removing from R2`)
      // Now delete the file from r2
      await r2.deleteObject(missingVersion.orginalName)
    }))
  }

  const r2VersionsOld = r2.listObjects()
  const r2VersionsArrOld = (await gen2array(r2VersionsOld)).filter(object => object.key.split('/')[0] !== 'apps')

  // We have SOME old s3 versions
  if (r2VersionsArrOld.length > 0) {
    console.log('Found legacy versions. Checking!')

    for (const legacyVersion of r2VersionsArrOld) {
      const { data: _, error } = await supabase
        .from('app_versions')
        .select('id')
        .eq('bucket_id', legacyVersion.key)
        .single()

      if (!error)
        continue

      if (error && error.code !== 'PGRST116') {
        console.log('Error found!')
        console.log(error)
        Deno.exit(0)
      }

      console.log(`Download legacy version ${legacyVersion.key}`)
      const downloadFile = await Deno.open(`${tmpFolder}/${legacyVersion.key}`, { create: true, write: true })
      const downloadObjectResponse = await r2.getObject(legacyVersion.key)

      if (!downloadObjectResponse.body) {
        console.error('Body null for download for legacy download')
        Deno.exit(1)
      }

      const toPipe = downloadFile.writable
      await downloadObjectResponse.body.pipeTo(toPipe)

      console.log('Download legacy version! Deleating')
      await r2.deleteObject(legacyVersion.key)
    }

    Deno.exit(0)
  }
}

main()
