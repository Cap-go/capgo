// Real-terminal test harness for the onboarding wizard.
//
// Counting rows in JSX kept being wrong (it missed the progress bar, wrapping,
// the alt-screen clip). This measures what a terminal ACTUALLY shows by feeding
// the rendered output through a real VT emulator engine (@xterm/headless — the
// same engine VS Code's integrated terminal uses).
//
// Two stages, each chosen for robustness:
//
//   1. Ink debug-render at width = cols  →  the natural laid-out frame string.
//      Debug mode is synchronous and side-effect-free (no cursor hiding, no
//      stdin raw mode, no render throttling) — the same mode the existing
//      frame-fit harness uses, so it can't hang the process. Ink's Yoga layout
//      does the real text wrapping at `cols`, so each line is already ≤ cols.
//
//   2. Feed that frame into an xterm-headless Terminal(cols, rows) inside the
//      ALTERNATE screen buffer (the onboarding model: no scrollback, content
//      past `rows` is clipped, top-anchored). Read the visible grid back.
//
// The fit verdict (`clipped`) comes from the natural row count vs `rows`; the
// grid is the real post-clip screen, for content assertions (e.g. "the resize
// hint is still on screen", "the Select is reachable").
//
// No PTY / subprocess — runs anywhere the unit tests run.
import { EventEmitter } from 'node:events'
import xterm from '@xterm/headless'
import { render as inkRender } from 'ink'

const { Terminal } = xterm

// Minimal stdout stub for Ink debug mode: reports a fixed width and collects the
// single plain frame Ink writes. rows is large so Ink never self-paginates — we
// measure natural height and let the VT stage apply the real clip.
function makeDebugStdout(columns) {
  const s = new EventEmitter()
  s.columns = columns
  s.rows = 200
  s.frames = []
  s.lastFrame = ''
  s.write = (frame) => {
    s.frames.push(frame)
    s.lastFrame = frame
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

// term.write() parses asynchronously; the grid is only populated once its
// callback fires. A timeout fallback guarantees the promise always settles so a
// stuck callback can't hang the process.
function writeAndSettle(term, data) {
  return new Promise((resolve) => {
    let done = false
    const finish = () => {
      if (done)
        return
      done = true
      resolve()
    }
    term.write(data, finish)
    setTimeout(finish, 1000)
  })
}

/**
 * Ink debug-render → the natural laid-out frame string at the given width.
 * Trailing newline trimmed. Each line is ≤ `cols` (Ink wrapped it).
 * @param {import('react').ReactElement} element
 * @param {number} cols
 * @returns {string}
 */
export function renderInkFrame(element, cols = 80) {
  const stdout = makeDebugStdout(cols)
  const stderr = makeDebugStdout(cols)
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
  return frame.replace(/\n$/, '')
}

/**
 * Feed a frame string into a real VT grid of `cols`×`rows` and return the
 * visible rows (trailing whitespace trimmed). `alt` enters the alternate screen
 * (onboarding model: top-anchored, no scrollback, clip past `rows`).
 * @returns {Promise<string[]>}
 */
export async function frameToGrid(frame, { cols, rows, alt = true }) {
  const term = new Terminal({ cols, rows, allowProposedApi: true, scrollback: 0 })
  if (alt)
    await writeAndSettle(term, '[?1049h[H')
  // VT needs CRLF between rows; Ink debug frames use bare LF.
  await writeAndSettle(term, frame.replace(/\n/g, '\r\n'))
  const buf = term.buffer.active
  const grid = []
  for (let y = 0; y < term.rows; y++) {
    const line = buf.getLine(buf.viewportY + y)
    grid.push(line ? line.translateToString(true).replace(/\s+$/, '') : '')
  }
  return grid
}

/**
 * Render an element and classify whether it fits a `cols`×`rows` terminal.
 *
 * @returns {Promise<{
 *   frame: string,          // natural laid-out frame (unclipped)
 *   naturalRows: number,    // rows the content needs
 *   naturalCols: number,    // widest line (≤ cols, since Ink wrapped)
 *   grid: string[],         // real post-clip visible grid (length === rows)
 *   usedRows: number,       // non-empty rows in the visible grid
 *   clipped: boolean,       // content overflowed the viewport (didn't fit)
 *   cols: number,
 *   rows: number,
 * }>}
 */
export async function analyzeFrame(element, { cols, rows, alt = true }) {
  const frame = renderInkFrame(element, cols)
  const lines = frame === '' ? [] : frame.split('\n')
  const naturalRows = lines.length
  const naturalCols = lines.reduce((m, l) => Math.max(m, stripAnsiLen(l)), 0)
  const grid = await frameToGrid(frame, { cols, rows, alt })
  const usedRows = grid.filter(l => l.length > 0).length
  return {
    frame,
    naturalRows,
    naturalCols,
    grid,
    usedRows,
    clipped: naturalRows > rows,
    cols,
    rows,
  }
}

// Visible length of a line, ignoring SGR/CSI escape sequences.
function stripAnsiLen(line) {
  // eslint-disable-next-line no-control-regex
  return line.replace(/\[[0-9;]*[A-Za-z]/g, '').length
}
