// cli/src/ai/sse.ts
export interface SseEvent {
  event: string
  data: string
}

// Incremental SSE frame parser. Feed it decoded text as it arrives; it fires
// onEvent once per complete frame (frames are separated by a blank line).
// Line-based per the SSE spec: accepts \n, \r\n, and \r line endings (an
// upstream proxy may rewrite line endings), handles frames and even single
// CRLF sequences split across network chunks, and multi-line data fields.
export function createSseParser(onEvent: (e: SseEvent) => void): (text: string) => void {
  let buffer = ''
  let event = 'message'
  let data: string[] = []

  const dispatch = (): void => {
    if (data.length > 0)
      onEvent({ event, data: data.join('\n') })
    event = 'message'
    data = []
  }

  return (text: string) => {
    buffer += text
    while (true) {
      const m = /\r\n|\n|\r/.exec(buffer)
      if (!m)
        break
      // A trailing '\r' may be the first half of a '\r\n' split across network
      // chunks — wait for the next feed before consuming it as a terminator.
      if (m[0] === '\r' && m.index === buffer.length - 1)
        break
      const line = buffer.slice(0, m.index)
      buffer = buffer.slice(m.index + m[0].length)
      if (line === '')
        dispatch()
      else if (line.startsWith('event:'))
        event = line.slice(6).trim()
      else if (line.startsWith('data:'))
        data.push(line.slice(5).trim())
    }
  }
}
