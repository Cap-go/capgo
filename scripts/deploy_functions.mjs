import fs from 'fs'
import util from 'util'
import { exec as execCb } from 'child_process'
import { exit } from 'process'
import { homedir } from 'os'
import { supa_url } from './utils.mjs'

const exec = util.promisify(execCb)
const folders = fs.readdirSync('./supabase/functions').filter(file => !file.startsWith('_'))
const calls = []

const token = process.env.SUPABASE_TOKEN || ''
const projectRef = supa_url.split('.')[0].replace('https://', '')

folders.forEach((folder) => {
  const file = `./supabase/functions/${folder}/.no_verify_jwt`
  let command = `supabase functions deploy ${folder}`
  let no_verify_jwt = false
  if (fs.existsSync(file)) {
    command += ' --no-verify-jwt'
    no_verify_jwt = true
  }
  calls.push(exec(command).then((r) => {
    if (r.stderr)
      console.error(folder, r.stderr)
    else
      console.log(`Upload done for ${folder}${no_verify_jwt ? ' no_verify_jwt' : ''} ✅`)
    return r
  }))
})

try {
  console.log('projectRef', projectRef)
  fs.writeFileSync('./supabase/.temp/project-ref', projectRef)
  if (!token) {
    console.error('SUPABASE_TOKEN is not set')
    exit(1)
  }
  fs.writeFileSync(`${homedir()}/.supabase/access-token`, token)
  await Promise.all(calls)
}
catch (e) {
  console.error(e) // should contain code (exit code) and signal (that caused the termination).
  exit(1)
}
