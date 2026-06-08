// cli/test/test-support-internal-log.mjs
import assert from 'node:assert/strict'
import { readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { appendInternalLog, getInternalLogPath, startInternalLog } from '../src/support/internal-log.ts'
import { t } from './support-harness.mjs'

// Runs before any startInternalLog call so the null-before-start contract is
// actually exercised (module state is per-process).
t('getInternalLogPath returns null before start', () => {
  assert.equal(getInternalLogPath(), null)
})

t('writes redacted lines to the log file', () => {
  const dir = join(tmpdir(), `capgo-ilog-${Date.now()}`)
  const path = startInternalLog('com.example.app', dir)
  assert.ok(path)
  appendInternalLog('normal line')
  appendInternalLog('Authorization: Bearer SECRETTOKEN123')
  const content = readFileSync(path, 'utf8')
  assert.ok(content.includes('normal line'))
  assert.ok(!content.includes('SECRETTOKEN123'))
  assert.ok(content.includes('[REDACTED]'))
  rmSync(dir, { recursive: true, force: true })
})
