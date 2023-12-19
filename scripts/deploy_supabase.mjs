import { existsSync, lstatSync, readdirSync, rmdirSync, unlinkSync } from 'node:fs'
import { promisify } from 'node:util'
import { join } from 'node:path'
import { exec as execCb } from 'node:child_process'
import { exit } from 'node:process'
import { outputFile } from 'fs-extra'
import { supa_url } from './utils.mjs'

const exec = promisify(execCb)
const folders = readdirSync('./supabase/functions')
  .filter(file => !file.startsWith('_'))
  .filter(file => !file.startsWith('.DS_Store'))

const projectRef = supa_url.split('.')[0].replace('https://', '')

function deleteFolderRecursive(directoryPath) {
  if (existsSync(directoryPath)) {
    readdirSync(directoryPath).forEach((file) => {
      const curPath = join(directoryPath, file)
      if (lstatSync(curPath).isDirectory()) { // recurse
        deleteFolderRecursive(curPath)
      }
      else { // delete file
        unlinkSync(curPath)
      }
    })
    rmdirSync(directoryPath)
  }
};

try {
  console.log('projectRef', projectRef)
  await outputFile('./supabase/.temp/project-ref', projectRef)
  await exec('supabase --version').then((r) => {
    r.stdout && console.log('Supabase CLI', r.stdout)
  })
  for (const folder of folders) {
    const folderPath = `./supabase/functions/${folder}`
    const fileNoDeploy = `${folderPath}/.no_deploy`

    if (existsSync(fileNoDeploy)) {
      console.log(`Ignored ${folder} ⏭`)
      // delete folder as path folderPath
      deleteFolderRecursive(folderPath)
    }
  }
  // await Promise.all(all)
}
catch (e) {
  console.error('error', e) // should contain code (exit code) and signal (that caused the termination).
  exit(1)
}
