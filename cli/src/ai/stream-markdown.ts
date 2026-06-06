import type { MarkdownRenderState } from './render-markdown'
import { createMarkdownRenderState, renderMarkdownLine } from './render-markdown'

export interface StreamingMarkdownRenderer {
  /** Feed a decoded text chunk (any split point — mid-line, mid-fence). */
  feed: (text: string) => void
  /** Render the final line (the text after the last newline, possibly empty). */
  flush: () => void
}

/**
 * Incremental wrapper over the line-based markdown renderer, for progressive
 * TTY display of streamed AI analysis chunks.
 *
 * Buffers input until a newline completes a line, renders the completed line
 * through `renderMarkdownLine` (threading the code-fence state), and emits it.
 * Because every line is rendered by the exact same function the buffered
 * `renderMarkdown` uses, the concatenated streamed output is byte-identical
 * to `renderMarkdown(fullText)` — regardless of how the text was chunked.
 * (test-ai-stream-markdown.mjs proves this for every possible split point.)
 *
 * Trade-off: nothing prints until a line completes, so streaming is
 * line-by-line rather than character-by-character. Rewriting a partial line
 * in place would break as soon as the line wraps past the terminal width.
 */
export function createStreamingMarkdownRenderer(
  write: (text: string) => void,
  isTTY: boolean,
): StreamingMarkdownRenderer {
  if (!isTTY) {
    // Piped/redirected: raw markdown passthrough, same contract as renderMarkdown.
    return { feed: write, flush: () => {} }
  }

  const state: MarkdownRenderState = createMarkdownRenderState()
  let buffer = ''
  let firstLine = true

  const emitLine = (raw: string): void => {
    const rendered = renderMarkdownLine(raw, state)
    if (rendered === null)
      return // hidden ``` fence line
    write(firstLine ? rendered : `\n${rendered}`)
    firstLine = false
  }

  return {
    feed(text: string) {
      buffer += text
      let nl = buffer.indexOf('\n')
      while (nl !== -1) {
        emitLine(buffer.slice(0, nl))
        buffer = buffer.slice(nl + 1)
        nl = buffer.indexOf('\n')
      }
    },
    flush() {
      // Unconditional: the buffered renderer's split('\n') always yields a
      // final entry — empty when the text ends with '\n' — and rendering it
      // (e.g. as a trailing blank line, or a bare code bar inside an
      // unclosed fence) is part of the byte-identical contract.
      emitLine(buffer)
      buffer = ''
    },
  }
}
