// cli/test/test-support-internal-log.mjs
import assert from 'node:assert/strict'
import { readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { appendInternalLog, getInternalLogPath, safeHeaders, startInternalLog } from '../src/support/internal-log.ts'
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

t('safeHeaders logs useful response headers but never sensitive ones', () => {
  const headers = new Headers({
    'date': 'Mon, 08 Jun 2026 10:37:08 GMT',
    'x-request-id': 'req-abc123',
    'x-ratelimit-remaining': '42',
    'content-type': 'application/json',
    // sensitive — must NOT appear:
    'set-cookie': 'session=topsecret',
    'authorization': 'Bearer SHOULD_NEVER_LOG',
    'www-authenticate': 'Bearer error="invalid_token"',
  })
  const out = safeHeaders(headers)
  assert.ok(out.includes('date=Mon, 08 Jun 2026 10:37:08 GMT')) // clock-skew signal
  assert.ok(out.includes('x-request-id=req-abc123')) // escalation handle
  assert.ok(out.includes('x-ratelimit-remaining=42'))
  assert.ok(out.includes('www-authenticate=Bearer error="invalid_token"')) // auth-failure detail (not a secret)
  assert.ok(!out.includes('topsecret')) // set-cookie excluded
  assert.ok(!out.includes('SHOULD_NEVER_LOG')) // request auth header never logged
})
