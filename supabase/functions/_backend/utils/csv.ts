function escapeCsvValue(value: unknown): string {
  if (value === null || value === undefined)
    return ''
  const str = typeof value === 'string' ? value : JSON.stringify(value)
  // Quote if it contains CSV special chars.
  if (/[",\n\r]/.test(str))
    return `"${str.replace(/"/g, '""')}"`
  return str
}

export function toCsv<THeader extends readonly string[]>(
  header: THeader,
  rows: Array<Record<THeader[number], unknown>>,
): string {
  const lines: string[] = []
  lines.push(header.join(','))
  for (const row of rows) {
    lines.push(header.map(key => escapeCsvValue(row[key])).join(','))
  }
  // Always end with newline so spreadsheet import is consistent.
  return `${lines.join('\n')}\n`
}
