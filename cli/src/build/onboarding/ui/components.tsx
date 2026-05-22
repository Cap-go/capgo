import type { FC } from 'react'
import { Box, Text, useInput } from 'ink'
import Spinner from 'ink-spinner'
// src/build/onboarding/ui/components.tsx
import React, { useEffect, useState } from 'react'
import type { DiffLine } from '../diff-utils.js'

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
 * Minimal bordered table component for the confirm-secrets-push step.
 *
 * Rolled in-house instead of pulling `ink-table` because that package is
 * CommonJS-only and Ink 5 uses top-level await — bun can't bundle the combo.
 * Replicates the visual style (box-drawing borders, aligned columns) with
 * ~50 lines of Ink primitives, lets us color the Status column per-row, and
 * leaves nothing to maintain outside this repo.
 */
export interface SecretRow {
  name: string
  status: 'NEW' | 'REPLACE'
}

/**
 * Diff viewer building blocks for the workflow-file preview flow.
 *
 * When the proposed content is byte-identical to what's on disk we skip the
 * line-by-line dump entirely and show a short "matches — no diff" banner —
 * dumping 70 lines of `[eq]` content would only add noise.
 */
export interface DiffViewerProps {
  title: string
  subtitle?: string
  lines: DiffLine[]
}

function getDiffCounts(lines: DiffLine[]): { addCount: number, delCount: number, total: number } {
  return {
    addCount: lines.filter(l => l.kind === 'add').length,
    delCount: lines.filter(l => l.kind === 'del').length,
    total: lines.length,
  }
}

export const DiffSummary: FC<{ title: string, subtitle?: string, lines: DiffLine[] }> = ({ title, subtitle, lines }) => {
  const { addCount, delCount, total } = getDiffCounts(lines)
  const allEqual = total > 0 && lines.every(l => l.kind === 'eq')

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold color="cyan">{title}</Text>
      {subtitle && <Text dimColor>{subtitle}</Text>}
      <Text color="cyan">{'─'.repeat(60)}</Text>
      {allEqual
        ? (
            <Text color="green" bold>
              ✓ File on disk already matches the proposed content —
              {' '}
              {total}
              {' '}
              identical line
              {total === 1 ? '' : 's'}
              , no diff to show.
            </Text>
          )
        : (
            <Text dimColor>
              {'Summary:  '}
              <Text color="green">{`+${addCount} added`}</Text>
              {'   '}
              <Text color="red">{`-${delCount} removed`}</Text>
              {'   '}
              <Text>{`${total} line${total === 1 ? '' : 's'} total`}</Text>
            </Text>
          )}
    </Box>
  )
}

export const FullscreenDiffViewer: FC<{
  title: string
  subtitle?: string
  lines: DiffLine[]
  terminalRows: number
  onExit: () => void
}> = ({ title, subtitle, lines, terminalRows, onExit }) => {
  const viewportRows = Math.max(1, Math.min(lines.length || 1, terminalRows - 12))
  const [scrollOffset, setScrollOffset] = useState(0)
  const { addCount, delCount, total } = getDiffCounts(lines)
  const maxScrollOffset = Math.max(0, lines.length - viewportRows)

  useEffect(() => {
    setScrollOffset(prev => Math.min(prev, maxScrollOffset))
  }, [maxScrollOffset])

  useInput((input, key) => {
    if (key.escape) {
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
    if (key.pageDown || input === 'd') {
      setScrollOffset(prev => Math.min(prev + viewportRows, maxScrollOffset))
      return
    }
    if (key.pageUp || input === 'u') {
      setScrollOffset(prev => Math.max(prev - viewportRows, 0))
    }
  })

  const visibleLines = lines.slice(scrollOffset, scrollOffset + viewportRows)
  const firstVisibleLine = total === 0 ? 0 : scrollOffset + 1
  const lastVisibleLine = Math.min(total, scrollOffset + visibleLines.length)
  const lineNumberWidth = String(Math.max(total, 1)).length

  return (
    <Box flexDirection="column">
      <Text bold color="cyan">{title}</Text>
      {subtitle && <Text dimColor>{subtitle}</Text>}
      <Text color="cyan">{'─'.repeat(60)}</Text>
      <Text dimColor>
        {'Summary:  '}
        <Text color="green">{`+${addCount} added`}</Text>
        {'   '}
        <Text color="red">{`-${delCount} removed`}</Text>
      </Text>
      {visibleLines.map((line, index) => {
        const lineNumber = String(scrollOffset + index + 1).padStart(lineNumberWidth, ' ')
        if (line.kind === 'add') {
          return (
            <Text key={`line-${scrollOffset + index}`} color="green">
              {`${lineNumber} + `}
              {line.text}
            </Text>
          )
        }
        if (line.kind === 'del') {
          return (
            <Text key={`line-${scrollOffset + index}`} color="red">
              {`${lineNumber} - `}
              {line.text}
            </Text>
          )
        }
        return (
          <Text key={`line-${scrollOffset + index}`} dimColor>
            {`${lineNumber}   `}
            {line.text}
          </Text>
        )
      })}
      <Text color="cyan">{'─'.repeat(60)}</Text>
      <Text dimColor>
        {`Showing ${firstVisibleLine}-${lastVisibleLine} of ${total} lines. Use ↑/↓ or k/j to scroll.`}
      </Text>
      <Text color="yellow" bold>Click Escape to exit diff viewer</Text>
    </Box>
  )
}

export const DiffViewer: FC<DiffViewerProps> = ({ title, subtitle, lines }) => {
  const total = lines.length
  const allEqual = total > 0 && lines.every(l => l.kind === 'eq')
  const addCount = lines.filter(l => l.kind === 'add').length
  const delCount = lines.filter(l => l.kind === 'del').length

  // When the proposed file matches disk byte-for-byte, don't bother streaming
  // every line — render a compact dynamic banner instead.
  if (allEqual) {
    return (
      <Box flexDirection="column" marginTop={1}>
        <Text bold color="cyan">{title}</Text>
        {subtitle && <Text dimColor>{subtitle}</Text>}
        <Box marginTop={1}>
          <Text color="green" bold>
            ✓ File on disk already matches the proposed content —
            {' '}
            {total}
            {' '}
            identical line
            {total === 1 ? '' : 's'}
            , no diff to show.
          </Text>
        </Box>
      </Box>
    )
  }

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold color="cyan">{title}</Text>
      {subtitle && <Text dimColor>{subtitle}</Text>}
      <Text color="cyan">{'─'.repeat(60)}</Text>
      <Text dimColor>
        {'Summary:  '}
        <Text color="green">{`+${addCount} added`}</Text>
        {'   '}
        <Text color="red">{`-${delCount} removed`}</Text>
      </Text>
      {lines.map((line, index) => {
        const lineNumber = String(index + 1).padStart(4, ' ')
        if (line.kind === 'add') {
          return (
            <Text key={`line-${index}`} color="green">
              {`${lineNumber} + `}
              {line.text}
            </Text>
          )
        }
        if (line.kind === 'del') {
          return (
            <Text key={`line-${index}`} color="red">
              {`${lineNumber} - `}
              {line.text}
            </Text>
          )
        }
        return (
          <Text key={`line-${index}`} dimColor>
            {`${lineNumber}   `}
            {line.text}
          </Text>
        )
      })}
      <Text color="cyan">{'─'.repeat(60)}</Text>
      <Text dimColor>{`End of proposed diff (${total} line${total === 1 ? '' : 's'} total). Scroll your terminal up to review.`}</Text>
    </Box>
  )
}

/**
 * Render the secrets table inline. Keep this dynamic so the onboarding header
 * and prompt stay in one live Ink frame.
 */
export const SecretsTable: FC<{ rows: SecretRow[] }> = ({ rows }) => {
  const nameHeader = 'Secret name'
  const statusHeader = 'Status'
  const nameWidth = Math.max(nameHeader.length, ...rows.map(r => r.name.length))
  const statusWidth = Math.max(statusHeader.length, ...rows.map(r => r.status.length))

  const top = `┌─${'─'.repeat(nameWidth)}─┬─${'─'.repeat(statusWidth)}─┐`
  const sep = `├─${'─'.repeat(nameWidth)}─┼─${'─'.repeat(statusWidth)}─┤`
  const bot = `└─${'─'.repeat(nameWidth)}─┴─${'─'.repeat(statusWidth)}─┘`

  return (
    <Box flexDirection="column">
      <Text dimColor>{top}</Text>
      <Box>
        <Text dimColor>│ </Text>
        <Text bold>{nameHeader.padEnd(nameWidth, ' ')}</Text>
        <Text dimColor> │ </Text>
        <Text bold>{statusHeader.padEnd(statusWidth, ' ')}</Text>
        <Text dimColor> │</Text>
      </Box>
      <Text dimColor>{sep}</Text>
      {rows.map(row => (
        <Box key={row.name}>
          <Text dimColor>│ </Text>
          <Text>{row.name.padEnd(nameWidth, ' ')}</Text>
          <Text dimColor> │ </Text>
          <Text color={row.status === 'REPLACE' ? 'yellow' : 'green'}>
            {row.status.padEnd(statusWidth, ' ')}
          </Text>
          <Text dimColor> │</Text>
        </Box>
      ))}
      <Text dimColor>{bot}</Text>
    </Box>
  )
}
