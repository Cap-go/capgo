// cli/src/ai/sse.ts
export interface SseEvent {
  event: string
  data: string
}

// Incremental SSE frame parser. Feed it decoded text as it arrives; it fires
// onEvent once per complete frame (frames are separated by a blank line).
// Handles frames split across network chunks and multi-line data fields.
export function createSseParser(onEvent: (e: SseEvent) => void): (text: string) => void {
  let buffer = ''
  return (text: string) => {
    buffer += text
    let sep = buffer.indexOf('\n\n')
    while (sep !== -1) {
      const frame = buffer.slice(0, sep)
      buffer = buffer.slice(sep + 2)
      let event = 'message'
      const data: string[] = []
      for (const line of frame.split('\n')) {
        if (line.startsWith('event:'))
          event = line.slice(6).trim()
        else if (line.startsWith('data:'))
          data.push(line.slice(5).trim())
      }
      if (data.length > 0)
        onEvent({ event, data: data.join('\n') })
      sep = buffer.indexOf('\n\n')
    }
  }
}
