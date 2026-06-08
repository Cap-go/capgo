#!/usr/bin/env bun
// Guards the build-log sanitizer that fixes the fused/garbled rows in the
// onboarding build viewer. The remote runner streams fastlane output verbatim,
// including BARE carriage returns (in-place "Cruising 🚗" redraws) + ANSI. Stored
// raw and rendered in Ink, the embedded \r made a short banner overwrite the
// start of a row while the previous longer line's TAIL stayed — fused rows.
//
// This test pins the sanitizer's behaviour AND reproduces the fusion through a
// real VT (@xterm/headless): the RAW line fuses (bug exists), the SANITIZED
// lines never put two log lines on one row (bug fixed). If someone reverts the
// sanitizer or stores raw lines again, the VT assertion fails.
import process from 'node:process'
import xterm from '@xterm/headless'
import { sanitizeBuildLogLines } from '../src/build/onboarding/build-log.ts'

const { Terminal } = xterm
const ESC = '\x1B'

const watchdog = setTimeout(() => {
  console.error('WATCHDOG: build-log-sanitize test exceeded 30s')
  process.exit(2)
}, 30000)
watchdog.unref()

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

// Render lines into a real VT grid (CRLF between rows, like the onboarding frame
// harness) and return the visible rows.
function grid(lines, cols = 80, rows = 8) {
  return new Promise((resolve) => {
    const term = new Terminal({ cols, rows, allowProposedApi: true, scrollback: 0 })
    let done = false
    const finish = () => {
      if (done)
        return
      done = true
      const buf = term.buffer.active
      const out = []
      for (let y = 0; y < rows; y++) {
        const l = buf.getLine(y)
        out.push(l ? l.translateToString(true).replace(/\s+$/, '') : '')
      }
      resolve(out)
    }
    term.write(lines.join('\r\n'), finish)
    setTimeout(finish, 1000)
  })
}

const ZIP = '  adding: Foo.dSYM/Contents/Resources/DWARF/Foo (stored 0%)'
const FUSED_RAW = `${ZIP}\rCruising 🚗` // one stored line: zip then in-place banner

// 1. bare CR splits into separate lines (the fusion source), both preserved
{
  const out = sanitizeBuildLogLines(FUSED_RAW)
  check('bare CR splits into two lines', out.length === 2)
  check('zip line preserved verbatim', out[0] === ZIP)
  check('banner line preserved verbatim', out[1] === 'Cruising 🚗')
}

// 2. ANSI / CSI stripped (viewer re-applies its own colouring)
check('ANSI SGR stripped', sanitizeBuildLogLines(`${ESC}[36mcolored${ESC}[0m`).join('|') === 'colored')
check('CSI erase-line stripped', sanitizeBuildLogLines(`text${ESC}[K`)[0] === 'text')

// 3. C0 control bytes stripped; tabs EXPANDED to spaces (not kept) so the viewer's
//    char-count truncation matches the terminal's rendered width — otherwise a tab
//    (1 char, ~8 cols) overflows and the terminal eats the line's last char(s).
check('BEL stripped', sanitizeBuildLogLines('a\x07bc')[0] === 'abc')
check('leading tab → 8 spaces to the tab stop', sanitizeBuildLogLines('\t* App')[0] === '        * App')
check('no literal tab survives', !sanitizeBuildLogLines('a\tb\tc')[0].includes('\t'))
check('mid-line tab advances to next stop (not blind 8)', sanitizeBuildLogLines('ab\tc')[0] === 'ab      c') // col 2 → pad 6 → col 8

// 4. line-break normalisation + blank handling
check('CRLF splits', JSON.stringify(sanitizeBuildLogLines('a\r\nb')) === JSON.stringify(['a', 'b']))
check('trailing-newline artifact dropped', JSON.stringify(sanitizeBuildLogLines('x\n')) === JSON.stringify(['x']))
check('interior blank line kept', JSON.stringify(sanitizeBuildLogLines('a\n\nb')) === JSON.stringify(['a', '', 'b']))

// 5. VT reproduction: RAW fuses, SANITIZED does not
{
  const rawGrid = await grid([FUSED_RAW])
  check('RAW line fuses in the VT (proves the bug)', rawGrid[0].includes('Cruising') && rawGrid[0].includes('stored 0%'))

  const cleanGrid = await grid(sanitizeBuildLogLines(FUSED_RAW))
  const anyFused = cleanGrid.some(r => r.includes('Cruising') && r.includes('adding:'))
  check('SANITIZED lines never fuse two log lines on one row', !anyFused)
  check('no escape bytes survive in the rendered grid', !cleanGrid.join('').includes(ESC))
}

console.log(`\n${passed} passed, ${failed} failed`)
clearTimeout(watchdog)
process.exit(failed > 0 ? 1 : 0)
