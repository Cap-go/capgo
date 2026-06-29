import assert from 'node:assert/strict'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { findMainFile, findMainFileForProjectType, findProjectType } from '../src/utils.ts'

async function test(name, fn) {
  try {
    await fn()
    process.stdout.write(`✓ ${name}\n`)
  }
  catch (error) {
    process.stderr.write(`✗ ${name}\n`)
    throw error
  }
}

function writeJson(file, value) {
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`)
}

function makeProjectDir(name) {
  const dir = join(tmpdir(), `capgo-cli-${name}-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  mkdirSync(dir, { recursive: true })
  return dir
}

const originalCwd = process.cwd()

await test('root Vue package wins over nested React package', async () => {
  const dir = makeProjectDir('root-vue-nested-react')
  try {
    writeJson(join(dir, 'package.json'), {
      name: 'vue-app',
      dependencies: {
        vue: '3.5.0',
      },
    })
    writeJson(join(dir, 'tsconfig.json'), {})

    const nestedCliDir = join(dir, 'cli')
    mkdirSync(nestedCliDir, { recursive: true })
    writeJson(join(nestedCliDir, 'package.json'), {
      name: 'nested-cli',
      dependencies: {
        react: '19.0.0',
      },
    })

    process.chdir(dir)
    assert.equal(await findProjectType({ quiet: true }), 'vue-ts')
  }
  finally {
    process.chdir(originalCwd)
    rmSync(dir, { recursive: true, force: true })
  }
})

await test('selected package.json is used before the current monorepo root', async () => {
  const dir = makeProjectDir('selected-package')
  try {
    writeJson(join(dir, 'package.json'), {
      name: 'workspace-root',
      dependencies: {
        react: '19.0.0',
      },
    })

    const appDir = join(dir, 'apps', 'mobile')
    mkdirSync(appDir, { recursive: true })
    writeJson(join(appDir, 'package.json'), {
      name: 'mobile-app',
      dependencies: {
        vue: '3.5.0',
      },
    })
    writeJson(join(appDir, 'tsconfig.json'), {})

    const selectedPackageJson = join(appDir, 'package.json')
    assert(existsSync(selectedPackageJson))

    process.chdir(dir)
    assert.equal(await findProjectType({ quiet: true, packageJsonPath: selectedPackageJson }), 'vue-ts')
  }
  finally {
    process.chdir(originalCwd)
    rmSync(dir, { recursive: true, force: true })
  }
})

await test('rollup config does not override React dependencies', async () => {
  const dir = makeProjectDir('rollup-react')
  try {
    writeJson(join(dir, 'package.json'), {
      name: 'rollup-react-app',
      dependencies: {
        react: '19.0.0',
      },
    })
    writeJson(join(dir, 'tsconfig.json'), {})
    writeFileSync(join(dir, 'rollup.config.js'), 'export default {}\n')

    process.chdir(dir)
    assert.equal(await findProjectType({ quiet: true }), 'react-ts')
  }
  finally {
    process.chdir(originalCwd)
    rmSync(dir, { recursive: true, force: true })
  }
})

await test('main file lookup uses the selected package directory', async () => {
  const dir = makeProjectDir('selected-main-file')
  try {
    const appDir = join(dir, 'apps', 'mobile')
    const srcDir = join(appDir, 'src')
    mkdirSync(srcDir, { recursive: true })
    writeFileSync(join(srcDir, 'main.tsx'), 'import React from \'react\'\n')

    process.chdir(dir)
    assert.equal(findMainFileForProjectType('react-ts', true, appDir), 'src/main.tsx')
    assert.equal(await findMainFile(true, appDir), join(srcDir, 'main.tsx'))
  }
  finally {
    process.chdir(originalCwd)
    rmSync(dir, { recursive: true, force: true })
  }
})

process.stdout.write('OK\n')
