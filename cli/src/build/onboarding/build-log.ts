// src/build/onboarding/build-log.ts
//
// Sanitize a raw build-log chunk (streamed from the remote build runner) into
// clean, single-purpose display lines for the FullscreenBuildOutput viewer.
//
// WHY: the remote runner streams fastlane's output verbatim, which contains
// terminal CONTROL bytes — most importantly BARE carriage returns (`\r`) that
// fastlane uses to redraw a line in place (the "Cruising 🚗" lane banner, lane
// separators, progress counters) plus ANSI colour/erase sequences. We used to
// store each streamed `message` verbatim as ONE line and render it in an Ink
// <Text>. The terminal then honoured the embedded `\r`: a shorter banner
// overwrote the START of the row while the previous (longer) line's TAIL stayed
// behind — producing the fused rows like
//   "Cruising back to lane 'ios submit' 🚗app.dSYM/.../DWARF/ (stored 0%)"
// (verified through @xterm/headless). Embedded control bytes also desync Ink's
// width/clear accounting, so scrolling/resizing left stale characters.
//
// FIX: treat a bare `\r` like a newline (so an in-place redraw becomes its own
// line instead of overwriting another), drop ANSI/escape/other C0 control bytes
// (the viewer re-applies its own ✔/✖/⚠ colouring), and keep tabs + interior
// blank lines. The result is plain text whose display width matches its content,
// so the VT never overwrites and Ink always clears correctly.
//
// NOTE: this lives on the ONBOARDING viewer path only — the plain `capgo build`
// console path keeps fastlane's colours (a real terminal renders them fine), so
// request.ts is deliberately left untouched.

// CSI sequences: ESC [ ... final-byte — SGR colours, cursor moves, erase-line, etc.
// eslint-disable-next-line no-control-regex
const CSI_RE = /\x1B\[[0-9;?]*[ -/]*[@-~]/g
// Other escape sequences: ESC + a single intermediate/final byte (OSC start,
// charset selection, etc.). Stripped defensively so no lone ESC survives.
// eslint-disable-next-line no-control-regex
const ESC_RE = /\x1B[@-Z\\-_]/g
// Remaining C0 control bytes + DEL, EXCLUDING tab (\x09), LF (\x0A) and CR
// (\x0D) — LF/CR are handled by the split above; tabs are expanded to spaces by
// expandTabs() BEFORE this strip, so by the time CTRL_RE runs there are no tabs
// left to preserve.
// eslint-disable-next-line no-control-regex
const CTRL_RE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g

// Tab stop width. Fastlane indents log lines with literal tabs; the viewer
// renders each line in a single <Text wrap="truncate-end">, which truncates by
// CHARACTER count. A terminal renders a tab as 1..8 columns (advance to the next
// multiple of 8), so Ink budgets a tab as 1 column while the terminal draws up
// to 8 — the line overflows the width, and the terminal clips the tail, eating
// the last visible character(s) of every tab-indented line (e.g. "* App" → "* Ap").
// Expanding tabs to spaces up front makes the character count match the rendered
// width, so truncation lands where Ink thinks it does.
const TAB_WIDTH = 8

// Replace each tab with spaces to the next tab stop, per column position. (Not a
// blind 8-space swap: a tab one column into the line advances 7 cols, not 8.)
function expandTabs(line: string): string {
  let out = ''
  let col = 0
  for (const ch of line) {
    if (ch === '\t') {
      const pad = TAB_WIDTH - (col % TAB_WIDTH)
      out += ' '.repeat(pad)
      col += pad
    }
    else {
      out += ch
      col += 1
    }
  }
  return out
}

/**
 * Turn a raw streamed build-log chunk into clean display lines.
 *
 * Splits on `\n` AND bare `\r` (an in-place redraw becomes its own line rather
 * than fusing with another), strips ANSI/escape/control bytes, trims trailing
 * whitespace, and drops the empty element a trailing newline would add (interior
 * blank lines — e.g. the intentional spacer before the first log line — are
 * kept). A chunk may be a single line or several; callers spread the result.
 */
export function sanitizeBuildLogLines(chunk: string): string[] {
  // Normalise every line break (CRLF, lone CR, LF) to LF, then split.
  const parts = chunk.replace(/\r\n?/g, '\n').split('\n')
  // A chunk ending in a newline yields a trailing '' — that's an artifact, not a
  // real blank line; drop only that one. Interior blanks are preserved.
  if (parts.length > 1 && parts[parts.length - 1] === '')
    parts.pop()
  return parts.map((line) => {
    // Strip ANSI/escape first (so tab positions are computed on visible text),
    // then expand tabs to spaces (fixes truncation eating the last char of
    // tab-indented lines), then drop remaining control bytes + trailing ws.
    const noAnsi = line.replace(CSI_RE, '').replace(ESC_RE, '')
    return expandTabs(noAnsi).replace(CTRL_RE, '').replace(/\s+$/, '')
  })
}
