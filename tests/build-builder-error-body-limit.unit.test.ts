import { describe, expect, it } from 'vitest'

import {
  formatBuilderErrorBody,
  MAX_BUILDER_ERROR_BODY_BYTES,
  readBuilderErrorBody,
} from '../supabase/functions/_backend/public/build/builder_response.ts'

function streamChunks(chunks: string[]) {
  const encoder = new TextEncoder()
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks)
        controller.enqueue(encoder.encode(chunk))
      controller.close()
    },
  })
}

async function expectOversizedBodyRejected(response: Response) {
  await expect(readBuilderErrorBody(response)).resolves.toBeNull()
}

describe('builder error body limits', () => {
  it('keeps small builder error bodies available for logs and client errors', async () => {
    const response = new Response('builder unavailable')

    await expect(readBuilderErrorBody(response)).resolves.toBe('builder unavailable')
  })

  it('rejects oversized builder error bodies from content-length before reading', async () => {
    await expectOversizedBodyRejected(new Response('too large', {
      headers: {
        'content-length': String(MAX_BUILDER_ERROR_BODY_BYTES + 1),
      },
    }))
  })

  it('rejects chunked builder error bodies after the cap is exceeded', async () => {
    await expectOversizedBodyRejected(new Response(streamChunks([
      'builder error:',
      'x'.repeat(MAX_BUILDER_ERROR_BODY_BYTES + 1),
    ])))
  })

  it('uses a stable placeholder when a builder error body is too large', () => {
    expect(formatBuilderErrorBody(null)).toBe('builder_error_body_too_large')
  })
})
