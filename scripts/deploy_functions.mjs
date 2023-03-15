import { existsSync, readdirSync } from 'fs'
import { promisify } from 'util'
import { exec as execCb } from 'child_process'
import { exit } from 'process'
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
  // const all = []
  for (const folder of folders) {
    const fileNoJWT = `./supabase/functions/${folder}/.no_verify_jwt`
    const fileNoDeploy = `./supabase/functions/${folder}/.no_deploy`
    let command = `supabase functions deploy ${folder}`
    let no_verify_jwt = false
    if (existsSync(fileNoJWT)) {
      command += ' --no-verify-jwt'
      no_verify_jwt = true
    }
    if (!existsSync(fileNoDeploy)) {
      console.log(`Upload ${folder}${no_verify_jwt ? ' no_verify_jwt' : ''}`)
      // all.push(exec(command).then((r) => {
      await exec(command).then((r) => {
        if (r.stderr) {
          console.error(folder, r.stderr)
          exit(1)
        }
        console.log(`Done ${folder} ✅`)
        return r
      })
    // }))
    }
    else {
      console.log(`Ignored ${folder} ⏭`)
    }
  }
  // await Promise.all(all)
}
catch (e) {
  console.error(e) // should contain code (exit code) and signal (that caused the termination).
  exit(1)
}
