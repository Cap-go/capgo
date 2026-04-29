import { existsSync } from 'node:fs'
import AdmZip from 'adm-zip'

const zipPath = existsSync('build.zip') ? 'build.zip' : '../build.zip'
const zip = new AdmZip(zipPath)
const zipEntries = zip.getEntries()

let errorFound = false

for (const zipEntry of zipEntries) {
  const entryName = zipEntry.entryName
  if (entryName.includes('\\')) {
    console.error(`Non-POSIX path detected: ${entryName}`)
    errorFound = true
  }
}

if (errorFound) {
  console.error('Non-POSIX paths detected in the zip file')
  process.exit(1)
} else {
  console.log('All paths are POSIX compliant.')
}
