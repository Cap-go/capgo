import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const sdkPath = resolve('dist/src/sdk.js')

if (!existsSync(sdkPath)) {
  console.error('dist/src/sdk.js not found. Run "bun run build" first.')
  process.exit(1)
}

try {
  const sdk = await import(pathToFileURL(sdkPath))
  if (typeof sdk.CapgoSDK !== 'function') {
    console.error('CapgoSDK export missing or invalid')
    process.exit(1)
  }
  console.log('ESM SDK import OK')
} catch (err) {
  console.error('ESM SDK import failed')
  console.error(err)
  process.exit(1)
}
