// cli/test/test-support-mailto.mjs
import assert from 'node:assert/strict'
import { buildMailtoUrl, MAILTO_BODY_MAX } from '../src/support/mailto.ts'
import { t } from './support-harness.mjs'

t('builds a mailto url with encoded subject and body', () => {
  const url = buildMailtoUrl({ to: 'support@capgo.app', subject: 'A & B', body: 'line1\nline2' })
  assert.ok(url.startsWith('mailto:support@capgo.app?'))
  assert.ok(url.includes('subject=A%20%26%20B'))
  assert.ok(url.includes('body=line1%0Aline2'))
})

t('caps the body length and appends a truncation marker', () => {
  const long = 'x'.repeat(MAILTO_BODY_MAX + 500)
  const url = buildMailtoUrl({ to: 'support@capgo.app', subject: 's', body: long })
  const body = decodeURIComponent(url.split('body=')[1])
  assert.ok(body.length <= MAILTO_BODY_MAX)
  assert.ok(body.endsWith('…(truncated)'))
})
