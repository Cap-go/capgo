#!/usr/bin/env bun
// Integration guard: when `updateInfo` is set, the SHELL must render the
// self-update prompt as its FIRST screen — before platform selection and even
// before the --platform auto-load — and must NOT render it when up to date.
//
// Renders the REAL OnboardingShell through a controlled stdout stub (same
// pattern as test-shell-size-gate.mjs) so we exercise the actual wiring, not a
// stand-in. No network: the version data is injected via the prop.
import { EventEmitter } from 'node:events'
import process from 'node:process'
import { render } from 'ink'
import React from 'react'
import OnboardingShell from '../src/build/onboarding/ui/shell.tsx'

const watchdog = setTimeout(() => {
  console.error('WATCHDOG 30s')
  process.exit(2)
}, 30000)
watchdog.unref()

function makeStdout(cols, rows) {
  const s = new EventEmitter()
  s.columns = cols
  s.rows = rows
  s.isTTY = true
  s.frames = []
  s.lastFrame = ''
  s.write = (f) => {
    s.frames.push(f)
    s.lastFrame = f
    return true
  }
  return s
}
function makeStdin() {
  const s = new EventEmitter()
  s.isTTY = true
  s.setEncoding = () => {}
  s.setRawMode = () => {}
  s.resume = () => {}
  s.pause = () => {}
  s.ref = () => {}
  s.unref = () => {}
  s.read = () => null
  return s
}

async function renderShell(props) {
  const stdout = makeStdout(100, 50)
  const instance = render(
    React.createElement(OnboardingShell, { appId: 'com.test.app', iosDir: 'ios', androidDir: 'android', journeyId: 'bj_test', ...props }),
    { stdout, stderr: makeStdout(100, 50), stdin: makeStdin(), debug: true, exitOnCtrlC: false, patchConsole: false },
  )
  // Poll for the first painted (non-empty) frame instead of a fixed sleep, so a
  // slow CI box can't read before Ink has rendered. Bounded so a genuine
  // empty-render bug still fails fast rather than hanging.
  const deadline = Date.now() + 2000
  while ((stdout.lastFrame ?? '') === '' && Date.now() < deadline)
    await new Promise(r => setTimeout(r, 10))
  const out = stdout.lastFrame ?? ''
  instance.unmount()
  return out
}

let passed = 0
let failed = 0
function check(name, cond) {
  if (cond) {
    passed++
    console.log(`✔ ${name}`)
  }
  else {
    failed++
    console.error(`✖ ${name}`)
  }
}

const updateInfo = { currentVersion: '8.0.6', latestVersion: '8.0.7' }

// updateInfo set → prompt is the first screen.
{
  const out = await renderShell({ updateInfo })
  const flat = out.replace(/\s+/g, ' ')
  check('shows the update heading', /new version of @capgo\/cli is available/i.test(flat))
  check('shows the current and latest versions', /8\.0\.6/.test(flat) && /8\.0\.7/.test(flat))
  check('offers an update choice', /update/i.test(flat))
  check('offers a skip choice', /skip|continue/i.test(flat))
  check('does NOT show the platform picker yet', !/want to set up/i.test(flat))
}

// updateInfo set AND a pre-resolved platform → STILL shows the prompt first
// (the auto-load is gated until the update is answered). Guards the regression
// where --platform would skip straight past the offer.
{
  const out = await renderShell({ updateInfo, initialPlatform: 'ios' })
  const flat = out.replace(/\s+/g, ' ')
  check('update prompt precedes the --platform auto-load', /new version of @capgo\/cli is available/i.test(flat))
}

// No updateInfo → no prompt, straight to the platform picker.
{
  const out = await renderShell({})
  const flat = out.replace(/\s+/g, ' ')
  check('up to date → no update prompt', !/new version of @capgo\/cli/i.test(flat))
  check('up to date → platform picker shows', /want to set up|iOS|Android/i.test(flat))
}

console.log(`\n${passed} passed, ${failed} failed`)
clearTimeout(watchdog)
process.exit(failed > 0 ? 1 : 0)
