import type { _Object } from '@aws-sdk/client-s3'
import type { Database } from '../supabase/functions/_backend/utils/supabase.types.ts'// supabase.types.ts'
import { ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3'
import { createClient } from '@supabase/supabase-js'

const S3_BUCKET = 'capgo'

async function main() {
  const s3 = await initS3()
  const supabase = supabaseAdmin()
  const list = await s3.send(new ListObjectsV2Command({
    Bucket: S3_BUCKET,
    Prefix: 'apps/',
  }))

  if (list.Contents) {
    const notFoundObjects = [] as _Object[]
    const promises = [] as Promise<null>[]
    for (let i = 0; i < (list.Contents?.length ?? 0); i++) {
      const item = list.Contents[i]
      if (item.Key === null) {
        throw new Error(`item: ${item} has a null key???`)
      }
      const itemPath = item.Key!.split('/')
      if (itemPath.length !== 5) {
        throw new Error(`item: ${item} length is not enough`)
      }
      // const appUuid = itemPath[1]
      const appId = itemPath[2]
      const versionName = itemPath[4]

      async function checkSupabase() {
        const { data: _version, error: errorVer } = await supabase
          .from('app_versions')
          .select('*')
          .eq('app_id', appId)
          .eq('name', versionName)
          .single()

        if (errorVer) {
          // console.error(`Cannot find version for ${JSON.stringify(item)}. Error: ${JSON.stringify(errorVer)}`)
          notFoundObjects.push(item)
        }
        return null
      }

      promises.push(checkSupabase())
    }
    await Promise.all(promises)
    console.log(`Not found items: ${notFoundObjects.length}`)
  }

  // console.log(list)
  // console.log(`${process.env.S3_ACCESS_KEY_ID}`)
}

function getEnv(c: any, s: string) {
  // eslint-disable-next-line node/prefer-global/process
  return process.env[s] ?? ''
}

export function supabaseAdmin() {
  const c = null
  const options = {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  }
  return createClient<Database>(getEnv(c, 'SUPABASE_URL'), getEnv(c, 'SUPABASE_SERVICE_ROLE_KEY'), options)
}

export function initS3() {
  const c = null
  const access_key_id = getEnv(c, 'S3_ACCESS_KEY_ID')
  const access_key_secret = getEnv(c, 'S3_SECRET_ACCESS_KEY')
  const storageEndpoint = getEnv(c, 'S3_ENDPOINT')
  const useSsl = getEnv(c, 'S3_SSL') !== 'false'

  const storageRegion = getEnv(c, 'S3_REGION')
  const params = {
    credentials: {
      accessKeyId: access_key_id,
      secretAccessKey: access_key_secret,
    },
    endpoint: `${useSsl ? 'https' : 'http'}://${storageEndpoint}`,
    region: storageRegion ?? 'us-east-1',
    // not apply in supabase local
    forcePathStyle: storageEndpoint !== '127.0.0.1:54321/storage/v1/s3',
    signingEscapePath: storageEndpoint !== '127.0.0.1:54321/storage/v1/s3',
  }

  console.log({ context: 'initS3', params })

  return new S3Client(params)
}

await main()
