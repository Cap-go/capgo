#!/usr/bin/env node

import assert from 'node:assert/strict'
import { execSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  applyInitAutoTestChange,
  getGitRepoStatus,
  getInitUpdaterPluginConfig,
  revertInitAutoTestChangeContent,
} from '../src/init/command.ts'

let failures = 0

function withTempDir(fn) {
  const root = mkdtempSync(join(tmpdir(), 'capgo-init-guardrails-'))
  try {
    fn(root)
  }
  finally {
    rmSync(root, { recursive: true, force: true })
  }
}

function t(name, fn) {
  try {
    fn()
    console.log(`✓ ${name}`)
  }
  catch (error) {
    failures += 1
    console.error(`❌ ${name}`)
    console.error(error)
  }
}

t('git status helper skips non-git folders', () => {
  withTempDir((root) => {
    const status = getGitRepoStatus(root)
    assert.equal(status.inRepo, false)
    assert.equal(status.clean, true)
    assert.deepEqual(status.entries, [])
  })
})

t('git status helper detects clean and dirty repos', () => {
  withTempDir((root) => {
    execSync('git init', { cwd: root, stdio: 'ignore' })

    const cleanStatus = getGitRepoStatus(root)
    assert.equal(cleanStatus.inRepo, true)
    assert.equal(cleanStatus.clean, true)
    assert.deepEqual(cleanStatus.entries, [])

    writeFileSync(join(root, 'dirty.txt'), 'dirty\n', 'utf8')

    const dirtyStatus = getGitRepoStatus(root)
    assert.equal(dirtyStatus.inRepo, true)
    assert.equal(dirtyStatus.clean, false)
    assert.ok(dirtyStatus.entries.some(entry => entry.includes('dirty.txt')))
  })
})

t('init updater config always starts from native version 0.0.0', () => {
  assert.deepEqual(getInitUpdaterPluginConfig('com.example.app', false), {
    version: '0.0.0',
    appId: 'com.example.app',
    autoUpdate: true,
  })

  assert.deepEqual(getInitUpdaterPluginConfig('com.example.app', true), {
    version: '0.0.0',
    appId: 'com.example.app',
    autoUpdate: true,
    directUpdate: 'always',
    autoSplashscreen: true,
  })
})

t('auto html onboarding changes can be applied and reverted', () => {
  const original = '<body>\n  <main>Hello</main>\n</body>\n'
  const applied = applyInitAutoTestChange('index.html', original)
  assert.ok(applied)
  assert.equal(applied.kind, 'html-banner')
  assert.ok(applied.content.includes('capgo-test-banner'))
  assert.equal(revertInitAutoTestChangeContent(applied.kind, applied.content), original)
})

t('auto vue onboarding changes can be applied and reverted', () => {
  const original = '<template>\n  <AppShell />\n</template>\n'
  const applied = applyInitAutoTestChange('src/App.vue', original)
  assert.ok(applied)
  assert.equal(applied.kind, 'vue-banner')
  assert.ok(applied.content.includes('capgo-test-vue'))
  assert.equal(revertInitAutoTestChangeContent(applied.kind, applied.content), original)
})

t('auto css onboarding changes can be applied and reverted', () => {
  const original = 'body { color: red; }\n'
  const applied = applyInitAutoTestChange('src/main.css', original)
  assert.ok(applied)
  assert.equal(applied.kind, 'css-background')
  assert.ok(applied.content.includes('capgo-test-background'))
  assert.equal(revertInitAutoTestChangeContent(applied.kind, applied.content), original)
})

if (failures > 0) {
  console.error(`\n❌ ${failures} init guardrail test(s) failed`)
  process.exit(1)
}

console.log('\n✅ init guardrail tests passed')
