// cli/test/test-support-help-menu.mjs
import assert from 'node:assert/strict'
import { buildHelpMenuOptions } from '../src/support/help-menu.ts'
import { t } from './support-harness.mjs'

t('support is always first', () => {
  const opts = buildHelpMenuOptions({ hasBuildLog: false })
  assert.equal(opts[0].value, 'support')
})

t('AI only offered when a build log exists', () => {
  assert.ok(!buildHelpMenuOptions({ hasBuildLog: false }).some(o => o.value === 'ai'))
  assert.ok(buildHelpMenuOptions({ hasBuildLog: true }).some(o => o.value === 'ai'))
})

t('always includes retry and exit', () => {
  const values = buildHelpMenuOptions({ hasBuildLog: true }).map(o => o.value)
  assert.ok(values.includes('retry'))
  assert.ok(values.includes('exit'))
})
