import type { FC } from 'react'
import { Box, Text, useInput, useStdout } from 'ink'
import Spinner from 'ink-spinner'
// src/build/onboarding/ui/components.tsx
import React, { useEffect, useState } from 'react'
import { computeMaxScrollOffset, pickVisibleLines } from '../ai-fit.js'

export const Divider: FC<{ width?: number }> = ({ width = 60 }) => (
  <Text dimColor>{'─'.repeat(width)}</Text>
)

// Rendered row cost of each Header variant + the wizard's outer padding.
// The wizards use these against a live `measureElement` of the step body to
// decide — with no hardcoded height threshold — whether (a) the bordered box
// fits, (b) only the one-line header fits, or (c) not even the one-line
// header + content fits, in which case the resize prompt is shown.
//   box = double border (2) + paddingY (2) + text (1)
export const BOX_HEADER_ROWS = 5
export const COMPACT_HEADER_ROWS = 1
// The outer wizard <Box> uses padding={1} → one row top + one row bottom.
export const WIZARD_PADDING_ROWS = 2

// Frame-fit contract. Every rendered frame must fit within MAX_FRAME_ROWS
// terminal rows so the wizard never surprises the user with a "terminal too
// small" block after a step that fit. A frame = adaptive header + body +
// padding; with the one-line compact header the body's row budget is the
// constant below. Each step BODY component is unit-tested (see
// test/helpers/frame-fit.mjs) to render within BODY_BUDGET_ROWS at the
// reference widths, so a too-tall step can never silently regress.
export const MAX_FRAME_ROWS = 16
export const BODY_BUDGET_ROWS = MAX_FRAME_ROWS - COMPACT_HEADER_ROWS - WIZARD_PADDING_ROWS // 13

// Shown in place of the step content when even the one-line header + the
// step's content won't fit the current viewport. Kept to TWO rows with no
// padding: in the alt buffer the TOP of overflowing content is what gets
// clipped, so the fewer rows this occupies the more likely the user sees the
// actionable instruction even on a very short terminal. `neededRows` is the
// measured target height (body + one-line header + padding) so the message
// can tell the user concretely how tall to make the window.
export const TerminalTooSmall: FC<{ rows: number, neededRows: number }> = ({ rows, neededRows }) => (
  <Box flexDirection="column">
    <Text color="yellow" bold>{`⚠  Terminal too small (${rows} row${rows === 1 ? '' : 's'})`}</Text>
    <Text>{`Resize taller — at least ${neededRows} rows — to continue onboarding.`}</Text>
  </Box>
)

export const SpinnerLine: FC<{ text: string }> = ({ text }) => (
  <Box>
    <Box marginRight={1}>
      <Text color="cyan">
        <Spinner type="dots" />
      </Text>
    </Box>
    <Text>{text}</Text>
  </Box>
)

export const SuccessLine: FC<{ text: string, detail?: string }> = ({ text, detail }) => (
  <Box>
    <Text color="green">✔ </Text>
    <Text>{text}</Text>
    {detail && (
      <Text dimColor>
        {' '}
        ·
        {detail}
      </Text>
    )}
  </Box>
)

export const ErrorLine: FC<{ text: string }> = ({ text }) => (
  <Box>
    <Text color="red">✖ </Text>
    <Text color="red">{text}</Text>
  </Box>
)

// Non-success outcomes of a Capgo AI analysis request. `error` is a genuine
// failure (network/backend); `already_analyzed` and `too_big` are blocking
// "can't proceed" states the backend reports deliberately.
export type AiResultKind = 'already_analyzed' | 'too_big' | 'error'

// Renders a non-success AI-analysis outcome as a prominent, coloured banner so
// the user reads it as a distinct blocking state instead of mistaking it for
// part of the neutral analysis text (these used to render as a plain <Text>
// line and blended in — users couldn't tell the request had been rejected).
// `error` is red (✖); `already_analyzed` / `too_big` are yellow (⚠) since
// they're expected, non-crash outcomes.
//
// Adaptive: the comfortable form (default) is a bordered box — the original,
// most-prominent design. The `dense` form drops the box (saving ~2 rows) for
// terminals too short to fit the boxed version within the 16-row contract; the
// parent sets `dense` only when the measured comfortable frame won't fit.
export const AiResultBanner: FC<{ kind: AiResultKind, message: string, dense?: boolean }> = ({ kind, message, dense = false }) => {
  const isError = kind === 'error'
  const color = isError ? 'red' : 'yellow'
  const icon = isError ? '✖' : '⚠'
  const label = kind === 'error'
    ? 'Analysis failed'
    : kind === 'too_big'
      ? 'Build log too large'
      : 'Already analyzed'
  const inner = (
    <>
      <Text color={color} bold>{`${icon}  ${label}`}</Text>
      <Text color={color}>{message}</Text>
    </>
  )
  if (dense) {
    return <Box flexDirection="column">{inner}</Box>
  }
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={color} paddingX={1}>
      {inner}
    </Box>
  )
}

/**
 * Custom TextInput that filters out specific characters (e.g. '=').
 * @inkjs/ui's TextInput is uncontrolled and can't filter keystrokes,
 * so we build a minimal one with Ink's useInput.
 */
export const FilteredTextInput: FC<{
  placeholder?: string
  filter?: string
  mask?: boolean
  onSubmit: (value: string) => void
}> = ({ placeholder = '', filter = '=', mask = false, onSubmit }) => {
  const [value, setValue] = useState('')

  useInput((input, key) => {
    if (key.return) {
      onSubmit(value)
      return
    }
    if (key.backspace || key.delete) {
      setValue(prev => prev.slice(0, -1))
      return
    }
    // Ignore control characters, arrows, etc.
    if (key.ctrl || key.meta || key.escape || key.upArrow || key.downArrow || key.leftArrow || key.rightArrow || key.tab) {
      return
    }
    // Append input then strip all forbidden characters (handles paste)
    if (input) {
      const filterRegex = new RegExp(`[${filter.replace(/[-\\^$*+?.()|[\]{}]/g, '\\$&')}]`, 'g')
      setValue(prev => (prev + input).replace(filterRegex, ''))
    }
  })

  const display = mask ? '•'.repeat(value.length) : value
  return (
    <Box>
      <Text color="cyan">❯ </Text>
      {value
        ? <Text>{display}</Text>
        : <Text dimColor>{placeholder}</Text>}
      <Text color="white">█</Text>
    </Box>
  )
}

// `compact` collapses the banner to a single borderless line. Callers pass
// it when the terminal is too short (< HEADER_BOX_MIN_ROWS) to spend ~5 rows
// on the bordered box — the branding stays, the vertical cost drops to 1 row.
export const Header: FC<{ compact?: boolean }> = ({ compact = false }) => {
  if (compact) {
    return (
      <Text bold color="cyan">
        🚀  Capgo Cloud Build · Onboarding
      </Text>
    )
  }
  return (
    <Box
      borderStyle="double"
      borderColor="cyan"
      paddingX={4}
      paddingY={1}
      alignSelf="center"
    >
      <Text bold color="cyan">
        🚀  Capgo Cloud Build · Onboarding
      </Text>
    </Box>
  )
}

/**
 * Scrollable, fullscreen viewer for the AI build-analysis markdown when it
 * is taller than the user's terminal viewport. Mirrors the shape of the
 * workflow-file diff viewer on main, but for pre-rendered ANSI lines (no
 * `add`/`del` colouring — the markdown renderer already styled them).
 *
 * Keybindings:
 *   ↑/k        scroll one line up
 *   ↓/j        scroll one line down
 *   PgUp/u     jump up one viewport
 *   PgDn/d/␣   jump down one viewport
 *   Home/g     jump to top
 *   End/G      jump to bottom
 *   Esc/Enter  dismiss the viewer (returns control to the parent step)
 */
export const FullscreenAiViewer: FC<{
  title: string
  subtitle?: string
  lines: string[]
  terminalRows: number
  onExit: () => void
}> = ({ title, subtitle, lines, terminalRows, onExit }) => {
  // Track terminal dimensions in state so the component re-renders on resize.
  // Without this, the viewport was computed at mount and the body could
  // overflow the live screen if the user enlarged or shrank the terminal —
  // forcing the user to scroll their terminal emulator to see content the
  // viewer should have paginated.
  const { stdout } = useStdout()
  const initialRows = stdout?.rows ?? terminalRows
  const initialCols = stdout?.columns ?? 80
  const [dims, setDims] = useState<{ rows: number, cols: number }>({
    rows: initialRows,
    cols: initialCols,
  })

  useEffect(() => {
    if (!stdout)
      return
    const handler = (): void => {
      setDims({
        rows: stdout.rows ?? 24,
        cols: stdout.columns ?? 80,
      })
    }
    stdout.on('resize', handler)
    return () => {
      stdout.off('resize', handler)
    }
  }, [stdout])

  // The viewer is a fullscreen takeover: the parent renders it as an early
  // return that fills the whole terminal (no outer Header, no wizard padding),
  // so its available height is the full terminal. Its own chrome is exactly 6
  // rows — title + optional subtitle + two dividers + position line + exit hint
  // — and the rest is the scrollable viewport. (Previously this reserved 10 to
  // stay short enough not to trip the parent's body-measurement; now the early
  // return bypasses that, so we reserve only the real chrome and a flex spacer
  // fills any remainder — no dead space, and more lines visible per screen.)
  const VIEWER_CHROME_ROWS = 6
  const viewportRows = Math.max(1, dims.rows - VIEWER_CHROME_ROWS)
  const total = lines.length
  // Wrap-aware bound: maximum offset that still places the last logical line
  // inside the viewport. Without per-line wrap accounting the user could
  // scroll past the end on narrow terminals.
  const maxScrollOffset = computeMaxScrollOffset(lines, viewportRows, dims.cols)
  const [scrollOffset, setScrollOffset] = useState(0)

  // Clamp the scroll if the viewport grew past the bottom (e.g. terminal
  // resized larger after the user scrolled to the bottom).
  useEffect(() => {
    setScrollOffset(prev => Math.min(prev, maxScrollOffset))
  }, [maxScrollOffset])

  useInput((input, key) => {
    if (key.escape || key.return) {
      onExit()
      return
    }
    if (key.downArrow || input === 'j') {
      setScrollOffset(prev => Math.min(prev + 1, maxScrollOffset))
      return
    }
    if (key.upArrow || input === 'k') {
      setScrollOffset(prev => Math.max(prev - 1, 0))
      return
    }
    if (key.pageDown || input === 'd' || input === ' ') {
      setScrollOffset(prev => Math.min(prev + viewportRows, maxScrollOffset))
      return
    }
    if (key.pageUp || input === 'u') {
      setScrollOffset(prev => Math.max(prev - viewportRows, 0))
      return
    }
    if (input === 'g') {
      setScrollOffset(0)
      return
    }
    if (input === 'G') {
      setScrollOffset(maxScrollOffset)
    }
  })

  // Wrap-aware visible slice. `pickVisibleLines` stops adding logical lines
  // once their cumulative wrapped row count would overflow `viewportRows`,
  // so we never render past the bottom of the live terminal.
  const visibleLines = pickVisibleLines(lines, scrollOffset, viewportRows, dims.cols)
  const firstVisibleLine = total === 0 ? 0 : scrollOffset + 1
  const lastVisibleLine = Math.min(total, scrollOffset + visibleLines.length)
  const atBottom = scrollOffset >= maxScrollOffset
  // Divider widths scale to the terminal so the cosmetic border doesn't
  // wrap on narrow terminals (which would silently eat a viewport row).
  const dividerWidth = Math.max(10, Math.min(60, dims.cols - 1))

  // Suppress every scroll-related hint when the analysis fits the viewport
  // outright. The conservative `isAiAnalysisTooTall` estimator in the parent
  // sometimes routes us here even though `pickVisibleLines` ends up showing
  // every logical line — telling the user to "↑/↓ to scroll" when scrolling
  // is a no-op is just noise. The subtitle is also suppressed in that case
  // because its only job is to advertise "this is scrollable".
  const hasMoreToScroll = maxScrollOffset > 0

  return (
    // minHeight fills the whole terminal and the flexGrow spacer below pushes
    // the bottom divider + hints to the very bottom — so the frame height is
    // constant across scroll positions AND there's no dead space, regardless
    // of how many lines are currently visible.
    <Box flexDirection="column" minHeight={dims.rows}>
      <Text bold color="cyan">{title}</Text>
      {subtitle && hasMoreToScroll && <Text dimColor>{subtitle}</Text>}
      <Text color="cyan">{'─'.repeat(dividerWidth)}</Text>
      {visibleLines.map((line, index) => (
        <Text key={`ai-line-${scrollOffset + index}`}>{line}</Text>
      ))}
      <Box flexGrow={1} />
      <Text color="cyan">{'─'.repeat(dividerWidth)}</Text>
      <Text dimColor>
        {hasMoreToScroll
          ? `Showing ${firstVisibleLine}-${lastVisibleLine} of ${total} lines. ↑/↓ or PgUp/PgDn to scroll.`
          : `Showing all ${total} lines.`}
      </Text>
      <Text color="yellow" bold>
        {hasMoreToScroll && !atBottom
          ? 'Press Esc or Enter when done to continue.'
          : 'Press Esc or Enter to continue to the retry/skip prompt.'}
      </Text>
    </Box>
  )
}
