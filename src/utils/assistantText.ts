export interface AssistantSpan {
  text: string
  style: 'plain' | 'bold' | 'code'
}

export type AssistantBlock
  = | { type: 'paragraph', spans: AssistantSpan[] }
    | { type: 'list', items: AssistantSpan[][] }

const INLINE = /\*\*([^*]+)\*\*|`([^`]+)`/g
const BULLET = /^\s*(?:[-*•]|\d+[.)])\s+/

/** Inline **bold** and `code` only; everything is rendered as text, never as HTML. */
export function tokenizeInline(text: string): AssistantSpan[] {
  const spans: AssistantSpan[] = []
  let last = 0
  for (const match of text.matchAll(INLINE)) {
    if (match.index > last)
      spans.push({ text: text.slice(last, match.index), style: 'plain' })
    spans.push(match[1] !== undefined ? { text: match[1], style: 'bold' } : { text: match[2], style: 'code' })
    last = match.index + match[0].length
  }
  if (last < text.length)
    spans.push({ text: text.slice(last), style: 'plain' })
  return spans
}

/** Split the model reply into paragraphs and bullet lists for the chat bubble. */
export function tokenizeAssistantText(text: string): AssistantBlock[] {
  const blocks: AssistantBlock[] = []
  let paragraph: string[] = []
  let list: AssistantSpan[][] = []

  const flushParagraph = () => {
    if (paragraph.length)
      blocks.push({ type: 'paragraph', spans: tokenizeInline(paragraph.join('\n').replace(/^#+\s*/gm, '')) })
    paragraph = []
  }
  const flushList = () => {
    if (list.length)
      blocks.push({ type: 'list', items: list })
    list = []
  }

  for (const line of text.split('\n')) {
    if (BULLET.test(line)) {
      flushParagraph()
      list.push(tokenizeInline(line.replace(BULLET, '')))
    }
    else if (line.trim() === '') {
      flushParagraph()
      flushList()
    }
    else {
      flushList()
      paragraph.push(line)
    }
  }
  flushParagraph()
  flushList()
  return blocks
}
