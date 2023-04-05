import { existsSync, readdirSync } from 'node:fs'
import { promisify } from 'node:util'
import { exec as execCb } from 'node:child_process'
import { exit } from 'node:process'
import { outputFile } from 'fs-extra'
import { supa_url } from './utils.mjs'

const exec = promisify(execCb)
const folders = readdirSync('./supabase/functions')
  .filter(file => !file.startsWith('_'))
  .filter(file => !file.startsWith('.DS_Store'))

const projectRef = supa_url.split('.')[0].replace('https://', '')

try {
  console.log('projectRef', projectRef)
  await outputFile('./supabase/.temp/project-ref', projectRef)
  // for in folders
  const all = []
  await exec('supabase --version').then((r) => {
    r.stdout && console.log('Supabase CLI', r.stdout)
  })
  for (const folder of folders) {
    // const fileNoJWT = `./supabase/functions/${folder}/.no_verify_jwt`
    const fileNoDeploy = `./supabase/functions/${folder}/.no_deploy`
    const command = `supabase functions deploy ${folder}`
    const no_verify_jwt = false
    // if (existsSync(fileNoJWT)) {
    //   command += ' --no-verify-jwt'
    //   no_verify_jwt = true
    // }
    if (!existsSync(fileNoDeploy)) {
      console.log(`Upload ${folder}${no_verify_jwt ? ' no_verify_jwt' : ''}`)
      all.push(exec(command).then((r) => {
      // await exec(command).then((r) => {
        if (r.stderr && r.stderr !== 'Version 1.30.3 is already installed\n') {
          console.error(folder, r.stderr)
          exit(1)
        }
        console.log(`Done ${folder} ✅`)
        return r
      // })
      }))
    }
    else {
      console.log(`Ignored ${folder} ⏭`)
    }
  }
  await Promise.all(all)
}
catch (e) {
  console.error('error', e) // should contain code (exit code) and signal (that caused the termination).
  exit(1)
}
