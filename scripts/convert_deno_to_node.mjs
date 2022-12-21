// create a node bundle from a deno bundle
// netlify/functions/bundle.ts

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'fs'

const baseSupa = 'supabase'
const baseNetlify = 'netlify'
const baseUtils = '_utils'
const baseTests = '_tests'
const baseFunctions = 'functions'
const baseScripts = 'scripts'
const baseTemplate = 'template'
const baseSupaTemplate = `${baseScripts}/${baseTemplate}/${baseSupa}`
const baseNetlifyTemplate = `${baseScripts}/${baseTemplate}/${baseNetlify}`
const baseSupaFunctions = `${baseSupa}/${baseFunctions}`
const baseNetlifyFunctions = `${baseNetlify}/${baseFunctions}`
const baseSupaUtils = `${baseSupa}/${baseFunctions}/${baseUtils}`
const baseSupaTests = `${baseSupa}/${baseFunctions}/${baseTests}`
const baseNetlifyTests = `${baseNetlify}/${baseTests}`
const baseNetlifyUtils = `${baseNetlify}/${baseUtils}`
const allowed = ['bundle', 'channel_self', 'ok', 'stats', 'website_stats', 'channel', 'device', 'plans', 'updates']
const allowedUtil = ['utils', 'types', 'supabase', 'supabase.types', 'invalids_ip', 'plans', 'logsnag', 'crisp', 'notifications']

const supaTempl = {}
const netlifyTempl = {}
// list files in baseSupaTemplate
const supaTemplFiles = readdirSync(baseSupaTemplate)
const netlifyTemplFiles = readdirSync(baseNetlifyTemplate)
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

// console.log('supaTempl', supaTempl)
// console.log('netlifyTempl', netlifyTempl)
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
  { from: supaTempl.handler, to: netlifyTempl.handler },
  { from: supaTempl.getEnv, to: netlifyTempl.getEnv },
  { from: supaTempl.res, to: netlifyTempl.res },
  { from: supaTempl.hmac, to: netlifyTempl.hmac },
  { from: '.ts\'', to: '\'' },
]
// list deno functions folder and filter by allowed

const folders = readdirSync(baseSupaFunctions).filter(f => allowed.includes(f))

console.log(`Api found: ${folders.join(', ')}\n`)
// create list of files from folders folder/index.ts

const files = folders.map(f => `${baseSupaFunctions}/${f}/index.ts`)
// console.log('supabase files', files)

// create list of netlify functions from files supabase/functions/folder/index.ts -> netlify/functions/folder.ts
const netlifyFiles = files.map(f => f.replace(`${baseSupaFunctions}/`, `${baseNetlifyFunctions}/`).replace('/index.ts', '.ts'))
// create netlify/functions folder if not exists
try {
  readdirSync('baseNetlifyFunctions')
}
catch (e) {
  console.log(`Creating folder: ${baseNetlifyFunctions}`)
  mkdirSync(baseNetlifyFunctions, { recursive: true })
}

// console.log('netlify files', netlifyFiles)

for (let i = 0; i < files.length; i++) {
  const file = files[i]
  const netlifyFile = netlifyFiles[i]
  // console.log('file', file)
  // console.log('netlifyFile', netlifyFile)
  // replace imports
  const content = readFileSync(file, 'utf8')
  let newContent = `// This code is generated don't modify it\n${content}`
  mutations.forEach((m) => {
    const { from, to } = m
    newContent = newContent.replace(new RegExp(escapeRegExp(from), 'g'), to)
  })
  // write in new path
  console.log('Generate :', netlifyFile)
  writeFileSync(netlifyFile, newContent)
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
  const utilsFiles = readdirSync(baseSupaUtils)
  utilsFiles.forEach((f) => {
    const fileName = f.split('.')[0]
    if (allowedUtil.includes(fileName)) {
      const content = readFileSync(`${baseSupaUtils}/${f}`, 'utf8')
      let newContent = `// This code is generated don't modify it\n${content}`
      mutations.forEach((m) => {
        const { from, to } = m
        newContent = newContent.replace(new RegExp(escapeRegExp(from), 'g'), to)
      })
      console.log('Generate :', `${baseNetlifyUtils}/${f}`)
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
  console.log(`Creating folder: ${baseNetlifyTests}`)
  mkdirSync(baseNetlifyTests, { recursive: true })
  const testFiles = readdirSync(baseSupaTests)
  testFiles.forEach((f) => {
    // if allowedUtil file copy to netlify/_utils
    const content = readFileSync(`${baseSupaTests}/${f}`, 'utf8')
    let newContent = `// This code is generated don't modify it\n${content}`
    mutations.forEach((m) => {
      const { from, to } = m
      newContent = newContent.replace(new RegExp(escapeRegExp(from), 'g'), to)
    })
    console.log('Generate :', `${baseNetlifyTests}/${f}`)
    writeFileSync(`${baseNetlifyTests}/${f}`, newContent)
  })
}
