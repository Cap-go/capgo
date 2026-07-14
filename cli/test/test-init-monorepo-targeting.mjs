import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolveInitTargetPath } from '../src/init/command.ts'

const root = mkdtempSync(join(tmpdir(), 'capgo-init-monorepo-'))
try {
  const appDir = join(root, 'projects', 'qr-code-reader', 'src')
  const configDir = join(root, 'env-configs')
  mkdirSync(appDir, { recursive: true })
  mkdirSync(configDir, { recursive: true })
  const directoryTarget = join(root, 'directory-target')
  mkdirSync(directoryTarget)
  const packageJson = join(root, 'package.json')
  const mainFile = join(appDir, 'main.ts')
  const configFile = join(configDir, 'capacitor.config.qr-code-reader.ts')
  writeFileSync(packageJson, '{}')
  writeFileSync(mainFile, 'export {}')
  writeFileSync(configFile, 'export default {}')

  assert.equal(resolveInitTargetPath('./package.json', 'Package JSON path', root), packageJson)
  assert.equal(resolveInitTargetPath('./projects/qr-code-reader/src/main.ts', 'Main file path', root), mainFile)
  assert.equal(resolveInitTargetPath('./env-configs/capacitor.config.qr-code-reader.ts', 'Capacitor config path', root), configFile)
  assert.throws(() => resolveInitTargetPath('./missing.ts', 'Main file path', root), /Main file path does not exist/)
  assert.throws(() => resolveInitTargetPath('./directory-target', 'Main file path', root), /Main file path does not exist/)
  console.log('✅ init monorepo target tests passed')
}
finally {
  rmSync(root, { recursive: true, force: true })
}
