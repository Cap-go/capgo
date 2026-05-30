#!/usr/bin/env bun
// Integration guard: the SHELL must actually wrap its content in MinSizeGate.
//
// The component existing isn't enough — a "wire the gate" commit was once lost
// in a stash conflict, leaving the shell rendering the wizard directly so a
// shrunk terminal clipped onboarding instead of showing the resize prompt. This
// test renders the REAL OnboardingShell (picker path — no platform, no network)
// at a sub-floor size and asserts it shows the resize prompt, not the picker;
// and at an ample size shows the picker. Drives the real useTerminalSize via a
// stdout stub whose rows/cols we control (the frame-fit harness hardcodes
// rows=200, so it can't exercise the height gate — hence a local stub here).
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

async function renderShellAt(cols, rows) {
  const stdout = makeStdout(cols, rows)
  const instance = render(
    React.createElement(OnboardingShell, { appId: 'com.test.app', iosDir: 'ios', androidDir: 'android' }),
    { stdout, stderr: makeStdout(cols, rows), stdin: makeStdin(), debug: true, exitOnCtrlC: false, patchConsole: false },
  )
  await new Promise(r => setTimeout(r, 80))
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

// Below the floor (small terminal): the gate must show the resize prompt and
// must NOT show the platform picker.
{
  const out = await renderShellAt(50, 20)
  check('shell below floor shows the resize prompt', /too small/i.test(out))
  check('shell below floor hides the platform picker', !/want to set up/i.test(out))
}

// Ample size: the gate must let the picker through.
{
  const out = await renderShellAt(100, 50)
  check('shell at ample size shows the platform picker', /want to set up|iOS|Android/i.test(out))
  check('shell at ample size hides the resize prompt', !/too small/i.test(out))
}

console.log(`\n${passed} passed, ${failed} failed`)
clearTimeout(watchdog)
process.exit(failed > 0 ? 1 : 0)
