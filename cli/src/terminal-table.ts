const ESC = '\\u001B'
const BEL = '\\u0007'
const ANSI_PATTERN = new RegExp(`${ESC}(?:\\[[0-?]*[ -/]*[@-~]|\\][^${BEL}]*(?:${BEL}|${ESC}\\\\)|[@-Z\\\\-_])`, 'g')
const MARK_PATTERN = /\p{Mark}/u

export type TableCell = string | number | boolean | null | undefined

export interface FormatTableOptions {
  headers?: TableCell[]
  rows: TableCell[][]
}

function stripAnsi(value: string): string {
  return value.replace(ANSI_PATTERN, '')
}

function isWideCodePoint(codePoint: number): boolean {
  return (
    codePoint >= 0x1100
    && (
      codePoint <= 0x115F
      || codePoint === 0x2329
      || codePoint === 0x232A
      || (codePoint >= 0x2600 && codePoint <= 0x27BF)
      || (codePoint >= 0x2E80 && codePoint <= 0xA4CF && codePoint !== 0x303F)
      || (codePoint >= 0xAC00 && codePoint <= 0xD7A3)
      || (codePoint >= 0xF900 && codePoint <= 0xFAFF)
      || (codePoint >= 0xFE10 && codePoint <= 0xFE19)
      || (codePoint >= 0xFE30 && codePoint <= 0xFE6F)
      || (codePoint >= 0xFF00 && codePoint <= 0xFF60)
      || (codePoint >= 0xFFE0 && codePoint <= 0xFFE6)
      || (codePoint >= 0x1F000 && codePoint <= 0x1FAFF)
    )
  )
}

export function visibleWidth(value: string): number {
  let width = 0

  for (const char of stripAnsi(value)) {
    const codePoint = char.codePointAt(0)
    if (!codePoint)
      continue

    if (codePoint <= 0x1F || (codePoint >= 0x7F && codePoint <= 0x9F))
      continue
    if (codePoint === 0x200D || (codePoint >= 0xFE00 && codePoint <= 0xFE0F) || MARK_PATTERN.test(char))
      continue

    width += isWideCodePoint(codePoint) ? 2 : 1
  }

  return width
}

function cellToString(cell: TableCell): string {
  if (cell == null)
    return ''

  return String(cell)
}

function padEndVisible(value: string, width: number): string {
  const padding = width - visibleWidth(value)
  return padding > 0 ? `${value}${' '.repeat(padding)}` : value
}

function bold(value: string): string {
  return `\x1B[1m${value}\x1B[0m`
}

export function formatTable({ headers = [], rows }: FormatTableOptions): string {
  const normalizedHeaders = headers.map(cellToString)
  const normalizedRows = rows.map(row => row.map(cellToString))
  const content = [
    ...(normalizedHeaders.length ? [normalizedHeaders] : []),
    ...normalizedRows,
  ]

  if (!content.length)
    return ''

  const columnCount = Math.max(...content.map(row => row.length))
  const widths = Array.from({ length: columnCount }, (_, index) =>
    Math.max(...content.map(row => visibleWidth(row[index] ?? ''))),
  )

  const renderLine = (left: string, middle: string, right: string) =>
    `${left}${widths.map(width => '─'.repeat(width)).join(middle)}${right}`

  const renderRow = (row: string[], header = false) =>
    `│ ${widths.map((width, index) => {
      const value = row[index] ?? ''
      return padEndVisible(header ? bold(value) : value, width)
    }).join(' │ ')} │`

  return [
    renderLine('╭─', '─┬─', '─╮'),
    ...(normalizedHeaders.length
      ? [
          renderRow(normalizedHeaders, true),
          ...(normalizedRows.length ? [renderLine('├─', '─┼─', '─┤')] : []),
        ]
      : []),
    ...normalizedRows.map(row => renderRow(row)),
    renderLine('╰─', '─┴─', '─╯'),
  ].join('\n')
}
