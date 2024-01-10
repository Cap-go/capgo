/* eslint-disable n/prefer-global/buffer */
// create a node bundle from a deno bundle
// netlify/functions/bundle.ts
// this script is run on netlify to create netlify function, background function and egde function from supabase functions

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'

const baseSupa = 'supabase'
const baseNetlify = 'netlify'
const baseCloudflareFolder = 'cloudflare_workers_deno'
const baseNetlifyConfig = 'netlify.toml'
const baseNetlifyEgde = 'netlify-edge'
const baseCloudflare = 'cloudflare'
const baseUtils = '_utils'
const baseTests = '_tests'
const baseFunctions = 'functions'
const baseEdgeFunctions = 'edge-functions'
const baseScripts = 'scripts'
const baseTemplate = 'template'
const splitNetlifyConfig = '# auto egde generate'
const baseSupaTemplate = `${baseScripts}/${baseTemplate}/${baseSupa}`
const baseNetlifyTemplate = `${baseScripts}/${baseTemplate}/${baseNetlify}`
const baseNetlifyEdgeTemplate = `${baseScripts}/${baseTemplate}/${baseNetlifyEgde}`
const baseCloudflareTemplate = `${baseScripts}/${baseTemplate}/${baseCloudflare}`
const baseSupaFunctions = `${baseSupa}/${baseFunctions}`
const baseNetlifyFunctions = `${baseNetlify}/${baseFunctions}`
const baseNetlifyEdgeFunctions = `${baseNetlify}/${baseEdgeFunctions}`
const baseNetlifyCloudflare = `${baseCloudflareFolder}/${baseCloudflare}`
const baseSupaUtils = `${baseSupa}/${baseFunctions}/${baseUtils}`
const baseSupaTests = `${baseSupa}/${baseFunctions}/${baseTests}`
const baseNetlifyTests = `${baseNetlify}/${baseTests}`
const baseNetlifyUtils = `${baseNetlify}/${baseUtils}`
const baseNetlifyEdgeTests = `${baseNetlify}/${baseEdgeFunctions + baseTests}`
const baseNetlifyEgdeUtils = `${baseNetlify}/${baseEdgeFunctions + baseUtils}`
const baseCloudflareTests = `${baseCloudflareFolder}/${baseCloudflare + baseTests}`
const baseCloudflareUtils = `${baseCloudflareFolder}/${baseCloudflare + baseUtils}`
const allowed = ['bundle', 'channel_self', 'ok', 'stats', 'website_stats', 'channel', 'device', 'plans', 'updates', 'store_top', 'updates_redis']
const background = ['web_stats', 'cron_good_plan', 'get_framework', 'get_top_apk', 'get_similar_app', 'get_store_info', 'cron_email']
// const onlyNode = ['get_framework-background', 'get_top_apk-background', 'get_similar_app-background', 'get_store_info-background']
const allowedUtil = ['utils', 'conversion', 'types', 'supabase', 'supabase.types', 'invalids_ip', 'plans', 'logsnag', 'crisp', 'plunk', 'notifications', 'stripe', 'r2', 'downloadUrl', 'gplay_categ', 'update', 'redis', 'clickhouse', 'postgress_schema', 'sqlite_schema']

const supaTempl = {}
const netlifyTempl = {}
const netlifyEdgeTempl = {}
const cloudflareTempl = {}
// list files in baseSupaTemplate
const supaTemplFiles = readdirSync(baseSupaTemplate)
const netlifyTemplFiles = readdirSync(baseNetlifyTemplate)
const netlifyEdgeTemplFiles = readdirSync(baseNetlifyEdgeTemplate)
const cloudflareTemplFiles = readdirSync(baseCloudflareTemplate)

// open file and copy content in supaTempl with key = filename without extension
supaTemplFiles.forEach((file) => {
  try {
    const content = readFileSync(`${baseSupaTemplate}/${file}`, 'utf8')
    const key = file.replace('.ts', '')
    // split content at "// import from here" and use only second part
    supaTempl[key] = content.split('// import from here')[1]
  }
  catch (e) {
    console.error(e)
  }
})
console.log('supaTempl', Object.keys(supaTempl))
netlifyTemplFiles.forEach((file) => {
  try {
    const content = readFileSync(`${baseNetlifyTemplate}/${file}`, 'utf8')
    const key = file.replace('.ts', '')
    // split content at "// import from here" and use only second part
    netlifyTempl[key] = content.split('// import from here')[1]
  }
  catch (e) {
    console.error(e)
  }
})
netlifyEdgeTemplFiles.forEach((file) => {
  try {
    const content = readFileSync(`${baseNetlifyEdgeTemplate}/${file}`, 'utf8')
    const key = file.replace('.ts', '')
    // split content at "// import from here" and use only second part
    netlifyEdgeTempl[key] = content.split('// import from here')[1]
  }
  catch (e) {
    console.error(e)
  }
})
cloudflareTemplFiles.forEach((file) => {
  try {
    const content = readFileSync(`${baseCloudflareTemplate}/${file}`, 'utf8')
    const key = file.replace('.ts', '') // Big question mark here
    // split content at "// import from here" and use only second part
    cloudflareTempl[key] = content.split('// import from here')[1]
  }
  catch (e) {
    console.error(e)
  }
})

// console.log('supaTempl', supaTempl)
// console.log('supaTempl.r2', supaTempl.r2)
// console.log('netlifyTempl.r2', netlifyTempl.r2)
// exit()
// console.log('netlifyTempl', netlifyTempl)
// escape url for regex
export function encodeBase64(data) {
  return Buffer.from(data).toString('base64')
}
export function decodeBase64(data) {
  return Buffer.from(data, 'base64').toString('ascii')
}
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
const mutationsNode = [
  { from: 'https://cdn.logsnag.com/deno/1.0.0-beta.6/index.ts', to: 'logsnag' },
  { from: 'https://deno.land/x/upstash_redis@v1.22.0/mod.ts', to: '@upstash/redis' },
  { from: 'const redis = await connect(parseURL(redisEnv))', to: 'const redis = new Redis(redisEnv)' },
  { from: 'https://deno.land/x/upstash_redis@v1.22.0/pkg/pipeline.ts', to: '@upstash/redis/types/pkg/pipeline' },
  { from: 'https://deno.land/x/zod@v3.22.2/mod.ts', to: 'zod' },
  { from: 'import type { Redis, RedisPipeline } from \'https://deno.land/x/redis@v0.24.0/mod.ts\'', to: 'import type { RedisPipeline } from \'ioredis\'' },
  { from: 'RedisPipeline', to: 'ChainableCommander' },
  { from: 'bypassRedis = false', to: 'bypassRedis = true' },
  { from: 'this.pipeline.flush', to: 'this.pipeline.flushdb' },
  { from: 'redis.hscan(hashCacheKey, cursor, { match:', to: 'redis.hscan(hashCacheKey, cursor, { pattern:' },
  { from: '.hset(key, field, value)', to: '.hset(key, { [field]: value })' },
  { from: 'this.redis.tx()', to: 'this.redis.multi()' },
  { from: 'return await this.pipeline.hdel(key, ...fields)', to: 'this.pipeline.hdel(key, ...fields)\n return Promise.resolve(0)' },
  { from: '.hscan(key, cursor, opts)', to: '.hscan(key, cursor, \'MATCH\', opts?.pattern ?? \'\', \'COUNT\', opts?.count ?? \'\')' },
  { from: 'import { connect, parseURL } from \'https://deno.land/x/redis@v0.24.0/mod.ts\'', to: 'import { Redis } from \'ioredis\'' },
  { from: 'https://esm.sh/@supabase/supabase-js@^2.38.5', to: '@supabase/supabase-js' },
  { from: 'https://deno.land/x/axiod@0.26.2/mod.ts', to: 'axios' },
  { from: 'https://deno.land/x/s3_lite_client@0.6.1/mod.ts', to: 'minio' },
  { from: '{ S3Client }', to: '{ Client }' },
  { from: 'https://cdn.skypack.dev/cron-schedule@3.0.6?dts', to: 'cron-schedule' },
  { from: 'https://cdn.skypack.dev/dayjs@1.11.6?dts', to: 'dayjs' },
  { from: 'https://deno.land/x/semver@v1.4.1/mod.ts', to: 'semver' },
  { from: 'https://deno.land/x/equal@v1.5.0/mod.ts', to: 'lauqe' },
  { from: 'https://esm.sh/adm-zip?target=deno', to: 'adm-zip' },
  { from: 'https://esm.sh/google-play-scraper?target=deno', to: 'google-play-scraper' },
  { from: 'import { hmac } from \'https://deno.land/x/hmac@v2.0.1/mod.ts\'', to: 'import crypto from \'crypto\'' },
  { from: 'import { cryptoRandomString } from \'https://deno.land/x/crypto_random_string@1.1.0/mod.ts\'', to: 'import cryptoRandomString from \'crypto-random-string\'' },
  { from: 'Promise<Response>', to: 'Promise<any>' },
  { from: 'btoa(STRIPE_TOKEN)', to: 'Buffer.from(STRIPE_TOKEN).toString(\'base64\')' },
  { from: '{ match: \'ver\*\', count: 5000 }', to: '{ pattern: \'ver\*\', count: 5000 })' },
  { from: supaTempl.r2, to: netlifyTempl.r2 },
  { from: supaTempl.handler, to: netlifyTempl.handler },
  { from: supaTempl.getEnv, to: netlifyTempl.getEnv },
  { from: supaTempl.res, to: netlifyTempl.res },
  { from: supaTempl.hmac, to: netlifyTempl.hmac },
  // { from: supaTempl.redis, to: netlifyTempl.redis },
  { from: '.ts\'', to: '\'' },
]
const mutationsEgde = [
  { from: '../_tests/', to: `../${baseEdgeFunctions}_tests/` },
  { from: '../_utils/', to: `../${baseEdgeFunctions}_utils/` },
  { from: supaTempl.handler, to: netlifyEdgeTempl.handler },
]
const mutationsBg = [
  { from: 'sendRes(', to: 'sendResBg(' },
  { from: ', sendRes', to: ', sendResBg' },
  { from: '{ sendRes', to: '{ sendResBg' },
  { from: 'Handler', to: 'BackgroundHandler' },
]

const mutationCloudflare = [
  { from: supaTempl.handler, to: cloudflareTempl.handler },
  { from: '../_utils/', to: `../${baseCloudflare}_utils/` },
  { from: '../_tests/', to: `../${baseCloudflare}_tests/` },
  { from: supaTempl.redis, to: cloudflareTempl.getRedis },
  { from: supaTempl.reidsInvalidate, to: cloudflareTempl.reidsInvalidate },
  { from: supaTempl.reidsPipelines, to: '' },
  { from: supaTempl.r2, to: cloudflareTempl.r2 },
  { from: 'export function setEnv(env: any) {}', to: '' },
  { from: supaTempl.getEnv, to: cloudflareTempl.getEnv },
  { from: '// importSetEnvHere', to: 'import { setEnv } from \'../cloudflare_utils/utils.ts\'' },
  { from: 'https://cdn.logsnag.com/deno/1.0.0-beta.6/index.ts', to: 'logsnag' },
  { from: 'import { Redis as RedisUpstash } from \'https://deno.land/x/upstash_redis@v1.22.0/mod.ts\'', to: '// Removed import' },
  { from: 'import type { Pipeline as UpstashPipeline } from \'https://deno.land/x/upstash_redis@v1.22.0/pkg/pipeline.ts\'', to: '// Removed import' },
  { from: 'https://deno.land/x/zod@v3.22.2/mod.ts', to: 'zod' },
  { from: 'import type { Redis, RedisPipeline } from \'https://deno.land/x/redis@v0.24.0/mod.ts\'', to: '// Removed import' },
  { from: 'bypassRedis = false', to: 'bypassRedis = true' },
  { from: 'import { connect, parseURL } from \'https://deno.land/x/redis@v0.24.0/mod.ts\'', to: '// Removed import' },
  { from: 'https://esm.sh/@supabase/supabase-js@^2.38.5', to: '@supabase/supabase-js' },
  { from: 'https://deno.land/x/axiod@0.26.2/mod.ts', to: 'axios' },
  { from: 'https://deno.land/x/s3_lite_client@0.6.1/mod.ts', to: '@aws-sdk/client-s3' },
  { from: '{ S3Client }', to: '{ S3Client, PutObjectCommand, DeleteObjectCommand, HeadObjectCommand, GetObjectCommand }' },
  { from: 'https://cdn.skypack.dev/cron-schedule@3.0.6?dts', to: 'cron-schedule' },
  { from: 'https://cdn.skypack.dev/dayjs@1.11.6?dts', to: 'dayjs' },
  { from: 'https://deno.land/x/semver@v1.4.1/mod.ts', to: 'semver' },
  { from: 'https://deno.land/x/equal@v1.5.0/mod.ts', to: 'lauqe' },
  { from: 'https://esm.sh/adm-zip?target=deno', to: 'adm-zip' },
  { from: 'https://esm.sh/google-play-scraper?target=deno', to: 'google-play-scraper' },
  { from: 'import { hmac } from \'https://deno.land/x/hmac@v2.0.1/mod.ts\'', to: 'import crypto from \'crypto\'' },
  { from: 'import { cryptoRandomString } from \'https://deno.land/x/crypto_random_string@1.1.0/mod.ts\'', to: 'import cryptoRandomString from \'crypto-random-string\'' },
  { from: 'Promise<Response>', to: 'Promise<any>' },
  { from: 'btoa(STRIPE_TOKEN)', to: 'Buffer.from(STRIPE_TOKEN).toString(\'base64\')' },
  { from: '{ match: \'ver\*\', count: 5000 }', to: '{ pattern: \'ver\*\', count: 5000 })' },
  { from: 'https://esm.sh/drizzle-orm@^0.29.1', to: 'drizzle-orm', force: true },
  { from: 'import postgres from \'https://deno.land/x/postgresjs/mod.js\'', to: 'import postgres from \'postgres\';' },
  // { transform: (current) => {
  //   // from: 'drizzle-orm/pg-core', to: 'drizzle-orm/sqlite-core'
  //   // (.*(?:abc).*(?<! \/\/ do_not_change)$)
  //   if (!current.includes('do_not_change_drizzle_to_sqlite')) {
  //     current = current.replace(/(.*(?:drizzle-orm\/pg-core).*(?<! \/\/ do_not_change)$)/mg, 'drizzle-orm/sqlite-core')
  //   }
  //   return current
  // } },
  { from: 'drizzle-orm/pg-core', to: 'drizzle-orm/sqlite-core' },
  { from: './postgress_schema.ts', to: './sqlite_schema.ts' },
  { from: 'drizzle-orm/postgres-js', to: 'drizzle-orm/d1' },
  // { from: 'drizzle(pgClient as any)', to: 'drizzle(getEnv(\'DB\') as any)' },
  { from: 'await pgClient.end()', to: '' },
  { from: '// import presign s3', to: 'import { getSignedUrl as s3GetSignedUrl } from "@aws-sdk/s3-request-presigner";' },
  { from: '// import drizzle_sqlite', to: 'import { drizzle as drizzle_sqlite } from \'drizzle-orm/d1\'\nimport * as schema_sqlite from \'./sqlite_schema.ts\'\nimport { alias as alias_sqlite } from \'drizzle-orm/sqlite-core\';' },
  { from: 'isSupabase = true', to: 'isSupabase = false' },
  { from: 'drizzleCient, schema', to: 'drizzleCient as any, schema as any' },
  { transform: (current) => {
    if (current.includes('use_trans_macros')) {
      let functionToCopy = current.split('COPY FUNCTION START')[2].split('\n// COPY FUNCTION STOP')[0]
      functionToCopy = functionToCopy.replace('requestInfosPostgres', 'requestInfosSqlite')
      functionToCopy = functionToCopy.replace(
        '{ alias: alias_postgres, schema: schema_postgres, drizzleCient: drizzle_postgress(pgClient as any) }',
        '{ alias: alias_sqlite, schema: schema_sqlite, drizzleCient: drizzle_sqlite(getEnv(\'DB\') as any) }',
      )
      functionToCopy = functionToCopy.replace('const pgClient = postgres(supaUrl)', '// removed line')
      functionToCopy = functionToCopy.replace('alias: typeof alias_postgres', 'alias: typeof alias_sqlite')
      functionToCopy = functionToCopy.replace('typeof drizzle_postgress', 'typeof drizzle_sqlite')
      functionToCopy = functionToCopy.replace('typeof schema_postgres', 'typeof schema_sqlite')

      // functionToCopy = functionToCopy.replace('const supaUrl = getEnv(\'SUPABASE_DB_URL\')!', '// Removed line')

      current = current.replace(/(.*(?:requestInfosSqlite).*)/, functionToCopy)
    }
    return current
  },
  },
  { transform: (current) => {
    if (current.includes('use_trans_macros')) {
      let functionToCopy = current.split('COPY FUNCTION START')[1].split('\n// COPY FUNCTION STOP')[0]
      functionToCopy = functionToCopy.replace('getDrizzlePostgres', 'getDrizzleSqlite')
      functionToCopy = functionToCopy.replace(
        '{ alias: alias_postgres, schema: schema_postgres, drizzleCient: drizzle_postgress(pgClient as any) }',
        '{ alias: alias_sqlite, schema: schema_sqlite, drizzleCient: drizzle_sqlite(getEnv(\'DB\') as any) }',
      )
      functionToCopy = functionToCopy.replace('const pgClient = postgres(supaUrl)', '// removed line')
      functionToCopy = functionToCopy.replace('globalPgClient = pgClient', '// removed line')
      functionToCopy = functionToCopy.replace('const supaUrl = getEnv(\'SUPABASE_DB_URL\')!', '// removed line')

      // functionToCopy = functionToCopy.replace('const supaUrl = getEnv(\'SUPABASE_DB_URL\')!', '// Removed line')

      current = current.replace(/(.*(?:getDrizzleSqlite).*)/, functionToCopy)
    }
    return current
  } },
  // { from: 'const bucket = \'capgo\'', to: 'const bucket = \'capgo\'\nimport { Buffer } from \'node:buffer\'' }
  // { from: supaTempl.redis, to: netlifyTempl.redis },
  // { from: '.ts\'', to: '\'' },
]
// list deno functions folder and filter by allowed

const folders = readdirSync(baseSupaFunctions).filter(f => allowed.includes(f) || background.includes(f))
const foldersNoBg = readdirSync(baseSupaFunctions).filter(f => allowed.includes(f))
const foldersBg = readdirSync(baseSupaFunctions).filter(f => allowed.includes(f) || background.includes(f))

console.log(`Api found: ${folders.join(', ')}\n`)
// create list of files from folders folder/index.ts

const files = folders.map(f => `${baseSupaFunctions}/${f}/index.ts`)
const filesBg = foldersBg.map(f => `${baseSupaFunctions}/${f}/index.ts`)
// console.log('supabase files', files)

// create list of netlify functions from files supabase/functions/folder/index.ts -> netlify/functions/folder.ts
const netlifyFiles = files.map(f => f.replace(`${baseSupaFunctions}/`, `${baseNetlifyFunctions}/`).replace('/index.ts', '.ts'))
const netlifyBgFiles = filesBg.map(f => f.replace(`${baseSupaFunctions}/`, `${baseNetlifyFunctions}/`).replace('/index.ts', '-background.ts'))
// const onlyNodeNetlify = onlyNode.map(f => `${baseNetlifyFunctions}/${f}.ts`)
const netlifyEdgeFiles = files.map(f => f.replace(`${baseSupaFunctions}/`, `${baseNetlifyEdgeFunctions}/`).replace('/index.ts', '.ts'))
const cloudflareFiles = files.map(f => f.replace(`${baseSupaFunctions}/`, `${baseNetlifyCloudflare}/`).replace('/index.ts', '.ts'))
// create netlify/functions folder if not exists
try {
  readdirSync(baseNetlifyFunctions)
}
catch (e) {
  console.log(`Creating folder: ${baseNetlifyFunctions}`)
  mkdirSync(baseNetlifyFunctions, { recursive: true })
}
try {
  readdirSync(baseNetlifyEdgeFunctions)
}
catch (e) {
  console.log(`Creating folder: ${baseNetlifyEdgeFunctions}`)
  mkdirSync(baseNetlifyEdgeFunctions, { recursive: true })
}

try {
  readdirSync(baseNetlifyCloudflare)
}
catch (e) {
  console.log(`Creating folder: ${baseNetlifyCloudflare}`)
  mkdirSync(baseNetlifyCloudflare, { recursive: true })
}

function applyMutations(mutations, content) {
  mutations.forEach((m) => {
    const { from, to, transform, force } = m
    if (transform) {
      content = transform(content)
    }
    else {
      const regexp = new RegExp(`${escapeRegExp(from)}${!force ? '(?=.*(?<!do_not_change)$)' : ''}`, 'gm')
      content = content.replace(regexp, to)
    }
  })

  return content
}

for (let i = 0; i < files.length; i++) {
  const file = files[i]
  const netlifyFile = netlifyFiles[i]
  const netlifyEdgeFile = netlifyEdgeFiles[i]
  const netlifyBgFile = netlifyBgFiles[i]
  const cloudflareFile = cloudflareFiles[i]

  // console.log('file', file)
  // console.log('netlifyFile', netlifyFile)
  // replace imports
  const content = readFileSync(file, 'utf8')

  let newContent = `// This code is generated don't modify it\n${content}`
  newContent = applyMutations(mutationsNode, newContent)

  let newContentEdge = `// This code is generated don't modify it\n${content}`
  newContentEdge = applyMutations(mutationsEgde, newContentEdge)

  let newContentBg = `${newContent}`
  newContentBg = applyMutations(mutationsBg, newContentBg)

  let newContentCloudflare = `// This code is generated don't modify it\n${content}`
  newContentCloudflare = applyMutations(mutationCloudflare, newContentCloudflare)

  // write in new path
  console.log('Generate :', netlifyFile)
  if (background.includes(folders[i])) {
    writeFileSync(netlifyBgFile, newContentBg)
  }
  else {
    writeFileSync(netlifyFile, newContent)
    writeFileSync(netlifyEdgeFile, newContentEdge)
    writeFileSync(cloudflareFile, newContentCloudflare)
  }
}

try {
  const files = readdirSync(baseNetlifyUtils)
  if (!files.length)
    throw new Error('utils folder is empty')
}
catch (e) {
  // copy baseSupaUtils folder content to baseNetlifyUtils
  console.log(`Creating folder: ${baseNetlifyUtils}`)
  mkdirSync(baseNetlifyUtils, { recursive: true })
  mkdirSync(baseNetlifyEgdeUtils, { recursive: true })
  mkdirSync(baseCloudflareUtils, { recursive: true })
  const utilsFiles = readdirSync(baseSupaUtils)
  utilsFiles.forEach((f) => {
    const fileName = f.split('.')[0]
    if (allowedUtil.includes(fileName)) {
      const content = readFileSync(`${baseSupaUtils}/${f}`, 'utf8')
      let newContent = `// This code is generated don't modify it\n${content}`
      newContent = applyMutations(mutationsNode, newContent)

      let newContentEdge = `// This code is generated don't modify it\n${content}`
      newContentEdge = applyMutations(mutationsEgde, newContentEdge)

      let newContentCloudfare = `// This code is generated don't modify it\n${content}`
      newContentCloudfare = applyMutations(mutationCloudflare, newContentCloudfare)

      console.log('Generate :', `${baseNetlifyUtils}/${f}`)
      writeFileSync(`${baseNetlifyUtils}/${f}`, newContent)
      writeFileSync(`${baseNetlifyEgdeUtils}/${f}`, newContentEdge)
      writeFileSync(`${baseCloudflareUtils}/${f}`, newContentCloudfare)
    }
  })
}

try {
  const files = readdirSync(baseNetlifyTests)
  if (!files.length)
    throw new Error('test folder is empty')
}
catch (e) {
  console.log(`Creating folder: ${baseNetlifyTests}`)
  mkdirSync(baseNetlifyTests, { recursive: true })
  mkdirSync(baseNetlifyEdgeTests, { recursive: true })
  mkdirSync(baseCloudflareTests, { recursive: true })
  const testFiles = readdirSync(baseSupaTests)
  testFiles.forEach((f) => {
    // if allowedUtil file copy to netlify/_utils
    const content = readFileSync(`${baseSupaTests}/${f}`, 'utf8')
    let newContent = `// This code is generated don't modify it\n${content}`
    newContent = applyMutations(mutationsNode, newContent)

    let newContentEdge = `// This code is generated don't modify it\n${content}`
    newContentEdge = applyMutations(mutationsEgde, newContentEdge)

    let newContentCloudflare = `// This code is generated don't modify it\n${content}`
    newContentCloudflare = applyMutations(mutationCloudflare, newContentCloudflare)

    console.log('Generate :', `${baseNetlifyTests}/${f}`)
    writeFileSync(`${baseNetlifyTests}/${f}`, newContent)
    writeFileSync(`${baseNetlifyEdgeTests}/${f}`, newContentEdge)
    writeFileSync(`${baseCloudflareTests}/${f}`, newContentCloudflare)
  })
}

// baseNetlifyConfig readFileSync
const contentNetlifyConfig = readFileSync(baseNetlifyConfig, 'utf8')
// split content with "# auto egde generate"
const [before] = contentNetlifyConfig.split(splitNetlifyConfig)
// create new content
//  for each folders create this line
// [[edge_functions]]
//   path = "/admin"
//   function = "auth"
const newContentEdge = foldersNoBg.map((name) => {
  return `
[[edge_functions]]
  path = "/api-edge/${name}"
  function = "${name}"

[[edge_functions]]
  path = "/${name}"
  function = "${name}"
`
})
const newContent = `${before}${splitNetlifyConfig}
${newContentEdge.join('')}
`
// write new content
writeFileSync(baseNetlifyConfig, newContent)
