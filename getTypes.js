const { exec } = require('child_process')
const keys = require('./configs.json')
require('dotenv').config()

const getRightKey = (branch, keyname) => {
  if (branch === 'local')
    return keys[keyname].development
  else if (branch === 'development')
    return keys[keyname].development
  return keys[keyname].prod
}
const supa_url = getRightKey(process.env.BRANCH || 'development', 'supa_url')
const supa_anon = getRightKey(process.env.BRANCH || 'development', 'supa_anon')
const url = `${supa_url}/rest/v1/\?apikey\=${supa_anon}`
const command = `npx openapi-typescript ${url} --output src/types/supabase.ts`
exec(command, (error, stdout, stderr) => {
  if (error) {
    console.log(`error: ${error.message}`)
    return
  }
  if (stderr) {
    console.log(`${stderr}`)
    return
  }
  console.log(`${stdout}`)
})
exec('cp src/types/supabase.ts supabase/functions/_utils/types_supabase.ts', (error, stdout, stderr) => {
  if (error) {
    console.log(`error: ${error.message}`)
    return
  }
  if (stderr) {
    console.log(`${stderr}`)
    return
  }
  console.log(`${stdout}`)
})
