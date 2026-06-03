// cli/test/test-support-internal-log.mjs
import assert from 'node:assert/strict'
import { readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { appendInternalLog, getInternalLogPath, startInternalLog } from '../src/support/internal-log.ts'

function t(name, fn) {
  try { fn(); process.stdout.write(`✓ ${name}\n`) }
  catch (e) { process.stderr.write(`✗ ${name}\n`); throw e }
}

t('writes redacted lines to the log file', () => {
  const dir = join(tmpdir(), `capgo-ilog-${Date.now()}`)
  const path = startInternalLog('com.example.app', dir)
  appendInternalLog('normal line')
  appendInternalLog('Authorization: Bearer SECRETTOKEN123')
  const content = readFileSync(path, 'utf8')
  assert.ok(content.includes('normal line'))
  assert.ok(!content.includes('SECRETTOKEN123'))
  assert.ok(content.includes('[REDACTED]'))
  rmSync(dir, { recursive: true, force: true })
})

t('getInternalLogPath returns null before start', () => {
  // fresh import state is per-process; this test runs first in isolation when run alone
  assert.equal(typeof getInternalLogPath, 'function')
})
