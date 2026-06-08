import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  applyCliBump,
  buildEphemeralReexec,
  buildInstallCommand,
  bumpRange,
  classifyUpdateStrategy,
  findCliDeclaration,
  resolveInstalledCliEntry,
} from '../src/build/onboarding/self-update.ts'
import { updatePromptKeyAction } from '../src/build/onboarding/ui/update-prompt.tsx'

function t(name, fn) {
  try {
    fn()
    process.stdout.write(`✓ ${name}\n`)
  }
  catch (e) {
    process.stderr.write(`✗ ${name}\n`)
    throw e
  }
}

function withTempDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'capgo-selfupdate-'))
  try {
    fn(dir)
  }
  finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

function writeJson(path, obj) {
  writeFileSync(path, `${JSON.stringify(obj, null, 2)}\n`)
}

// ─── bumpRange ─────────────────────────────────────────────────────────

t('bumpRange preserves the caret prefix', () => {
  assert.equal(bumpRange('^7.0.0', '7.121.0'), '^7.121.0')
})

t('bumpRange preserves the tilde prefix', () => {
  assert.equal(bumpRange('~7.0.0', '7.121.0'), '~7.121.0')
})

t('bumpRange replaces an exact pin with the exact latest', () => {
  assert.equal(bumpRange('7.0.0', '7.121.0'), '7.121.0')
})

t('bumpRange leaves dist-tags and wildcards untouched', () => {
  assert.equal(bumpRange('latest', '7.121.0'), 'latest')
  assert.equal(bumpRange('next', '7.121.0'), 'next')
  assert.equal(bumpRange('*', '7.121.0'), '*')
})

t('bumpRange leaves workspace protocol untouched', () => {
  assert.equal(bumpRange('workspace:*', '7.121.0'), 'workspace:*')
})

// ─── applyCliBump ──────────────────────────────────────────────────────

t('applyCliBump bumps the declared range and keeps the trailing newline', () => {
  const text = `${JSON.stringify({ devDependencies: { '@capgo/cli': '^7.0.0' } }, null, 2)}\n`
  const out = applyCliBump(text, 'devDependencies', '7.121.0')
  assert.ok(out)
  assert.ok(out.endsWith('\n'))
  assert.equal(JSON.parse(out).devDependencies['@capgo/cli'], '^7.121.0')
})

t('applyCliBump returns null when the section lacks the CLI', () => {
  const text = JSON.stringify({ dependencies: { react: '^18.0.0' } }, null, 2)
  assert.equal(applyCliBump(text, 'dependencies', '7.121.0'), null)
})

t('applyCliBump returns null when nothing changes (tag range)', () => {
  const text = JSON.stringify({ devDependencies: { '@capgo/cli': 'latest' } }, null, 2)
  assert.equal(applyCliBump(text, 'devDependencies', '7.121.0'), null)
})

// ─── buildEphemeralReexec ──────────────────────────────────────────────

t('buildEphemeralReexec uses npx -y for npm (skips the install prompt)', () => {
  assert.deepEqual(
    buildEphemeralReexec('npm', ['build', 'init']),
    { cmd: 'npx', args: ['-y', '@capgo/cli@latest', 'build', 'init'] },
  )
})

t('buildEphemeralReexec uses bunx for bun (no -y flag)', () => {
  assert.deepEqual(
    buildEphemeralReexec('bun', ['build', 'init']),
    { cmd: 'bunx', args: ['@capgo/cli@latest', 'build', 'init'] },
  )
})

t('buildEphemeralReexec uses dlx for pnpm and yarn', () => {
  assert.deepEqual(buildEphemeralReexec('pnpm', ['x']), { cmd: 'pnpm', args: ['dlx', '@capgo/cli@latest', 'x'] })
  assert.deepEqual(buildEphemeralReexec('yarn', ['x']), { cmd: 'yarn', args: ['dlx', '@capgo/cli@latest', 'x'] })
})

t('buildEphemeralReexec keeps the -y flag before the package spec', () => {
  const { args } = buildEphemeralReexec('npm', ['--apikey', 'abc'])
  assert.ok(args.indexOf('-y') < args.indexOf('@capgo/cli@latest'))
})

// ─── buildInstallCommand ───────────────────────────────────────────────

t('buildInstallCommand maps each package manager to its install', () => {
  assert.deepEqual(buildInstallCommand('npm'), { cmd: 'npm', args: ['install'] })
  assert.deepEqual(buildInstallCommand('bun'), { cmd: 'bun', args: ['install'] })
  assert.deepEqual(buildInstallCommand('pnpm'), { cmd: 'pnpm', args: ['install'] })
  assert.deepEqual(buildInstallCommand('yarn'), { cmd: 'yarn', args: ['install'] })
})

// ─── classifyUpdateStrategy ────────────────────────────────────────────

t('classifyUpdateStrategy is project only when declared AND installed', () => {
  const declaration = { packageJsonPath: '/p/package.json', section: 'devDependencies', range: '^7.0.0' }
  const project = classifyUpdateStrategy({ installRoot: '/p', declaration, entry: '/p/node_modules/@capgo/cli/dist/index.js' })
  assert.equal(project.kind, 'project')
})

t('classifyUpdateStrategy falls back to ephemeral when declared but not installed', () => {
  const declaration = { packageJsonPath: '/p/package.json', section: 'devDependencies', range: '^7.0.0' }
  assert.equal(classifyUpdateStrategy({ installRoot: '/p', declaration, entry: null }).kind, 'ephemeral')
})

t('classifyUpdateStrategy is ephemeral with no declaration', () => {
  assert.equal(classifyUpdateStrategy({ installRoot: '/p', declaration: null, entry: null }).kind, 'ephemeral')
})

// ─── findCliDeclaration (monorepo-aware walk) ──────────────────────────

t('findCliDeclaration finds the app sub-package declaration first', () => {
  withTempDir((root) => {
    const app = join(root, 'apps', 'mobile')
    mkdirSync(app, { recursive: true })
    writeJson(join(root, 'package.json'), { workspaces: ['apps/*'], devDependencies: { '@capgo/cli': '^6.0.0' } })
    writeJson(join(app, 'package.json'), { devDependencies: { '@capgo/cli': '^7.0.0' } })

    const found = findCliDeclaration(app, root)
    assert.ok(found)
    assert.equal(found.range, '^7.0.0')
    assert.equal(found.packageJsonPath, join(app, 'package.json'))
    assert.equal(found.section, 'devDependencies')
  })
})

t('findCliDeclaration walks up to the workspace root when the sub-package omits it', () => {
  withTempDir((root) => {
    const app = join(root, 'apps', 'mobile')
    mkdirSync(app, { recursive: true })
    writeJson(join(root, 'package.json'), { workspaces: ['apps/*'], dependencies: { '@capgo/cli': '^7.5.0' } })
    writeJson(join(app, 'package.json'), { dependencies: { react: '^18.0.0' } })

    const found = findCliDeclaration(app, root)
    assert.ok(found)
    assert.equal(found.range, '^7.5.0')
    assert.equal(found.packageJsonPath, join(root, 'package.json'))
    assert.equal(found.section, 'dependencies')
  })
})

t('findCliDeclaration returns null when nothing on the path declares the CLI', () => {
  withTempDir((root) => {
    const app = join(root, 'apps', 'mobile')
    mkdirSync(app, { recursive: true })
    writeJson(join(root, 'package.json'), { dependencies: {} })
    writeJson(join(app, 'package.json'), { dependencies: { react: '^18.0.0' } })

    assert.equal(findCliDeclaration(app, root), null)
  })
})

t('findCliDeclaration does not walk above the given root', () => {
  withTempDir((root) => {
    const inner = join(root, 'inner')
    const app = join(inner, 'app')
    mkdirSync(app, { recursive: true })
    // Declared ABOVE the root boundary — must NOT be found.
    writeJson(join(root, 'package.json'), { dependencies: { '@capgo/cli': '^7.0.0' } })
    writeJson(join(app, 'package.json'), { dependencies: { react: '^18.0.0' } })

    assert.equal(findCliDeclaration(app, inner), null)
  })
})

// ─── resolveInstalledCliEntry (hoisting-aware walk) ────────────────────

t('resolveInstalledCliEntry resolves the bin entry from a hoisted install', () => {
  withTempDir((root) => {
    const app = join(root, 'apps', 'mobile')
    mkdirSync(app, { recursive: true })
    const pkgDir = join(root, 'node_modules', '@capgo', 'cli')
    mkdirSync(join(pkgDir, 'dist'), { recursive: true })
    writeJson(join(pkgDir, 'package.json'), { bin: { capgo: 'dist/index.js' } })
    writeFileSync(join(pkgDir, 'dist', 'index.js'), '// entry')

    assert.equal(resolveInstalledCliEntry(app), join(pkgDir, 'dist', 'index.js'))
  })
})

t('resolveInstalledCliEntry returns null when the CLI is not installed', () => {
  withTempDir((root) => {
    const app = join(root, 'apps', 'mobile')
    mkdirSync(app, { recursive: true })
    assert.equal(resolveInstalledCliEntry(app), null)
  })
})

// ─── updatePromptKeyAction (Ink prompt key mapping) ────────────────────

t('updatePromptKeyAction: Enter confirms', () => {
  assert.deepEqual(updatePromptKeyAction('', { return: true }), { type: 'confirm' })
})

t('updatePromptKeyAction: left / h / 1 select update', () => {
  assert.deepEqual(updatePromptKeyAction('', { leftArrow: true }), { type: 'select', choice: 'update' })
  assert.deepEqual(updatePromptKeyAction('h', {}), { type: 'select', choice: 'update' })
  assert.deepEqual(updatePromptKeyAction('1', {}), { type: 'select', choice: 'update' })
})

t('updatePromptKeyAction: right / l / 2 select skip', () => {
  assert.deepEqual(updatePromptKeyAction('', { rightArrow: true }), { type: 'select', choice: 'skip' })
  assert.deepEqual(updatePromptKeyAction('l', {}), { type: 'select', choice: 'skip' })
  assert.deepEqual(updatePromptKeyAction('2', {}), { type: 'select', choice: 'skip' })
})

t('updatePromptKeyAction: unrelated keys are ignored', () => {
  assert.equal(updatePromptKeyAction('x', {}), null)
})

process.stdout.write('\nAll self-update tests passed.\n')
