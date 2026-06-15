#!/usr/bin/env bun
// Size-search harness: render every STATIC onboarding step (comfortable form,
// worst-case props) into the real frame, through the real VT engine, and report
// the minimal terminal size at which NONE clip — i.e. the floor we must enforce
// at startup so onboarding never hits "resize" mid-flow. Reported PER PLATFORM
// (iOS vs Android), since the two wizards have different worst-case steps and a
// per-platform floor (see min-terminal-size.ts).
//
// The floor is width-dependent (narrower wraps taller), so we report the
// required ROWS at each candidate WIDTH. Prints a single-line summary per width
// plus an overall verdict, and writes the full per-step table to
// /tmp/onboarding-size-report.txt.
//
// Run:  bun test/find-min-onboarding-size.mjs [width...]   (default 100 90 80 70 60)
import { writeFileSync } from 'node:fs'
import process from 'node:process'
import { staticStepFixtures } from './helpers/onboarding-fixtures.mjs'
import { buildOnboardingFrame } from './helpers/onboarding-frame.mjs'
import { analyzeFrame } from './helpers/vt-grid.mjs'

const watchdog = setTimeout(() => {
  console.error('WATCHDOG: size-search exceeded 60s')
  process.exit(2)
}, 60000)
watchdog.unref()

const widths = process.argv.slice(2).map(Number).filter(n => n > 0)
const WIDTHS = widths.length ? widths : [100, 90, 80, 70, 60]
const fixtures = staticStepFixtures()

const report = []
const perWidthFloor = {}
const errors = []

for (const cols of WIDTHS) {
  const fl = { ios: { floor: 0, tallest: '' }, android: { floor: 0, tallest: '' } }
  for (const { label, el, withProgress, platform } of fixtures) {
    try {
      const frame = buildOnboardingFrame(el, { withProgress })
      const a = await analyzeFrame(frame, { cols, rows: 80 }) // tall budget → natural height
      report.push({ cols, label, platform, rows: a.naturalRows })
      if (a.naturalRows > fl[platform].floor)
        fl[platform] = { floor: a.naturalRows, tallest: label }
    }
    catch (e) {
      errors.push(`${cols}c ${label}: ${(e?.message || e).toString().slice(0, 80)}`)
    }
  }
  perWidthFloor[cols] = fl
  console.log(`width ${cols}: iOS min rows = ${fl.ios.floor} (tallest: ${fl.ios.tallest})  |  Android min rows = ${fl.android.floor} (tallest: ${fl.android.tallest})`)
}

// Full per-step table to file (multi-line output truncates in some shells).
const lines = ['# Onboarding static-step heights (comfortable form, real VT grid)', '']
for (const cols of WIDTHS) {
  const fl = perWidthFloor[cols]
  lines.push(`== ${cols} cols (iOS floor ${fl.ios.floor}, Android floor ${fl.android.floor}) ==`)
  for (const r of report.filter(r => r.cols === cols).sort((a, b) => b.rows - a.rows))
    lines.push(`  ${String(r.rows).padStart(2)}  [${r.platform}] ${r.label}`)
  lines.push('')
}
if (errors.length)
  lines.push('# ERRORS', ...errors.map(e => `  ${e}`))
writeFileSync('/tmp/onboarding-size-report.txt', `${lines.join('\n')}\n`)

console.log(`fixtures=${fixtures.length} errors=${errors.length} report=/tmp/onboarding-size-report.txt`)

// One compact line per width+platform with the top-5 tallest steps inline — so
// the floor breakdown survives shells that truncate multi-line output.
for (const cols of WIDTHS) {
  for (const platform of ['ios', 'android']) {
    const top = report.filter(r => r.cols === cols && r.platform === platform).sort((a, b) => b.rows - a.rows).slice(0, 5)
      .map(r => `${r.label}:${r.rows}`).join(' ')
    console.log(`TOP@${cols}/${platform} ${top}`)
  }
}
clearTimeout(watchdog)
process.exit(errors.length ? 1 : 0)
