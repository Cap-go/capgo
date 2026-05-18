/**
 * Tiny terminal renderer for the subset of markdown the AI is asked to emit:
 * `###`/`####` headers, fenced code blocks, **bold**, *italic*, `inline code`,
 * numbered lists (`1.`), bullet lists (`-` / `*`), and plain paragraphs.
 *
 * No external dep — uses raw ANSI escape sequences. Falls back to the input
 * unchanged when stdout is not a TTY so the output stays grep-able / pipeable.
 */
import process from 'node:process'

const ANSI = {
  reset: '\x1B[0m',
  bold: '\x1B[1m',
  dim: '\x1B[2m',
  italic: '\x1B[3m',
  cyan: '\x1B[36m',
  yellow: '\x1B[33m',
  gray: '\x1B[90m',
}

function stylize(open: string, text: string): string {
  return `${open}${text}${ANSI.reset}`
}

function renderInline(line: string): string {
  // Order matters: handle code spans first so we don't bold/italic content inside backticks.
  return line
    // `inline code` -> dim cyan
    .replace(/`([^`]+)`/g, (_, code: string) => stylize(`${ANSI.cyan}${ANSI.dim}`, code))
    // **bold** -> bold (after code so the ** in code isn't matched)
    .replace(/\*\*([^*]+)\*\*/g, (_, b: string) => stylize(ANSI.bold, b))
    // *italic* -> italic. Negative-lookahead/behind avoid ** false-matches and
    // bare * in log content.
    .replace(/(^|[^*])\*([^*\s][^*]*?)\*(?!\*)/g, (_, prefix: string, i: string) => `${prefix}${stylize(ANSI.italic, i)}`)
}

export function renderMarkdown(md: string, isTTY: boolean = process.stdout.isTTY === true): string {
  if (!isTTY) return md // keep raw markdown when piped/redirected

  const lines = md.split('\n')
  const out: string[] = []
  let inCodeBlock = false

  for (const raw of lines) {
    // Fenced code block: toggle and render fence dimly so the user sees the boundary
    if (raw.trimStart().startsWith('```')) {
      inCodeBlock = !inCodeBlock
      out.push(stylize(ANSI.gray, raw))
      continue
    }
    if (inCodeBlock) {
      out.push(stylize(ANSI.cyan, raw))
      continue
    }

    // Headers
    const headerMatch = raw.match(/^(#{1,6})\s+(.+)$/)
    if (headerMatch) {
      const text = headerMatch[2]
      out.push('')
      out.push(stylize(`${ANSI.bold}${ANSI.cyan}`, text))
      continue
    }

    // Numbered list (preserve the number)
    const numberedMatch = raw.match(/^(\s*)(\d+)\.\s+(.*)$/)
    if (numberedMatch) {
      const [, indent, n, rest] = numberedMatch
      out.push(`${indent}${stylize(ANSI.yellow, `${n}.`)} ${renderInline(rest)}`)
      continue
    }

    // Bullet list
    const bulletMatch = raw.match(/^(\s*)[-*]\s+(.*)$/)
    if (bulletMatch) {
      const [, indent, rest] = bulletMatch
      out.push(`${indent}${stylize(ANSI.yellow, '•')} ${renderInline(rest)}`)
      continue
    }

    out.push(renderInline(raw))
  }

  return out.join('\n')
}
