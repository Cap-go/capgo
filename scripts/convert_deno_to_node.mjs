// create a node bundle from a deno bundle
// netlify/functions/bundle.ts

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'fs'

const baseSupa = 'supabase'
const baseNetlify = 'netlify'
const baseUtils = '_utils'
const baseTests = '_tests'
const baseFunctions = 'functions'
const baseSupaFunctions = `${baseSupa}/${baseFunctions}`
const baseNetlifyFunctions = `${baseNetlify}/${baseFunctions}`
const baseSupaUtils = `${baseSupa}/${baseFunctions}/${baseUtils}`
const baseSupaTests = `${baseSupa}/${baseFunctions}/${baseTests}`
const baseNetlifyTests = `${baseNetlify}/${baseTests}`
const baseNetlifyUtils = `${baseNetlify}/${baseUtils}`
const allowed = ['bundle', 'channel_self', 'ok', 'stats', 'website_stats', 'channel', 'device', 'plans', 'updates']
const allowedUtil = ['utils', 'types', 'supabase', 'supabase.types', 'invalids_ip', 'plans', 'logsnag', 'crisp', 'notifications']
const supabaseHandler = `serve(async (event: Request) => {
  try {
    const url: URL = new URL(event.url)
    const headers: BaseHeaders = Object.fromEntries(event.headers.entries())
    const method: string = event.method
    const body: any = methodJson.includes(method) ? await event.json() : Object.fromEntries(url.searchParams.entries())
    return main(url, headers, method, body)
  }
  catch (e) {
    return sendRes({ status: 'Error', error: JSON.stringify(e) }, 500)
  }
})`

const netlifyHandler = `export const handler: Handler = async (event) => {
  try {
    const url: URL = new URL(event.rawUrl)
    const headers: BaseHeaders = { ...event.headers }
    const method: string = event.httpMethod
    const body: any = methodJson.includes(method) ? await event.body : Object.fromEntries(url.searchParams.entries())
    return main(url, headers, method, body)
  }
  catch (e) {
    return sendRes({ status: 'Error', error: JSON.stringify(e) }, 500)
  }
}
`

const supabaseEnvFunction = `export const getEnv = (key: string): string => {
  const val = Deno.env.get(key)
  return val || ''
}`

const netlifyEnvFunction = `export const getEnv = (key: string): string => {
  const val = process.env[key]
  return val || ''
}`

const supabaseRes = `export const sendRes = (data: any = { status: 'ok' }, statusCode = 200) => {
  if (statusCode >= 400)
    console.error('sendRes error', JSON.stringify(data, null, 2))

  return new Response(
    JSON.stringify(data),
    {
      status: statusCode,
      headers: { ...basicHeaders, ...corsHeaders },
    },
  )
}`

const netlifyRes = `export const sendRes = (data: any = { status: 'ok' }, statusCode = 200) => {
  if (statusCode >= 400)
    console.error('sendRes error', JSON.stringify(data, null, 2))

  return {
    statusCode,
    headers: { ...basicHeaders, ...corsHeaders },
    body: JSON.stringify(data),
  }
}`

const hmacSupabase = `export const createHmac = (data: string, details: Details) => {
  return hmac('sha256', getEnv('STRIPE_WEBHOOK_SECRET') || '', makeHMACContent(data, details), 'utf8', 'hex')
}`

const hmacNetlify = `export const createHmac = (data: string, details: Details) => {
  const hmac = crypto.createHmac('sha256', getEnv('STRIPE_WEBHOOK_SECRET'))
  hmac.write(makeHMACContent(data, details))
  hmac.end()
  return hmac.read().toString('hex')
}`

// escape url for regex
const escapeRegExp = string => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const mutations = [
  { from: 'https://cdn.logsnag.com/deno/0.1.5/index.ts', to: 'logsnag' },
  { from: 'https://esm.sh/@supabase/supabase-js@^2.1.2', to: '@supabase/supabase-js' },
  { from: 'https://deno.land/x/axiod@0.26.2/mod.ts', to: 'axios' },
  { from: 'https://cdn.skypack.dev/cron-schedule@3.0.6?dts', to: 'cron-schedule' },
  { from: 'https://cdn.skypack.dev/dayjs@1.11.6?dts', to: 'dayjs' },
  { from: 'https://deno.land/x/semver@v1.4.1/mod.ts', to: 'semver' },
  { from: 'import { hmac } from \'https://deno.land/x/hmac@v2.0.1/mod.ts\'', to: 'import crypto from \'crypto\'' },
  { from: 'import { cryptoRandomString } from \'https://deno.land/x/crypto_random_string@1.1.0/mod.ts\'', to: 'import cryptoRandomString from \'crypto-random-string\'' },
  { from: 'import { serve } from \'https://deno.land/std@0.167.0/http/server.ts\'', to: 'import type { Handler } from \'@netlify/functions\'' },
  { from: 'Promise<Response>', to: 'Promise<any>' },
  { from: supabaseHandler, to: netlifyHandler },
  { from: supabaseEnvFunction, to: netlifyEnvFunction },
  { from: supabaseRes, to: netlifyRes },
  { from: hmacSupabase, to: hmacNetlify },
  { from: '.ts\'', to: '\'' },
]
// list deno functions folder and filter by allowed

const folders = readdirSync(baseSupaFunctions).filter(f => allowed.includes(f))

console.log('folders', folders)
// create list of files from folders folder/index.ts

const files = folders.map(f => `${baseSupaFunctions}/${f}/index.ts`)
console.log('files', files)

// create list of netlify functions from files supabase/functions/folder/index.ts -> netlify/functions/folder.ts
const netlifyFiles = files.map(f => f.replace(`${baseSupaFunctions}/`, `${baseNetlifyFunctions}/`).replace('/index.ts', '.ts'))
// create netlify/functions folder if not exists
try {
  readdirSync('baseNetlifyFunctions')
}
catch (e) {
  console.log(`creating ${baseNetlifyFunctions} folder`)
  mkdirSync(baseNetlifyFunctions, { recursive: true })
}

console.log('netlifyFiles', netlifyFiles)

for (let i = 0; i < files.length; i++) {
  const file = files[i]
  const netlifyFile = netlifyFiles[i]
  console.log('file', file)
  console.log('netlifyFile', netlifyFile)
  // replace imports
  const content = readFileSync(file, 'utf8')
  let newContent = `// This code is generated don't modify it\n${content}`
  mutations.forEach((m) => {
    const { from, to } = m
    newContent = newContent.replace(new RegExp(escapeRegExp(from), 'g'), to)
  })
  // write in new path
  writeFileSync(netlifyFile, newContent)
}

try {
  const files = readdirSync(baseNetlifyUtils)
  if (!files.length)
    throw new Error('utils folder is empty')
}
catch (e) {
  // copy baseSupaUtils folder content to baseNetlifyUtils
  console.log(`creating ${baseNetlifyUtils} folder`)
  mkdirSync(baseNetlifyUtils, { recursive: true })
  const utilsFiles = readdirSync(baseSupaUtils)
  utilsFiles.forEach((f) => {
    const fileName = f.split('.')[0]
    console.log('fileName', fileName)
    if (allowedUtil.includes(fileName)) {
      const content = readFileSync(`${baseSupaUtils}/${f}`, 'utf8')
      let newContent = `// This code is generated don't modify it\n${content}`
      mutations.forEach((m) => {
        const { from, to } = m
        newContent = newContent.replace(new RegExp(escapeRegExp(from), 'g'), to)
      })
      writeFileSync(`${baseNetlifyUtils}/${f}`, newContent)
    }
  })
}

try {
  const files = readdirSync(baseNetlifyTests)
  if (!files.length)
    throw new Error('test folder is empty')
}
catch (e) {
  console.log(`creating ${baseNetlifyTests} folder`)
  mkdirSync(baseNetlifyTests, { recursive: true })
  const testFiles = readdirSync(baseSupaTests)
  testFiles.forEach((f) => {
    const fileName = f.split('.')[0]
    console.log('fileName', fileName)
    // if allowedUtil file copy to netlify/_utils
    const content = readFileSync(`${baseSupaTests}/${f}`, 'utf8')
    let newContent = `// This code is generated don't modify it\n${content}`
    mutations.forEach((m) => {
      const { from, to } = m
      newContent = newContent.replace(new RegExp(escapeRegExp(from), 'g'), to)
    })
    writeFileSync(`${baseNetlifyTests}/${f}`, newContent)
  })
}
