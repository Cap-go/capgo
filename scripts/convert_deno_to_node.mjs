// create a node bundle from a deno bundle
// netlify/functions/bundle.ts

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'fs'

const baseSupa = 'supabase'
const baseNetlify = 'netlify'
const baseUtils = '_utils'
const baseFunctions = 'functions'
const baseSupaFunctions = `${baseSupa}/${baseFunctions}`
const baseNetlifyFunctions = `${baseNetlify}/${baseFunctions}`
const baseSupaUtils = `${baseSupa}/${baseFunctions}/${baseUtils}`
const baseNetlifyUtils = `${baseNetlify}/${baseUtils}`
const allowed = ['bundle', 'channel_self', 'ok', 'stats', 'website_stats', 'channel', 'device', 'plans', 'updates']
const importMutation = [
  { 'https://cdn.logsnag.com/deno/.*/index.ts': 'logsnag' },
  { 'https://esm.sh/@supabase/supabase-js@^2.1.2': '@supabase/supabase-js' },
  { 'https://deno.land/x/axiod@0.26.2/mod.ts': 'axios' },
  { 'https://cdn.skypack.dev/cron-schedule@3.0.6?dts': 'cron-schedule' },
  { 'https://cdn.skypack.dev/dayjs@1.11.6?dts': 'dayjs' },
  { 'https://deno.land/x/hmac@v2.0.1/mod.ts': 'cron-schedule' },
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
  importMutation.forEach((m) => {
    const [from, to] = Object.entries(m)[0]
    newContent = newContent.replace(from, to)
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
    const content = readFileSync(`${baseSupaUtils}/${f}`, 'utf8')
    let newContent = `// This code is generated don't modify it\n${content}`
    importMutation.forEach((m) => {
      const [from, to] = Object.entries(m)[0]
      newContent = newContent.replace(from, to)
    })
    writeFileSync(`${baseNetlifyUtils}/${f}`, newContent)
  })
}
