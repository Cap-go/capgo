import type { _Object, ListObjectsV2CommandOutput } from '@aws-sdk/client-s3'
import type { Database } from '../supabase/functions/_backend/utils/supabase.types.ts'// supabase.types.ts'
import { CopyObjectCommand, DeleteObjectCommand, DeleteObjectsCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3'
import { createClient } from '@supabase/supabase-js'

const S3_BUCKET = 'capgo'
const MAGIC_TO_DELETE = './tmp/magic_to_delete5.txt'

async function main() {
  // eslint-disable-next-line node/prefer-global/process
  if (process.env.MAKE_COPY === '1') {
    const s3 = await initS3()
    const files = JSON.parse(await Bun.file(MAGIC_TO_DELETE).text()) as _Object[]
    const file = files[0]
    console.log({
      Bucket: 'capgo-cleanup-backup',
      CopySource: `${S3_BUCKET}/${file.Key}`,
      Key: file.Key,
    })
    // try {
    //   const com = new CopyObjectCommand({
    //     Bucket: ('backuptmp'),
    //     CopySource: (`${S3_BUCKET}/${file.Key}`),
    //     Key: (file.Key ?? ''),
    //     // ACL: 'authenticated-read',
    //   })
    //   console.log(com)
    //   await s3.send(com)
    // }
    // catch (e) {
    //   console.log(e)
    // }

    const promises = files.map((file) => {
      const com = new CopyObjectCommand({
        Bucket: ('backuptmp'),
        CopySource: (`${S3_BUCKET}/${file.Key}`),
        Key: (file.Key ?? ''),
        // ACL: 'authenticated-read',
      })
      return s3.send(com)
    })
    await Promise.all(promises)
    return
  }
  // eslint-disable-next-line node/prefer-global/process
  else if (process.env.DELETE_FILES === '1') {
    const s3 = await initS3()
    const files = JSON.parse(await Bun.file(MAGIC_TO_DELETE).text()) as _Object[]
    // eslint-disable-next-line style/max-statements-per-line
    const toDelete = files.map((file) => { return { Key: file.Key ?? '' } })
    const command = new DeleteObjectsCommand({
      Bucket: S3_BUCKET,
      Delete: {
        Objects: toDelete,
      },
    })
    s3.send(command)
  }

  const s3 = await initS3()
  const supabase = supabaseAdmin()
  const list = await listAllObjectsInFolder(s3, 'apps/')
  // await s3.send(new ListObjectsV2Command({
  //   Bucket: S3_BUCKET,
  //   Prefix: 'apps/',
  // }))

  const notFoundObjects = [] as _Object[]
  if (list) {
    console.log(`found ${list.length} objects to analyze`)
    const promises = [] as Promise<null>[]
    for (let i = 0; i < (list.length ?? 0); i++) {
      const item = list[i]
      if (item.Key === null) {
        throw new Error(`item: ${item} has a null key???`)
      }
      const itemPath = item.Key!.split('/')
      if (itemPath.length !== 5) {
        throw new Error(`item: ${item} length is not enough`)
      }
      // const appUuid = itemPath[1]
      const appId = itemPath[2]
      const versionName = itemPath[4].split('.zip').at(0) ?? ''

      async function checkSupabase() {
        const { data: version, error: errorVer } = await supabase
          .from('app_versions')
          .select('*')
          .eq('app_id', appId)
          .eq('name', versionName)
          .single()

        if (errorVer || version.deleted) {
          // console.error(`Cannot find version for ${JSON.stringify(item)}. Error: ${JSON.stringify(errorVer)}`)
          notFoundObjects.push(item)
        }
        return null
      }

      promises.push(checkSupabase())
    }
    const allS3Orgs = await s3.send(new ListObjectsV2Command({
      Bucket: S3_BUCKET,
      Prefix: 'orgs/',
      Delimiter: '/',
    })) as ListObjectsV2CommandOutput
    if (allS3Orgs.CommonPrefixes) {
      for (let i = 0; i < (allS3Orgs.CommonPrefixes.length ?? 0); i++) {
        const prefix = allS3Orgs.CommonPrefixes[i].Prefix
        if (prefix === null) {
          throw new Error(`A null prefix?`)
        }
        async function handleOrg() {
          const files = await listAllObjectsInFolder(s3, prefix!)
          console.log(`found ${files.length} items to analyze for analyze for org id ${i}`)
          for (let j = 0; j < (files.length ?? 0); j++) {
            const item = files[j]
            if (item.Key === null) {
              throw new Error(`item: ${item} has a null key???`)
            }

            const itemPath = item.Key!.split('/')
            const finalItem = itemPath.at(-1)
            if (finalItem && finalItem.endsWith('.zip')) {
              const { data: version, error: errorVer } = await supabase
                .from('app_versions')
                .select('*')
                .eq('r2_path', item.Key!)
                .single()

              if (errorVer || version.deleted) {
                console.log(errorVer)
                // console.error(`Cannot find version for ${JSON.stringify(item)}. Error: ${JSON.stringify(errorVer)}`)
                notFoundObjects.push(item)
              }
            }
          }
          return null
        }
        promises.push(handleOrg())
      }
    }
    // await listAllObjectsInFolder(s3, 'orgs/')

    const handled = 0
    // if (list2) {
    //   console.log(`found ${list2.length} items to analyze for second list`)
    //   // const promises = [] as Promise<null>[]
    //   for (let i = 0; i < (list.length ?? 0); i++) {
    //     const item = list[i]
    //     if (item.Key === null) {
    //       throw new Error(`item: ${item} has a null key???`)
    //     }

    //     const itemPath = item.Key!.split('/')
    //     const finalItem = itemPath.at(-1)
    //     if (finalItem && finalItem.endsWith('.zip') && semver.canParse(finalItem.slice(0, -4))) {
    //       handled += 1

    //       async function checkSupabase() {
    //         const { data: version, error: errorVer } = await supabase
    //           .from('app_versions')
    //           .select('*')
    //           .eq('r2_path', itemPath)
    //           .single()

    //         if (errorVer || version.deleted) {
    //           // console.error(`Cannot find version for ${JSON.stringify(item)}. Error: ${JSON.stringify(errorVer)}`)
    //           notFoundObjects.push(item)
    //         }
    //         return null
    //       }
    //       promises.push(checkSupabase())
    //     }
    //   }
    //   console.log(`han: ${handled}; total: ${list2.length}`)
    // }

    console.log('total promises:', promises.length)
    await Promise.all(promises)
    console.log(`Not found items: ${notFoundObjects.length}; Total items: ${list.length + handled}`)
    const str = JSON.stringify(notFoundObjects, null, 2)
    await Bun.write(MAGIC_TO_DELETE, str)
    // console.log(notFoundObjects)
  }

  // console.log(list)
  // console.log(`${process.env.S3_ACCESS_KEY_ID}`)
}

function getEnv(c: any, s: string) {
  // eslint-disable-next-line node/prefer-global/process
  return process.env[s] ?? ''
}

async function listAllObjectsInFolder(s3: S3Client, path: string) {
  const bucketName = S3_BUCKET
  const folderPrefix = path

  let continuationToken: string | null = null
  let object = [] as _Object[]

  try {
    while (true) {
      const data = await s3.send(new ListObjectsV2Command({
        Bucket: bucketName,
        Prefix: folderPrefix,
        ContinuationToken: continuationToken || undefined,
      })) as ListObjectsV2CommandOutput

      console.log(data.NextContinuationToken, data.IsTruncated)
      continuationToken = data.NextContinuationToken ?? ''
      object = object.concat(data.Contents ?? [])
      if (data.IsTruncated != null && data.IsTruncated === false) {
        break
      }
    }
  }
  catch (err) {
    console.error('Error listing objects', err)
    // eslint-disable-next-line node/prefer-global/process
    process.exit(1)
  }
  return object
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
  const access_key_id = getEnv(c, 'S3_BACKUP_1')
  const access_key_secret = getEnv(c, 'S3_BACKUP_2')
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
    forcePathStyle: true, // storageEndpoint !== '127.0.0.1:54321/storage/v1/s3',
    signingEscapePath: false,
    // signingEscapePath: storageEndpoint !== '127.0.0.1:54321/storage/v1/s3',
  }

  console.log({ context: 'initS3', params })

  return new S3Client({ ...params })
}

await main()
