import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterAll, beforeAll, test } from 'bun:test'

const dir = mkdtempSync(join(tmpdir(), 'capgo-background-shutdown-'))
let harness
let runnerCount = 0

beforeAll(async () => {
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ type: 'module' }))
  writeFileSync(join(dir, 'entry.ts'), `
    export { startOnboardingCheck } from ${JSON.stringify(fileURLToPath(new URL('../src/onboarding/background.ts', import.meta.url)))}
    export { waitForOnboardingChecks } from ${JSON.stringify(fileURLToPath(new URL('../src/onboarding/background-shutdown.ts', import.meta.url)))}
    export { getPendingOnboardingChecks } from ${JSON.stringify(fileURLToPath(new URL('../src/onboarding/background-workers.ts', import.meta.url)))}
    export { markTrialNoticeShown } from ${JSON.stringify(fileURLToPath(new URL('../src/onboarding/trial-notice-state.ts', import.meta.url)))}
  `)
  // The production build stubs this optional Ink development dependency.
  const build = await Bun.build({ entrypoints: [join(dir, 'entry.ts')], outdir: dir, target: 'node', format: 'esm', external: ['react-devtools-core'] })
  assert.equal(build.success, true)
  harness = pathToFileURL(join(dir, 'entry.js')).href
  writeFileSync(join(dir, 'busy.mjs'), 'setInterval(() => {}, 10_000)')
  writeFileSync(join(dir, 'quick.mjs'), 'setTimeout(() => {}, 300)')
  writeFileSync(join(dir, 'slow.mjs'), 'setTimeout(() => {}, 900)')
  writeFileSync(join(dir, 'released.mjs'), "import { parentPort } from 'node:worker_threads'; parentPort.once('message', () => process.exit(0))")
  writeFileSync(join(dir, 'notice.mjs'), `import { parentPort } from 'node:worker_threads'; parentPort.postMessage({ type: 'setup-notice', notice: { kind: 'setup', appId: 'com.example.ready', product: 'OTA live updates', title: 'Create a channel', action: 'Continue your checklist', secondary: [] } })`)
  for (const app of ['one', 'two']) {
    writeFileSync(join(dir, `plan-${app}.mjs`), `import { parentPort } from 'node:worker_threads'; parentPort.postMessage({ type: 'setup-notice', notice: { kind: 'plan', appId: 'com.example.${app}', completed: ['OTA'], secondary: [], billing: { orgId: 'fixture-org', trialEndsAt: null, plansUrl: 'https://console.example.com/plans' } } })`)
  }
})

afterAll(() => rmSync(dir, { recursive: true, force: true }))

function run({ commandPath = 'app list', options = {}, tty = true, stdinTty = tty, stdoutTty = tty, ci = false, workers = ['busy.mjs'], foregroundMs = 0, previousInterrupt = false, telemetry = 'ok', disabled = false, controlledClock = false, waitForWorkers = false, trialAlreadyShown = false } = {}) {
  const source = `
    import assert from 'node:assert/strict'
    import { performance } from 'node:perf_hooks'
    import FakeTimers from ${JSON.stringify(import.meta.resolve('@sinonjs/fake-timers'))}
    import { setImmediate as nextTurn } from 'node:timers/promises'
    import { startOnboardingCheck, waitForOnboardingChecks, getPendingOnboardingChecks, markTrialNoticeShown } from ${JSON.stringify(harness)}
    Object.defineProperty(process.stdin, 'isTTY', { value: ${stdinTty} })
    Object.defineProperty(process.stdout, 'isTTY', { value: ${stdoutTty} })
    globalThis.fetch = async (url, init) => {
      if (!String(url).endsWith('/private/events'))
        return new Response('', { status: 500 })
      console.log('telemetry:' + init.body)
      if (${JSON.stringify(telemetry)} === 'reject')
        throw new Error('offline')
      if (${JSON.stringify(telemetry)} === 'hang') {
        return new Promise((resolve, reject) => {
          const abort = () => { console.log('telemetry-aborted'); reject(new Error('aborted')) }
          if (init.signal.aborted) abort()
          else init.signal.addEventListener('abort', abort, { once: true })
        })
      }
      return new Response('{}', { headers: { 'Content-Type': 'application/json' } })
    }
    const command = { optsWithGlobals: () => (${JSON.stringify({ apikey: 'fake-api-key', appId: 'com.example.ready', ...options })}), registeredArguments: [], args: [] }
    for (const filename of ${JSON.stringify(workers)})
      startOnboardingCheck(command, ${JSON.stringify(commandPath)}, new URL(filename, ${JSON.stringify(pathToFileURL(join(dir, 'run.mjs')).href)}))
    if (${waitForWorkers}) {
      const checks = [...getPendingOnboardingChecks()]
      for (const [worker] of checks) worker.ref()
      await Promise.all(checks.map(([, check]) => check.completion))
    }
    console.log('pending-attempts:' + JSON.stringify([...getPendingOnboardingChecks().values()].map(check => check.attemptId)))
    let foregroundInterrupts = 0
    if (${previousInterrupt}) {
      process.on('SIGINT', () => { foregroundInterrupts++; console.log('foreground-interrupted') })
      process.emit('SIGINT')
    }
    await new Promise(resolve => setTimeout(resolve, ${foregroundMs}))
    if (${trialAlreadyShown}) markTrialNoticeShown('fixture-org')
    console.log('interrupt-count-before-wait:' + foregroundInterrupts)
    const clock = ${controlledClock} ? FakeTimers.install({ now: Date.now(), toFake: ['setTimeout', 'clearTimeout', 'Date'] }) : undefined
    const now = ${controlledClock} ? Date.now : () => performance.now()
    const started = now()
    let finished = false
    const completion = waitForOnboardingChecks(command, ${JSON.stringify(commandPath)}).then(() => { finished = true })
    if (${controlledClock}) {
      // Keep real workers and telemetry, but advance the shared deadline without
      // measuring how quickly a busy CI runner schedules this child process.
      if (${JSON.stringify(telemetry)} === 'hang') {
        // Mock timers cannot keep the process alive. Release real workers only
        // after shutdown starts, then prove telemetry alone waits for the deadline.
        const checks = [...getPendingOnboardingChecks()]
        for (const [worker] of checks) {
          worker.ref()
          worker.postMessage('finish')
        }
        await Promise.all(checks.map(([, check]) => check.completion))
      }
      await nextTurn()
      clock.tick(4_999)
      await nextTurn()
      assert.equal(finished, false, 'shutdown completed before the shared deadline')
      clock.tick(1)
      await nextTurn()
      clock.tick(0)
      await completion
      assert.equal(finished, true, 'shutdown did not complete at the shared deadline')
    }
    else {
      await completion
    }
    console.log('foreground-finished:' + Math.round(now() - started))
    if (${controlledClock}) clock.uninstall()
  `
  const runner = join(dir, `run-${++runnerCount}.mjs`)
  writeFileSync(runner, source)
  const child = spawn('node', [runner], { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, CI: ci ? 'true' : 'false', CAPGO_DISABLE_TELEMETRY: disabled ? 'true' : '', CAPGO_DISABLE_POSTHOG: '' } })
  let output = ''
  let errors = ''
  let waiting
  const waitingMessage = new Promise(resolve => { waiting = resolve })
  for (const [stream, stderr] of [[child.stdout, false], [child.stderr, true]]) {
    stream.on('data', chunk => {
      if (stderr) errors += chunk
      else output += chunk
      if ((output + errors).includes('Waiting for background checks')) waiting()
    })
  }
  const timeout = setTimeout(() => child.kill('SIGKILL'), 10_000)
  const completion = once(child, 'exit').then(([code, signal]) => {
    clearTimeout(timeout)
    return { code, signal, output, errors, text: output + errors }
  })
  return { child, completion, waitingMessage }
}

function waitedMs(result) {
  assert.equal(result.code, 0, result.text)
  assert.equal(result.signal, null)
  return Number(result.output.match(/foreground-finished:(\d+)/)?.[1])
}

test.concurrent('ready notices render for human-readable output even when no worker or TTY wait remains', async () => {
  for (const tty of [true, false]) {
    const result = await run({ commandPath: 'bundle list', workers: ['notice.mjs', 'notice.mjs'], waitForWorkers: true, tty }).completion
    assert.equal(result.code, 0, result.text)
    assert.equal(result.text.match(/Continue OTA live updates setup/g)?.length, 1, 'deduplicate the app notice')
    assert.ok(!result.text.includes('Waiting for background checks'))
  }
})

test.concurrent('machine modes and explicit setup flows discard ready notices', async () => {
  const cases = [{ options: { json: true } }, { options: { outputText: true } }, { options: { quiet: true } }, { options: { silent: true } }, { options: { format: 'json' } }, { ci: true }, { commandPath: 'app todo' }, { commandPath: 'build init' }, { commandPath: 'mcp' }]
  for (const settings of cases) {
    const result = await run({ commandPath: 'bundle list', workers: ['notice.mjs'], waitForWorkers: true, ...settings }).completion
    assert.equal(result.code, 0, result.text)
    assert.ok(!result.text.includes('Continue OTA live updates setup'))
  }
}, 12000)

test.concurrent('plan prompts are deduplicated by organization, including foreground trial warnings', async () => {
  for (const trialAlreadyShown of [false, true]) {
    const result = await run({ commandPath: 'bundle list', workers: ['plan-one.mjs', 'plan-two.mjs'], waitForWorkers: true, trialAlreadyShown }).completion
    assert.equal(result.code, 0, result.text)
    assert.equal((result.text.match(/Choose a Capgo plan/g) ?? []).length, trialAlreadyShown ? 0 : 1)
  }
})

function waitEvents(result) {
  return result.output.split('\n').filter(line => line.startsWith('telemetry:')).map(line => JSON.parse(line.slice('telemetry:'.length)))
}

test.concurrent('both workers share one five-second shutdown budget', async () => {
  const { completion } = run({ workers: ['busy.mjs', 'busy.mjs'], controlledClock: true })
  const result = await completion
  const duration = waitedMs(result)
  assert.equal(duration, 5_000, 'workers must share one five-second deadline')
  assert.equal(result.text.match(/Waiting for background checks/g)?.length, 1)
  const events = waitEvents(result)
  assert.equal(events.length, 1)
  const event = events[0]
  assert.equal(event.event, 'background_checks_wait_started')
  assert.equal(event.channel, 'cli-usage')
  assert.equal(event.tracking_version, 2)
  assert.ok(Number.isFinite(Date.parse(event.timestamp)))
  assert.equal(event.nonPersonTags.command_path, 'app list')
  assert.equal(event.nonPersonTags.pending_checks, 2)
  assert.equal(event.nonPersonTags.grace_period_ms, 5_000)
  const attempts = JSON.parse(result.output.match(/pending-attempts:(.+)/)[1])
  assert.deepEqual(event.nonPersonTags.scan_attempt_ids, attempts)
  assert.equal(new Set(attempts).size, 2)
  for (const id of attempts) assert.match(id, /^[0-9a-f-]{36}$/)
  assert.equal(JSON.stringify(event).includes('fake-api-key'), false)
  assert.equal(JSON.stringify(event).includes(dir), false)
}, 12_000)

test.concurrent('channel promote gives its eligible setup notice the same bounded grace period', async () => {
  const result = await run({ commandPath: 'channel promote', controlledClock: true }).completion
  assert.equal(waitedMs(result), 5_000)
  assert.ok(result.text.includes('Waiting for background checks'))
}, 12_000)

test.concurrent('exits early as soon as the last worker finishes', async () => {
  const result = await run({ workers: ['quick.mjs', 'slow.mjs'] }).completion
  const duration = waitedMs(result)
  assert.ok(duration >= 800 && duration < 2_000, `early completion was ${duration}ms`)
  assert.ok(result.text.includes('Waiting for background checks'))
})

test.concurrent('completed or absent checks produce no waiting message or delay', async () => {
  for (const settings of [{ workers: [] }, { workers: ['quick.mjs'], foregroundMs: 1_000 }]) {
    const result = await run(settings).completion
    assert.ok(waitedMs(result) < 100)
    assert.ok(!result.text.includes('Waiting for background checks'))
    assert.deepEqual(waitEvents(result), [])
  }
})

test.concurrent('SIGINT during the grace period exits immediately even after a previous interrupt', async () => {
  const { child, completion, waitingMessage } = run({ previousInterrupt: true })
  await Promise.race([waitingMessage, completion.then(() => { throw new Error('exited before entering the grace period') })])
  child.kill('SIGINT')
  const result = await completion
  assert.equal(result.code, 130)
  assert.equal(result.signal, null)
  const previousInterrupts = Number(result.output.match(/interrupt-count-before-wait:(\d+)/)[1])
  assert.ok(previousInterrupts >= 1)
  assert.equal(result.output.match(/foreground-interrupted/g)?.length, previousInterrupts, result.text)
  assert.ok(!result.text.includes('foreground-finished'))
})

test.concurrent('machine output, init, MCP, CI and non-interactive commands do not wait or print', async () => {
  const cases = [
    { options: { json: true } }, { options: { outputText: true } }, { options: { quiet: true } }, { options: { silent: true } }, { options: { format: 'json' } },
    { commandPath: 'channel currentBundle', options: { quiet: true } },
    { commandPath: 'bundle zip', options: { json: true } },
    { commandPath: 'init' }, { commandPath: 'build init' }, { commandPath: 'build onboarding' },
    { commandPath: 'mcp' }, { commandPath: 'account id' }, { commandPath: 'bundle releaseType' },
    { commandPath: 'build credentials export' }, { commandPath: 'generate-docs' },
    { commandPath: 'unknown-command' }, { ci: true }, { stdinTty: false }, { stdoutTty: false },
  ]
  const results = await Promise.all(cases.map(settings => run(settings).completion))
  for (const result of results) {
    assert.ok(waitedMs(result) < 100)
    assert.ok(!result.text.includes('Waiting for background checks'))
    assert.deepEqual(waitEvents(result), [])
  }
}, 12_000)

test.concurrent('telemetry opt-out and delivery errors preserve the wait and early exit', async () => {
  for (const settings of [{ disabled: true }, { telemetry: 'reject' }]) {
    const result = await run({ workers: ['quick.mjs'], ...settings }).completion
    assert.ok(waitedMs(result) < 2_000)
    assert.ok(result.text.includes('Waiting for background checks'))
    assert.equal(waitEvents(result).length, settings.disabled ? 0 : 1)
  }
})

test.concurrent('hanging telemetry is aborted within the same five-second budget', async () => {
  const result = await run({ workers: ['released.mjs'], telemetry: 'hang', controlledClock: true }).completion
  const duration = waitedMs(result)
  assert.equal(duration, 5_000, 'telemetry must share the worker deadline')
  assert.equal(waitEvents(result).length, 1)
  assert.ok(result.output.includes('telemetry-aborted'))
}, 12_000)
