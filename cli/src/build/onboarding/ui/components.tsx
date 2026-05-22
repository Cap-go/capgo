import type { FC } from 'react'
import { Box, Text, useInput, useStdout } from 'ink'
import Spinner from 'ink-spinner'
// src/build/onboarding/ui/components.tsx
import React, { useEffect, useState } from 'react'
import { computeMaxScrollOffset, pickVisibleLines, totalRenderedRows } from '../ai-fit.js'

export const Divider: FC<{ width?: number }> = ({ width = 60 }) => (
  <Text dimColor>{'─'.repeat(width)}</Text>
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

export const Header: FC = () => (
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

  // Reserve 10 rows for the viewer's own chrome: title + optional subtitle +
  // two dividers + position line + exit hint + a margin to absorb chrome
  // lines that themselves wrap on narrow terminals. The parent wizard has
  // already hidden its outer Header for this step so the viewer owns the
  // whole screen.
  const VIEWER_CHROME_ROWS = 10
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

  // Pad the content area with empty rows so the viewer's total frame height
  // is CONSTANT across scroll positions. Without this, scrolling can change
  // the frame height by ±1 row when lines with different wrap counts move in
  // and out of view — Ink then writes the new (taller) frame BELOW the old
  // one and the user perceives "scrolling just added an extra line".
  const visibleRowsUsed = totalRenderedRows(visibleLines, dims.cols)
  const padRows = Math.max(0, viewportRows - visibleRowsUsed)

  return (
    <Box flexDirection="column">
      <Text bold color="cyan">{title}</Text>
      {subtitle && <Text dimColor>{subtitle}</Text>}
      <Text color="cyan">{'─'.repeat(dividerWidth)}</Text>
      {visibleLines.map((line, index) => (
        <Text key={`ai-line-${scrollOffset + index}`}>{line}</Text>
      ))}
      {Array.from({ length: padRows }).map((_, i) => (
        <Text key={`ai-pad-${i}`}>{' '}</Text>
      ))}
      <Text color="cyan">{'─'.repeat(dividerWidth)}</Text>
      <Text dimColor>
        {`Showing ${firstVisibleLine}-${lastVisibleLine} of ${total} lines. ↑/↓ or PgUp/PgDn to scroll.`}
      </Text>
      <Text color="yellow" bold>
        {atBottom
          ? 'Press Esc or Enter to continue to the retry/skip prompt.'
          : 'Press Esc or Enter when done to continue.'}
      </Text>
    </Box>
  )
}
