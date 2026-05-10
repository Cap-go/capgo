import { describe, expect, it } from 'vitest'
import { readResponseBytesWithLimit } from '../supabase/functions/_backend/utils/response.ts'

function responseFromChunks(chunks: Uint8Array[]) {
  return new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks)
        controller.enqueue(chunk)
      controller.close()
    },
  }))
}

describe('readResponseBytesWithLimit', () => {
  it('returns bytes when the streamed body stays within the limit', async () => {
    const bytes = await readResponseBytesWithLimit(
      responseFromChunks([
        new Uint8Array([1, 2]),
        new Uint8Array([3]),
      ]),
      3,
    )

    expect(Array.from(bytes ?? [])).toEqual([1, 2, 3])
  })

  it('returns null once a streamed body exceeds the limit', async () => {
    const bytes = await readResponseBytesWithLimit(
      responseFromChunks([
        new Uint8Array([1, 2]),
        new Uint8Array([3, 4]),
      ]),
      3,
    )

    expect(bytes).toBeNull()
  })

  it('rejects oversized responses from content-length before reading', async () => {
    const bytes = await readResponseBytesWithLimit(
      new Response('ignored', {
        headers: { 'content-length': '4' },
      }),
      3,
    )

    expect(bytes).toBeNull()
  })
})
