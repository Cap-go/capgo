// create a node bundle from a deno bundle
// netlify/functions/bundle.ts

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'fs'

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
const allowed = ['bundle', 'channel_self', 'ok', 'stats', 'website_stats', 'channel', 'device', 'plans', 'updates']
const allowedUtil = ['utils', 'types', 'supabase', 'supabase.types', 'invalids_ip', 'plans', 'logsnag', 'crisp', 'notifications', 'stripe']

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
// console.log('netlifyTempl', netlifyTempl)
// escape url for regex
export const encodeBase64 = (data) => {
  return Buffer.from(data).toString('base64')
}
export const decodeBase64 = (data) => {
  return Buffer.from(data, 'base64').toString('ascii')
}
const escapeRegExp = string => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const mutations = [
  { from: 'https://cdn.logsnag.com/deno/0.1.5/index.ts', to: 'logsnag' },
  { from: 'https://esm.sh/@supabase/supabase-js@^2.1.2', to: '@supabase/supabase-js' },
  { from: 'https://deno.land/x/axiod@0.26.2/mod.ts', to: 'axios' },
  { from: 'https://cdn.skypack.dev/cron-schedule@3.0.6?dts', to: 'cron-schedule' },
  { from: 'https://cdn.skypack.dev/dayjs@1.11.6?dts', to: 'dayjs' },
  { from: 'https://deno.land/x/semver@v1.4.1/mod.ts', to: 'semver' },
  { from: 'https://deno.land/x/equal@v1.5.0/mod.ts', to: 'lauqe' },
  { from: 'import { hmac } from \'https://deno.land/x/hmac@v2.0.1/mod.ts\'', to: 'import crypto from \'crypto\'' },
  { from: 'import { cryptoRandomString } from \'https://deno.land/x/crypto_random_string@1.1.0/mod.ts\'', to: 'import cryptoRandomString from \'crypto-random-string\'' },
  { from: 'import { serve } from \'https://deno.land/std@0.170.0/http/server.ts\'', to: 'import type { Handler } from \'@netlify/functions\'' },
  { from: 'Promise<Response>', to: 'Promise<any>' },
  { from: 'btoa(STRIPE_TOKEN)', to: 'Buffer.from(STRIPE_TOKEN).toString(\'base64\')' },
  { from: supaTempl.handler, to: netlifyTempl.handler },
  { from: supaTempl.getEnv, to: netlifyTempl.getEnv },
  { from: supaTempl.res, to: netlifyTempl.res },
  { from: supaTempl.hmac, to: netlifyTempl.hmac },
  { from: '.ts\'', to: '\'' },
]
const mutationsEgde = [
  { from: '../_tests/', to: `../${baseEdgeFunctions}_tests/` },
  { from: '../_utils/', to: `../${baseEdgeFunctions}_utils/` },
  { from: 'import { serve } from \'https://deno.land/std@0.170.0/http/server.ts\'', to: 'import type { Context } from \'https://edge.netlify.com\'' },
  { from: supaTempl.handler, to: netlifyEdgeTempl.handler },
]
// list deno functions folder and filter by allowed

const folders = readdirSync(baseSupaFunctions).filter(f => allowed.includes(f))

console.log(`Api found: ${folders.join(', ')}\n`)
// create list of files from folders folder/index.ts

const files = folders.map(f => `${baseSupaFunctions}/${f}/index.ts`)
// console.log('supabase files', files)

// create list of netlify functions from files supabase/functions/folder/index.ts -> netlify/functions/folder.ts
const netlifyFiles = files.map(f => f.replace(`${baseSupaFunctions}/`, `${baseNetlifyFunctions}/`).replace('/index.ts', '.ts'))
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

// console.log('netlify files', netlifyFiles)

for (let i = 0; i < files.length; i++) {
  const file = files[i]
  const netlifyFile = netlifyFiles[i]
  const netlifyEdgeFile = netlifyEdgeFiles[i]
  // console.log('file', file)
  // console.log('netlifyFile', netlifyFile)
  // replace imports
  const content = readFileSync(file, 'utf8')
  let newContent = `// This code is generated don't modify it\n${content}`
  mutations.forEach((m) => {
    const { from, to } = m
    newContent = newContent.replace(new RegExp(escapeRegExp(from), 'g'), to)
  })
  let newContentEdge = `// This code is generated don't modify it\n${content}`
  mutationsEgde.forEach((m) => {
    const { from, to } = m
    newContentEdge = newContentEdge.replace(new RegExp(escapeRegExp(from), 'g'), to)
  })
  // write in new path
  console.log('Generate :', netlifyFile)
  writeFileSync(netlifyFile, newContent)
  writeFileSync(netlifyEdgeFile, newContentEdge)
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
      mutations.forEach((m) => {
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
    mutations.forEach((m) => {
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
const newContentEdge = folders.map((name) => {
  return `
[[edge_functions]]
  path = "/api-edge/${name}"
  function = "${name}"
`
})
const newContent = `${before}${splitNetlifyConfig}
${newContentEdge.join('')}
`
// write new content
writeFileSync(baseNetlifyConfig, newContent)
