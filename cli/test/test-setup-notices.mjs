import assert from 'node:assert/strict'
import { test } from 'bun:test'
import { BUILDER_STEP_IDS } from '../src/app/builder-checklist.ts'
import { getAppTodoSteps } from '../src/app/todo.ts'
import { formatSetupNotice, getSetupNotice, reconcileSetupProgress } from '../src/onboarding/setup-notices.ts'
import { shouldEvaluateSetupNotice, shouldRefreshSetupProgress } from '../src/onboarding/setup-notice-policy.ts'

const appId = 'com.example.setup'
const now = Date.parse('2026-01-01T12:00:00Z')
const orgId = '00000000-0000-4000-8000-000000000001'
const billing = { status: 'available', orgId, trialEndsAt: new Date(now + 36 * 3600000).toISOString(), isPaying: false, hasCredits: false }
const otaIds = getAppTodoSteps({ onboarding: { setup: { todo_list_version: 3 } } }).steps.map(step => step.id)
function fixture(paths = ['ota', 'builder']) {
  const setup = { todo_list_version: 4, paths, selected_path: paths[0], steps: {} }
  if (paths.includes('ota')) {
    setup.ota_todo_list_version = '1'
    setup.steps.ota = Object.fromEntries(otaIds.map(id => [id, { status: id === 'login_cli_mcp' ? 'done' : 'pending' }]))
  }
  if (paths.includes('builder')) {
    setup.builder_todo_list_version = '1'
    setup.steps.builder = Object.fromEntries(Object.entries(BUILDER_STEP_IDS).map(([platform, ids]) => [platform, Object.fromEntries(ids.map(id => [id, { status: 'pending' }]))]))
  }
  return { onboarding: { setup }, billing: { ...billing }, checkErrors: [] }
}
function finish(progress, product, platform = 'ios') {
  const steps = product === 'ota' ? progress.onboarding.setup.steps.ota : progress.onboarding.setup.steps.builder[platform]
  for (const step of Object.values(steps)) step.status = 'done'
  return progress
}
const message = progress => formatSetupNotice(getSetupNotice(appId, progress, 'https://console.example.com'), now)

test('only app-specific human-readable commands start the optional progress request', () => {
  for (const command of ['bundle list', 'bundle upload', 'channel list', 'doctor', 'build request'])
    assert.equal(shouldEvaluateSetupNotice(command, {}, false), true)
  for (const command of ['app list', 'organization list', 'app todo', 'build init', 'mcp', 'init'])
    assert.equal(shouldEvaluateSetupNotice(command, {}, false), false)
  for (const options of [{ json: true }, { outputText: true }, { quiet: true }, { silent: true }, { format: 'json' }])
    assert.equal(shouldEvaluateSetupNotice('bundle list', options, false), false)
  assert.equal(shouldEvaluateSetupNotice('bundle list', {}, true), false)
})
test('only commands that can change setup need a post-success refresh', () => {
  for (const command of ['bundle upload', 'channel add', 'app add', 'build request'])
    assert.equal(shouldRefreshSetupProgress(command), true)
  for (const command of ['bundle list', 'bundle zip', 'channel list', 'doctor', 'app todo'])
    assert.equal(shouldRefreshSetupProgress(command), false)
})

test('an unfinished OTA-only list focuses on its next task without Builder or billing copy', () => {
  const text = message(fixture(['ota']))
  assert.match(text, /Continue.*OTA/i)
  assert.match(text, /Create a channel/)
  assert.match(text, /app todo com.example.setup --list ota/)
  assert.doesNotMatch(text, /Builder|plan|trial|subscrib/i)
})
test('an unfinished Builder-only list offers the right platform and no OTA or billing copy', () => {
  const progress = fixture(['builder'])
  progress.onboarding.setup.selected_builder_platform = 'android'
  progress.onboarding.setup.steps.builder.android.start_setup.status = 'done'
  const text = message(progress)
  assert.match(text, /Continue.*Builder/i)
  assert.match(text, /Prepare your signing keystore/)
  assert.match(text, /build init --platform android/)
  assert.doesNotMatch(text, /OTA|plan|trial|subscrib/i)
})
test('dual assignment focuses on the started OTA list with a brief Builder mention', () => {
  const text = message(fixture())
  assert.match(text.split('\n')[0], /Continue.*OTA/)
  assert.match(text, /Also explore.*Builder/)
  assert.doesNotMatch(text, /trial|subscrib/i)
})
test('one started Builder list wins over an unstarted OTA list', () => {
  const progress = fixture()
  progress.onboarding.setup.steps.ota.login_cli_mcp.status = 'pending'
  progress.onboarding.setup.steps.builder.android.start_setup.status = 'done'
  const text = message(progress)
  assert.match(text.split('\n')[0], /Continue.*Builder/)
  assert.match(text, /--platform android/)
  assert.match(text, /Also explore.*OTA/)
})
test('both started lists use the selected path without equal product pitches', () => {
  const progress = fixture()
  progress.onboarding.setup.selected_path = 'builder'
  progress.onboarding.setup.steps.builder.ios.start_setup.status = 'done'
  const text = message(progress)
  assert.match(text.split('\n')[0], /Continue.*Builder/)
  assert.match(text, /Also continue.*OTA/)
})
test('the unreachable dual-unstarted state does not invent a two-product pitch', () => {
  const progress = fixture()
  progress.onboarding.setup.steps.ota.login_cli_mcp.status = 'pending'
  assert.equal(message(progress), undefined)
})
for (const platform of ['ios', 'android']) {
  test(`one finished Builder platform (${platform}) prioritizes plans over unfinished OTA and the other platform`, () => {
    const text = message(finish(fixture(), 'builder', platform))
    assert.match(text.split('\n')[0], /Builder.*complete/)
    assert.match(text, /1 day, 12 hours/)
    assert.match(text, /Choose a Capgo plan/)
    assert.ok(text.indexOf('Choose a Capgo plan') < text.indexOf('Also'))
    assert.match(text, new RegExp(`Also.*${platform === 'ios' ? 'Android' : 'iOS'}.*OTA`))
    assert.match(text, new RegExp(`plans\\?oid=${orgId}`))
    assert.doesNotMatch(text, /Continue.*OTA/)
  })
}
test('Builder-only completion suggests the other platform briefly without mentioning an absent OTA list', () => {
  const text = message(finish(fixture(['builder']), 'builder'))
  assert.match(text, /Choose a Capgo plan/)
  assert.match(text, /Also.*Android/)
  assert.doesNotMatch(text, /OTA/)
})
test('OTA completion prioritizes trial and plans with brief unfinished Builder guidance', () => {
  const text = message(finish(fixture(), 'ota'))
  assert.match(text.split('\n')[0], /OTA.*complete/)
  assert.match(text, /Choose a Capgo plan/)
  assert.match(text, /Also.*Builder/)
  assert.ok(text.indexOf('Choose a Capgo plan') < text.indexOf('Also'))
})
test('all completed lists have no unfinished setup prompt', () => {
  const progress = finish(finish(finish(fixture(), 'ota'), 'builder', 'ios'), 'builder', 'android')
  const text = message(progress)
  assert.match(text, /Choose a Capgo plan/)
  assert.doesNotMatch(text, /Also|Continue|Explore/i)
})
test('warning and skipped cloud-build steps are not successful Builder completion', () => {
  for (const status of ['warning', 'skipped', 'pending']) {
    const progress = finish(fixture(['builder']), 'builder')
    progress.onboarding.setup.steps.builder.ios.successful_cloud_build.status = status
    assert.match(message(progress), /Continue.*Builder/)
    assert.doesNotMatch(message(progress), /Choose a Capgo plan/)
  }
})
test('skipped optional signing steps still allow a successfully finished platform', () => {
  const progress = finish(fixture(['builder']), 'builder')
  progress.onboarding.setup.steps.builder.ios.prepare_certificate.status = 'skipped'
  assert.match(message(progress), /Choose a Capgo plan/)
})
test('paid, credit-funded, unavailable, malformed and absent billing do not trigger purchase copy', () => {
  for (const value of [undefined, { status: 'unavailable' }, { ...billing, isPaying: true }, { ...billing, hasCredits: true }, { ...billing, isPaying: null }, { ...billing, orgId: '' }, { ...billing, trialEndsAt: 'invalid' }]) {
    const progress = finish(fixture(), 'ota')
    progress.billing = value
    assert.equal(message(progress), undefined)
  }
})
test('expired and absent trials still offer a plan after setup completes', () => {
  for (const trialEndsAt of [null, '2025-12-01T00:00:00Z']) {
    const progress = finish(fixture(['ota']), 'ota')
    progress.billing.trialEndsAt = trialEndsAt
    const text = message(progress)
    assert.match(text, /Choose a Capgo plan/)
    assert.doesNotMatch(text, /ends in|negative|NaN/)
  }
})
test('expiry is calculated when displayed, including a trial ending during the command', () => {
  const notice = getSetupNotice(appId, finish(fixture(['ota']), 'ota'), 'https://console.example.com')
  assert.match(formatSetupNotice(notice, now + 35 * 3600000), /1 hour/)
  assert.match(formatSetupNotice(notice, now + 37 * 3600000), /trial has ended/)
})
test('legacy, unsupported and explicitly skipped onboarding stays quiet', () => {
  for (const patch of [{ todo_list_version: 3 }, { todo_list_version: 5 }, { outcome: 'skipped' }, { ota_todo_list_version: '2' }]) {
    const progress = fixture(['ota'])
    Object.assign(progress.onboarding.setup, patch)
    assert.equal(message(progress), undefined)
  }
})
test('failed OTA checks do not certify OTA completion, while a finished Builder platform remains independent', () => {
  const progress = finish(fixture(), 'ota')
  progress.checkErrors = ['run_device']
  assert.doesNotMatch(message(progress) ?? '', /OTA.*complete/)
  finish(progress, 'builder')
  assert.match(message(progress), /Builder.*complete/)
})
test('successful local reports reconcile a stale snapshot without changing unrelated steps, billing or the input', () => {
  const progress = fixture()
  const before = JSON.stringify(progress)
  const reconciled = reconcileSetupProgress(progress, ['add_updater', 'add_code'])
  assert.equal(reconciled.onboarding.setup.steps.ota.add_code.status, 'done')
  assert.equal(reconciled.onboarding.setup.steps.ota.add_updater.status, 'done')
  assert.equal(reconciled.onboarding.setup.steps.ota.run_device.status, 'pending')
  assert.deepEqual(reconciled.billing, billing)
  assert.equal(JSON.stringify(progress), before)
  assert.equal(reconcileSetupProgress(fixture(['builder']), ['add_code']).onboarding.setup.steps.ota, undefined)
})
