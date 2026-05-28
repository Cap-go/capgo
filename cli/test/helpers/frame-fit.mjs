// Frame-fit test harness for the onboarding wizard's 16-row contract.
//
// Renders an Ink step-body element through a width-controllable stdout stub and
// counts the rendered rows. ink-testing-library can't do this — it hardcodes
// columns=100 — so we drive ink's own `render` with `debug: true` (which writes
// the plain frame, no cursor-move ANSI) and our own stub, exactly how
// ink-testing-library works internally but with a configurable width.
//
// Contract: each STEP BODY must render within BODY_BUDGET_ROWS rows at every
// REFERENCE_WIDTH, which guarantees the full frame (compact header + body +
// padding) fits MAX_FRAME_ROWS. See components.tsx for the constants.
import { EventEmitter } from 'node:events'
import { render as inkRender } from 'ink'
import { BODY_BUDGET_ROWS, MAX_FRAME_ROWS } from '../../src/build/onboarding/ui/components.tsx'

export { BODY_BUDGET_ROWS, MAX_FRAME_ROWS }

// Widths we guarantee the contract at. 80 = standard; 60 = a narrow case so
// text wrapping can't sneak a violation past us. Below ~60 cols the runtime
// resize-prompt is the safety net (we do not guarantee narrower).
export const REFERENCE_WIDTHS = [80, 60]

function makeStdout(columns) {
  const s = new EventEmitter()
  s.columns = columns
  s.rows = 200 // tall, so ink never paginates; we measure the natural height
  s.frames = []
  s.lastFrame = null
  s.write = (frame) => {
    s.frames.push(frame)
    s.lastFrame = frame
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

/**
 * Render an Ink element at a given width and return the plain frame text.
 * @param {import('react').ReactElement} element
 * @param {number} columns
 * @returns {string}
 */
export function renderFrameText(element, columns = 80) {
  const stdout = makeStdout(columns)
  const stderr = makeStdout(columns)
  const stdin = makeStdin()
  const instance = inkRender(element, {
    stdout,
    stderr,
    stdin,
    debug: true,
    exitOnCtrlC: false,
    patchConsole: false,
  })
  const frame = stdout.lastFrame ?? ''
  instance.unmount()
  // ink's debug frame ends with a single trailing newline; drop it so the row
  // count reflects content rows only.
  return frame.replace(/\n$/, '')
}

/**
 * Rendered row count of an element at a given width.
 * @param {import('react').ReactElement} element
 * @param {number} columns
 * @returns {number}
 */
export function frameRows(element, columns = 80) {
  const text = renderFrameText(element, columns)
  return text === '' ? 0 : text.split('\n').length
}

/**
 * Assert a step body fits the budget at every reference width. Throws a
 * detailed error (label, width, rows, budget, rendered frame) on the first
 * violation so the failing test pinpoints the offending frame.
 * @param {import('react').ReactElement} element
 * @param {string} label
 * @param {{ maxRows?: number, widths?: number[] }} [opts]
 * @returns {number} the largest row count observed across widths
 */
export function assertFitsBudget(element, label, opts = {}) {
  const maxRows = opts.maxRows ?? BODY_BUDGET_ROWS
  const widths = opts.widths ?? REFERENCE_WIDTHS
  let worst = 0
  for (const columns of widths) {
    const text = renderFrameText(element, columns)
    const rows = text === '' ? 0 : text.split('\n').length
    worst = Math.max(worst, rows)
    if (rows > maxRows) {
      throw new Error(
        `Frame "${label}" is ${rows} rows at ${columns} cols — exceeds the `
        + `${maxRows}-row body budget (frame would blow the ${MAX_FRAME_ROWS}-row `
        + `contract).\nRendered ${columns}-col frame:\n${text}`,
      )
    }
  }
  return worst
}
