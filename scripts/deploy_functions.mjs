import fs from 'fs'
import util from 'util'
import { exec as execCb } from 'child_process'
import { exit } from 'process'

const exec = util.promisify(execCb)
const folders = fs.readdirSync('./supabase/functions').filter(file => !file.startsWith('_'))
const calls = []
const functions = []

folders.forEach((folder) => {
  const file = `./supabase/functions/${folder}/.no_verify_jwt`
  let command = `supabase functions deploy ${folder}`
  if (fs.existsSync(file))
    command += ' --no-verify-jwt'
  calls.push(exec(command))
  functions.push({
    name: folder,
    no_verify_jwt: fs.existsSync(file),
  })
})

try {
  const res = await Promise.all(calls)
  res.forEach((r, i) => {
    if (r.stderr)
      console.error(r.stderr)
    else;
    console.log(`Upload done for ${functions[i].name}${functions[i].no_verify_jwt ? ' no_verify_jwt' : ''} ✅`)
  })
}
catch (e) {
  console.error(e) // should contain code (exit code) and signal (that caused the termination).
  exit(1)
}
