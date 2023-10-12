/* eslint-disable n/prefer-global/buffer */
// create a node bundle from a deno bundle
// netlify/functions/bundle.ts
// this script is run on netlify to create netlify function, background function and egde function from supabase functions

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'

const baseSupa = 'supabase'
const baseNetlify = 'netlify'
const baseNetlifyConfig = 'netlify.toml'
const baseNetlifyEgde = 'netlify-edge'
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
const baseSupaFunctions = `${baseSupa}/${baseFunctions}`
const baseNetlifyFunctions = `${baseNetlify}/${baseFunctions}`
const baseNetlifyEdgeFunctions = `${baseNetlify}/${baseEdgeFunctions}`
const baseSupaUtils = `${baseSupa}/${baseFunctions}/${baseUtils}`
const baseSupaTests = `${baseSupa}/${baseFunctions}/${baseTests}`
const baseNetlifyTests = `${baseNetlify}/${baseTests}`
const baseNetlifyUtils = `${baseNetlify}/${baseUtils}`
const baseNetlifyEdgeTests = `${baseNetlify}/${baseEdgeFunctions + baseTests}`
const baseNetlifyEgdeUtils = `${baseNetlify}/${baseEdgeFunctions + baseUtils}`
const allowed = ['bundle', 'channel_self', 'ok', 'stats', 'website_stats', 'channel', 'device', 'plans', 'updates', 'store_top', 'updates_redis']
const background = ['web_stats', 'cron_good_plan', 'get_framework', 'get_top_apk', 'get_similar_app', 'get_store_info', 'cron_email']
// const onlyNode = ['get_framework-background', 'get_top_apk-background', 'get_similar_app-background', 'get_store_info-background']
const allowedUtil = ['utils', 'conversion', 'types', 'supabase', 'supabase.types', 'invalids_ip', 'plans', 'logsnag', 'crisp', 'plunk', 'notifications', 'stripe', 'r2', 'downloadUrl', 'gplay_categ', 'update', 'redis', 'clickhouse']

const supaTempl = {}
const netlifyTempl = {}
const netlifyEdgeTempl = {}
// list files in baseSupaTemplate
const supaTemplFiles = readdirSync(baseSupaTemplate)
const netlifyTemplFiles = readdirSync(baseNetlifyTemplate)
const netlifyEdgeTemplFiles = readdirSync(baseNetlifyEdgeTemplate)
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
  { from: 'https://esm.sh/@supabase/supabase-js@^2.2.3', to: '@supabase/supabase-js' },
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
  { from: 'import { serve } from \'https://deno.land/std@0.200.0/http/server.ts\'', to: 'import type { Handler } from \'@netlify/functions\'' },
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
  { from: 'import { serve } from \'https://deno.land/std@0.200.0/http/server.ts\'', to: 'import type { Context } from \'https://edge.netlify.com\'' },
  { from: supaTempl.handler, to: netlifyEdgeTempl.handler },
]
const mutationsBg = [
  { from: 'sendRes(', to: 'sendResBg(' },
  { from: ', sendRes', to: ', sendResBg' },
  { from: '{ sendRes', to: '{ sendResBg' },
  { from: 'Handler', to: 'BackgroundHandler' },
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

for (let i = 0; i < files.length; i++) {
  const file = files[i]
  const netlifyFile = netlifyFiles[i]
  const netlifyEdgeFile = netlifyEdgeFiles[i]
  const netlifyBgFile = netlifyBgFiles[i]
  // console.log('file', file)
  // console.log('netlifyFile', netlifyFile)
  // replace imports
  const content = readFileSync(file, 'utf8')
  let newContent = `// This code is generated don't modify it\n${content}`
  mutationsNode.forEach((m) => {
    const { from, to } = m
    newContent = newContent.replace(new RegExp(escapeRegExp(from), 'g'), to)
  })
  let newContentEdge = `// This code is generated don't modify it\n${content}`
  mutationsEgde.forEach((m) => {
    const { from, to } = m
    newContentEdge = newContentEdge.replace(new RegExp(escapeRegExp(from), 'g'), to)
  })
  let newContentBg = `${newContent}`
  mutationsBg.forEach((m) => {
    const { from, to } = m
    newContentBg = newContentBg.replace(new RegExp(escapeRegExp(from), 'g'), to)
  })
  // write in new path
  console.log('Generate :', netlifyFile)
  if (background.includes(folders[i])) {
    writeFileSync(netlifyBgFile, newContentBg)
  }
  else {
    writeFileSync(netlifyFile, newContent)
    writeFileSync(netlifyEdgeFile, newContentEdge)
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
  const utilsFiles = readdirSync(baseSupaUtils)
  utilsFiles.forEach((f) => {
    const fileName = f.split('.')[0]
    if (allowedUtil.includes(fileName)) {
      const content = readFileSync(`${baseSupaUtils}/${f}`, 'utf8')
      let newContent = `// This code is generated don't modify it\n${content}`
      mutationsNode.forEach((m) => {
        const { from, to } = m
        newContent = newContent.replace(new RegExp(escapeRegExp(from), 'g'), to)
      })
      let newContentEdge = `// This code is generated don't modify it\n${content}`
      mutationsEgde.forEach((m) => {
        const { from, to } = m
        newContentEdge = newContentEdge.replace(new RegExp(escapeRegExp(from), 'g'), to)
      })
      console.log('Generate :', `${baseNetlifyUtils}/${f}`)
      writeFileSync(`${baseNetlifyUtils}/${f}`, newContent)
      writeFileSync(`${baseNetlifyEgdeUtils}/${f}`, newContentEdge)
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
  const testFiles = readdirSync(baseSupaTests)
  testFiles.forEach((f) => {
    // if allowedUtil file copy to netlify/_utils
    const content = readFileSync(`${baseSupaTests}/${f}`, 'utf8')
    let newContent = `// This code is generated don't modify it\n${content}`
    mutationsNode.forEach((m) => {
      const { from, to } = m
      newContent = newContent.replace(new RegExp(escapeRegExp(from), 'g'), to)
    })
    let newContentEdge = `// This code is generated don't modify it\n${content}`
    mutationsEgde.forEach((m) => {
      const { from, to } = m
      newContentEdge = newContentEdge.replace(new RegExp(escapeRegExp(from), 'g'), to)
    })
    console.log('Generate :', `${baseNetlifyTests}/${f}`)
    writeFileSync(`${baseNetlifyTests}/${f}`, newContent)
    writeFileSync(`${baseNetlifyEdgeTests}/${f}`, newContentEdge)
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
