// Stamp the release version into both npm manifests and copy the signed,
// stapled Capgo.app bundles into their package dirs.
//   Usage: node cli-helper/scripts/prepare-publish.mjs <semver>
// The <semver> MUST match the version baked into each bundle's Info.plist by
// build.sh (we assert it) so the published package version, the npm tarball,
// and the bundle's CFBundleShortVersionString all agree. Fails fast on a
// malformed version or a missing bundle so a bad tag can never publish.
import { chmodSync, cpSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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
  const src = join(root, 'dist', arch, 'Capgo.app')
  const innerExec = join(src, 'Contents', 'MacOS', 'capgo')
  if (!existsSync(innerExec)) {
    console.error(`Missing bundle ${src} — run build.sh + sign-and-notarize.sh first`)
    process.exit(1)
  }
  // Assert the bundle was built at this version (Info.plist is sealed, so this
  // also confirms we're shipping a bundle built for this exact release).
  const plist = readFileSync(join(src, 'Contents', 'Info.plist'), 'utf-8')
  if (!plist.includes(`<string>${version}</string>`)) {
    console.error(`Bundle ${src} Info.plist version != ${version} — rebuild with build.sh ${version}`)
    process.exit(1)
  }

  const pkgDir = join(root, 'npm', `darwin-${arch}`)
  const manifestPath = join(pkgDir, 'package.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'))
  writeFileSync(manifestPath, `${JSON.stringify({ ...manifest, version }, null, 2)}\n`)

  const dest = join(pkgDir, 'Capgo.app')
  rmSync(dest, { recursive: true, force: true })
  cpSync(src, dest, { recursive: true })
  chmodSync(join(dest, 'Contents', 'MacOS', 'capgo'), 0o755)
  console.log(`Prepared ${manifest.name}@${version}`)
}
