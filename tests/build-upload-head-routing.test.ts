import { describe, expect, it } from 'vitest'
import { app } from '../supabase/functions/_backend/public/build/index.ts'

describe('build upload HEAD routing', () => {
  it.concurrent('routes HEAD /upload/:jobId/* through auth middleware', async () => {
    const response = await app.request(new Request('http://localhost/upload/test-job/file.zip', {
      method: 'HEAD',
      headers: {
        'Tus-Resumable': '1.0.0',
      },
    }))

    expect(response.status).not.toBe(404)
    expect([400, 401]).toContain(response.status)
  })

  it.concurrent('keeps GET /upload/:jobId/* as not found', async () => {
    const response = await app.request(new Request('http://localhost/upload/test-job/file.zip', {
      method: 'GET',
    }))

    expect(response.status).toBe(404)
  })
})
