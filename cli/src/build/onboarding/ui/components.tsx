import type { FC } from 'react'
import { Box, Text, useInput } from 'ink'
import Spinner from 'ink-spinner'
// src/build/onboarding/ui/components.tsx
import React, { useEffect, useState } from 'react'

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
  // Reserve 8 rows for the viewer's own chrome: title (1) + optional subtitle
  // (1) + top divider (1) + bottom divider (1) + position line (1) + exit
  // hint (1) + 2 rows of breathing room. The parent wizard already hides its
  // outer Header during this step so the viewer can use the full screen.
  const viewportRows = Math.max(1, Math.min(lines.length || 1, terminalRows - 8))
  const [scrollOffset, setScrollOffset] = useState(0)
  const total = lines.length
  const maxScrollOffset = Math.max(0, lines.length - viewportRows)

  // Clamp the scroll if the viewport grows past the bottom (e.g. terminal
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

  const visibleLines = lines.slice(scrollOffset, scrollOffset + viewportRows)
  const firstVisibleLine = total === 0 ? 0 : scrollOffset + 1
  const lastVisibleLine = Math.min(total, scrollOffset + visibleLines.length)
  const atBottom = scrollOffset >= maxScrollOffset

  return (
    <Box flexDirection="column">
      <Text bold color="cyan">{title}</Text>
      {subtitle && <Text dimColor>{subtitle}</Text>}
      <Text color="cyan">{'─'.repeat(60)}</Text>
      {visibleLines.map((line, index) => (
        <Text key={`ai-line-${scrollOffset + index}`}>{line}</Text>
      ))}
      <Text color="cyan">{'─'.repeat(60)}</Text>
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
