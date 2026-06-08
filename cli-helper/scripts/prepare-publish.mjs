// Stamp the release version into both npm manifests and copy the signed
// binaries into their package dirs.
//   Usage: node cli-helper/scripts/prepare-publish.mjs <semver>
// Fails fast on a malformed version or missing binary so a bad tag can
// never publish.
import { chmodSync, copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const version = process.argv[2]
if (!version || !/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(version)) {
  console.error(`Usage: node prepare-publish.mjs <semver> — got "${version ?? ''}"`)
  process.exit(1)
}

for (const arch of ['arm64', 'x64']) {
  const src = join(root, 'dist', `helper-${arch}`)
  if (!existsSync(src)) {
    console.error(`Missing binary ${src} — run build.sh + sign-and-notarize.sh first`)
    process.exit(1)
  }
  const pkgDir = join(root, 'npm', `darwin-${arch}`)
  const manifestPath = join(pkgDir, 'package.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'))
  const updated = { ...manifest, version }
  writeFileSync(manifestPath, `${JSON.stringify(updated, null, 2)}\n`)
  const dest = join(pkgDir, 'helper')
  copyFileSync(src, dest)
  chmodSync(dest, 0o755)
  console.log(`Prepared ${manifest.name}@${version}`)
}
