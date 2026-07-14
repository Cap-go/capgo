import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolveInitTargetPath, resolveResumedInitTargets } from '../src/init/command.ts'

const root = mkdtempSync(join(tmpdir(), 'capgo-init-monorepo-'))
try {
  const appDir = join(root, 'projects', 'qr-code-reader', 'src')
  const configDir = join(root, 'env-configs')
  const directoryTarget = join(root, 'directory-target')
  const savedPackageJson = join(root, 'package.json')
  const savedMainFile = join(appDir, 'main.ts')
  const savedConfigFile = join(configDir, 'capacitor.config.qr-code-reader.ts')
  const explicitProjectDir = join(root, 'projects', 'stripe-phone-app')
  const explicitPackageJson = join(explicitProjectDir, 'package.json')
  const explicitMainFile = join(explicitProjectDir, 'src', 'main.ts')
  const explicitConfigFile = join(configDir, 'capacitor.config.stripe-phone-app.ts')
  mkdirSync(appDir, { recursive: true })
  mkdirSync(configDir, { recursive: true })
  mkdirSync(directoryTarget)
  mkdirSync(join(explicitProjectDir, 'src'), { recursive: true })
  writeFileSync(savedPackageJson, '{}')
  writeFileSync(savedMainFile, 'export {}')
  writeFileSync(savedConfigFile, 'export default {}')
  writeFileSync(explicitPackageJson, '{}')
  writeFileSync(explicitMainFile, 'export {}')
  writeFileSync(explicitConfigFile, 'export default {}')
  const canonicalSavedConfigFile = realpathSync(savedConfigFile)
  const canonicalExplicitConfigFile = realpathSync(explicitConfigFile)

  assert.equal(resolveInitTargetPath('./package.json', 'Package JSON path', root), savedPackageJson)
  assert.equal(resolveInitTargetPath('./projects/qr-code-reader/src/main.ts', 'Main file path', root), savedMainFile)
  assert.equal(resolveInitTargetPath('./env-configs/capacitor.config.qr-code-reader.ts', 'Capacitor config path', root), savedConfigFile)
  assert.throws(() => resolveInitTargetPath('./missing.ts', 'Main file path', root), /Main file path does not exist/)
  assert.throws(() => resolveInitTargetPath('./directory-target', 'Main file path', root), /Main file path does not exist/)

  const savedTargets = {
    pathToPackageJson: savedPackageJson,
    capacitorConfigPath: canonicalSavedConfigFile,
    configLoadDir: root,
    mainFilePath: savedMainFile,
  }
  assert.deepEqual(resolveResumedInitTargets({}, savedTargets, root), savedTargets)

  const currentConfigTarget = {
    capacitorConfigPath: canonicalExplicitConfigFile,
    configLoadDir: root,
  }
  assert.deepEqual(resolveResumedInitTargets(currentConfigTarget, savedTargets, root), {
    pathToPackageJson: savedPackageJson,
    capacitorConfigPath: canonicalExplicitConfigFile,
    configLoadDir: root,
    mainFilePath: savedMainFile,
  })

  const explicitTargets = {
    pathToPackageJson: explicitPackageJson,
    capacitorConfigPath: canonicalExplicitConfigFile,
    configLoadDir: root,
    mainFilePath: explicitMainFile,
  }
  assert.deepEqual(resolveResumedInitTargets(explicitTargets, savedTargets, root), explicitTargets)
  assert.deepEqual(resolveResumedInitTargets({}, {}, root), {})
  assert.equal(
    resolveResumedInitTargets({}, { ...savedTargets, configLoadDir: join(root, 'missing') }, root).configLoadDir,
    root,
  )
  console.log('✅ init monorepo target tests passed')
}
finally {
  rmSync(root, { recursive: true, force: true })
}
