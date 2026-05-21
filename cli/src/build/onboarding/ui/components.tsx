import type { FC } from 'react'
import { Box, Text, useInput } from 'ink'
import Spinner from 'ink-spinner'
// src/build/onboarding/ui/components.tsx
import React, { useState } from 'react'

export const Divider: FC<{ width?: number }> = ({ width = 60 }) => (
  <Text dimColor>{'─'.repeat(width)}</Text>
)

/**
 * Minimal in-house Table component. Auto-sizes each column to the widest
 * value (header or any row cell) up to `maxColumnWidth`, truncates with
 * an ellipsis when a cell exceeds that width, and renders box-drawing
 * borders.
 *
 * Why inline instead of `ink-table`: the published `ink-table@3.1.0` is
 * CommonJS and modern `ink` (v5+) is ESM with top-level await, so bundling
 * fails. This component is the small subset of ink-table's API we need
 * (rows of plain string cells) without the compat headache.
 *
 * The `data` rows must share a single key order so columns line up — we
 * derive the column list from the first row's keys.
 *
 * `cellColor` runs per-cell and returns an Ink color name (or undefined
 * for default). Used by the unavailable-certs table to colour the Reason
 * column yellow while keeping Name/Team dim.
 */
export interface TableProps {
  data: Record<string, string>[]
  /** Hard cap on column width before truncation. Default 50. */
  maxColumnWidth?: number
  /** Optional per-cell color function. */
  cellColor?: (column: string, value: string, rowIndex: number) => string | undefined
  /** Optional per-cell dim flag (defaults to false). */
  cellDim?: (column: string, value: string, rowIndex: number) => boolean
  /** Padding inside each cell (left/right). Default 1. */
  cellPadding?: number
}

export const Table: FC<TableProps> = ({ data, maxColumnWidth = 50, cellColor, cellDim, cellPadding = 1 }) => {
  if (data.length === 0)
    return null
  const columns = Object.keys(data[0])
  const truncate = (s: string, max: number): string => {
    // Unicode-safe length proxy — Array.from counts code-points so emoji
    // glyphs aren't double-counted. Terminal display width isn't perfectly
    // captured by codepoints (combining marks, double-width chars), but
    // it's close enough for typical ASC cert names + UTF-8 team chars.
    const codepoints = Array.from(s)
    return codepoints.length <= max ? s : `${codepoints.slice(0, max - 1).join('')}…`
  }
  // Compute column widths: max(header, all values), capped at maxColumnWidth.
  const widths: Record<string, number> = {}
  for (const col of columns) {
    let max = Array.from(col).length
    for (const row of data) {
      const v = row[col] ?? ''
      const w = Array.from(v).length
      if (w > max)
        max = w
    }
    widths[col] = Math.min(max, maxColumnWidth)
  }
  const pad = ' '.repeat(cellPadding)
  // Total inner width: sum of column content widths + padding * 2 per column + (cols-1) separators
  const borderRow = (left: string, mid: string, right: string, fill: string): string => {
    const segments = columns.map(c => fill.repeat(widths[c] + cellPadding * 2))
    return left + segments.join(mid) + right
  }
  const renderRow = (cells: { col: string, value: string, rowIndex?: number }[]): React.ReactNode => (
    <Text>
      │
      {cells.map((cell, idx) => {
        const truncated = truncate(cell.value, widths[cell.col])
        const padded = truncated + ' '.repeat(Math.max(0, widths[cell.col] - Array.from(truncated).length))
        const colorName = cellColor && cell.rowIndex !== undefined ? cellColor(cell.col, cell.value, cell.rowIndex) : undefined
        const dim = cellDim && cell.rowIndex !== undefined ? cellDim(cell.col, cell.value, cell.rowIndex) : false
        return (
          <React.Fragment key={cell.col}>
            {pad}
            <Text color={colorName as any} dimColor={dim}>{padded}</Text>
            {pad}
            │
            {idx === cells.length - 1 ? '' : ''}
          </React.Fragment>
        )
      })}
    </Text>
  )
  return (
    <Box flexDirection="column">
      <Text dimColor>{borderRow('┌', '┬', '┐', '─')}</Text>
      {renderRow(columns.map(c => ({ col: c, value: c })))}
      <Text dimColor>{borderRow('├', '┼', '┤', '─')}</Text>
      {data.map((row, i) => (
        <React.Fragment key={`row-${i}`}>
          {renderRow(columns.map(c => ({ col: c, value: row[c] ?? '', rowIndex: i })))}
        </React.Fragment>
      ))}
      <Text dimColor>{borderRow('└', '┴', '┘', '─')}</Text>
    </Box>
  )
}

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
  /**
   * Blacklist of characters to strip from input. Each char in this string is
   * removed from the buffer after every keystroke. Used for casual filtering
   * (e.g. stripping `=` from env-var values).
   */
  filter?: string
  /**
   * Whitelist regex matched per-character. Anything not matching is dropped.
   * Takes precedence over `filter` when both are set. Used when the field has
   * a tight format (Apple Key ID is exactly 10 alphanumeric chars; Issuer ID
   * is a UUID; etc.) so users can't even type invalid characters.
   */
  allowedPattern?: RegExp
  /**
   * Hard cap on input length. Extra characters past the cap are dropped
   * silently (paste-safe). Pair with `allowedPattern` for known-format fields
   * — e.g. Apple Key ID has `maxLength=10` so a paste of "Key ID: KDTXMK292V"
   * truncates to the first 10 valid chars after filtering.
   */
  maxLength?: number
  /**
   * Post-filter transform applied to the entire buffer after each keystroke.
   * Most common use: `(s) => s.toUpperCase()` for fields that are case-
   * insensitive but conventionally uppercase. Runs after filter + maxLength.
   */
  transform?: (value: string) => string
  mask?: boolean
  /**
   * Pre-fills the input. Used when the user is editing an already-entered
   * value (e.g. fixing a typo in their ASC Key ID / Issuer ID after a
   * verifying-key failure) so they don't have to retype everything.
   * Backspace works normally to delete from the pre-filled value.
   */
  initialValue?: string
  onSubmit: (value: string) => void
}> = ({ placeholder = '', filter = '=', allowedPattern, maxLength, transform, mask = false, initialValue = '', onSubmit }) => {
  const [value, setValue] = useState(() => applyConstraints(initialValue, { filter, allowedPattern, maxLength, transform }))

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
    // Append input then apply the full constraint pipeline (paste-safe).
    if (input) {
      setValue(prev => applyConstraints(prev + input, { filter, allowedPattern, maxLength, transform }))
    }
  })

  const display = mask ? '•'.repeat(value.length) : value
  const showCounter = maxLength !== undefined && !mask
  return (
    <Box>
      <Text color="cyan">❯ </Text>
      {value
        ? <Text>{display}</Text>
        : <Text dimColor>{placeholder}</Text>}
      <Text color="white">█</Text>
      {showCounter && (
        <Text dimColor>
          {'  '}
          {value.length}
          /
          {maxLength}
        </Text>
      )}
    </Box>
  )
}

/**
 * Apply the FilteredTextInput constraint pipeline in a single deterministic
 * pass: blacklist filter → allowedPattern whitelist → maxLength truncate →
 * transform. Pulled out so the initial-value prefill goes through the same
 * pipeline as user keystrokes (an initialValue with invalid chars would
 * otherwise appear briefly before the user typed anything).
 */
function applyConstraints(
  raw: string,
  opts: { filter: string, allowedPattern?: RegExp, maxLength?: number, transform?: (value: string) => string },
): string {
  let out = raw
  if (opts.filter) {
    const escape = (c: string) => c.replace(/[-\\^$*+?.()|[\]{}]/g, '\\$&')
    out = out.replace(new RegExp(`[${escape(opts.filter)}]`, 'g'), '')
  }
  if (opts.allowedPattern) {
    // Match each character against the per-character pattern. If the regex
    // is global or anchored we still treat it as a single-char test.
    const perChar = new RegExp(opts.allowedPattern.source, opts.allowedPattern.flags.replace(/g/g, ''))
    out = Array.from(out).filter(ch => perChar.test(ch)).join('')
  }
  if (opts.maxLength !== undefined && out.length > opts.maxLength)
    out = out.slice(0, opts.maxLength)
  if (opts.transform)
    out = opts.transform(out)
  return out
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
