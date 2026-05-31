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
// padding) fits MAX_FRAME_ROWS. The header/padding row costs live in
// components.tsx; the frame budget is a test-only contract, so it's derived
// here from those costs rather than exported from production.
import { EventEmitter } from 'node:events'
import { render as inkRender } from 'ink'
import { COMPACT_HEADER_ROWS, WIZARD_PADDING_ROWS } from '../../src/build/onboarding/ui/components.tsx'

// The 16-row frame floor and the body's share of it (frame minus the one-line
// compact header + the wizard's outer padding = 13). Kept in the test harness
// because only the per-component frame-fit tests consume them.
export const MAX_FRAME_ROWS = 16
export const BODY_BUDGET_ROWS = MAX_FRAME_ROWS - COMPACT_HEADER_ROWS - WIZARD_PADDING_ROWS // 13

// Widths we guarantee the contract at. 80 = standard; 60 = a narrow case so
// text wrapping can't sneak a violation past us. Below ~60 cols the runtime
// resize-prompt is the safety net (we do not guarantee narrower).
export const REFERENCE_WIDTHS = [80, 60]

function makeStdout(columns, rows = 200) {
  const s = new EventEmitter()
  s.columns = columns
  // Default very tall so ink never paginates and we measure natural height.
  // Pass a real height to test viewport components that fill the terminal.
  s.rows = rows
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
 * Pass `rows` for components that fill the terminal via minHeight/viewport math
 * (e.g. the fullscreen viewers); leave it default for natural-height step body
 * measurement.
 * @param {import('react').ReactElement} element
 * @param {number} columns
 * @param {number} [rows]
 * @returns {string}
 */
export function renderFrameText(element, columns = 80, rows = 200) {
  const stdout = makeStdout(columns, rows)
  const stderr = makeStdout(columns, rows)
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
 * Rendered row count of an element at a given width (and optional height).
 * @param {import('react').ReactElement} element
 * @param {number} columns
 * @param {number} [rows]
 * @returns {number}
 */
export function frameRows(element, columns = 80, rows = 200) {
  const text = renderFrameText(element, columns, rows)
  return text === '' ? 0 : text.split('\n').length
}

// Settle pending microtasks + macrotask turns so React/Ink commit any scheduled
// re-render (incl. passive useEffect effects) and flush its frame to the stub
// before we inspect frames. React's passive effects flush on a later turn than
// the commit, so we pump several turns + a timer.
async function flush() {
  for (let i = 0; i < 5; i++)
    await new Promise(resolve => setImmediate(resolve))
  await new Promise(resolve => setTimeout(resolve, 20))
}

/**
 * Render an element, then simulate a terminal resize and return the full frame
 * sequence split at the resize boundary. A "resize" is exactly what a real TTY
 * does: mutate stdout.columns/rows, then emit 'resize' — ink (and any
 * useStdout-based hook) listen for that event. `debug: true` makes ink write
 * every render synchronously to the stub, so `frames` holds the whole sequence
 * (no render throttling), which is what lets us see a transient stale frame.
 *
 * @param {import('react').ReactElement} element
 * @param {{ from: { cols: number, rows: number }, to: { cols: number, rows: number } }} opts
 * @returns {Promise<{ before: string[], after: string[] }>} frames emitted
 *   before vs. after the resize event
 */
export async function renderResizeFrames(element, { from, to }) {
  const stdout = makeStdout(from.cols)
  stdout.rows = from.rows
  const stderr = makeStdout(from.cols)
  const stdin = makeStdin()
  const instance = inkRender(element, {
    stdout,
    stderr,
    stdin,
    debug: true,
    exitOnCtrlC: false,
    patchConsole: false,
  })
  await flush()
  const splitAt = stdout.frames.length
  // Simulate the resize: new dimensions are live BEFORE the event fires (Node
  // updates stdout.columns/rows, then emits), mirroring a real terminal.
  stdout.columns = to.cols
  stdout.rows = to.rows
  stdout.emit('resize')
  await flush()
  const before = stdout.frames.slice(0, splitAt)
  const after = stdout.frames.slice(splitAt)
  instance.unmount()
  return { before, after }
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
