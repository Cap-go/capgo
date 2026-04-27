import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import { app as buildApp } from '../supabase/functions/_backend/public/build/index.ts'

function createMountedBuildApp() {
  return new Hono().basePath('/build').route('/', buildApp)
}

// Intentionally uses a mounted Hono app as a lightweight routing smoke test:
// this validates the deployed /build/upload path before worker/binding setup.
describe('build upload HEAD routing', () => {
  it.concurrent('routes HEAD /build/upload/:jobId/* through auth middleware', async () => {
    const response = await createMountedBuildApp().request(new Request('http://localhost/build/upload/test-job/file.zip', {
      method: 'HEAD',
      headers: {
        'Tus-Resumable': '1.0.0',
      },
    }))

    expect(response.status).not.toBe(404)
    expect([400, 401]).toContain(response.status)
  })

  it.concurrent('routes HEAD /build/upload/:jobId through auth middleware', async () => {
    const response = await createMountedBuildApp().request(new Request('http://localhost/build/upload/test-job', {
      method: 'HEAD',
      headers: {
        'Tus-Resumable': '1.0.0',
      },
    }))

    expect(response.status).not.toBe(404)
    expect([400, 401]).toContain(response.status)
  })

  it.concurrent('treats GET /build/upload/:jobId/* with Tus-Resumable as a TUS HEAD fallback', async () => {
    const response = await createMountedBuildApp().request(new Request('http://localhost/build/upload/test-job/file.zip', {
      method: 'GET',
      headers: {
        'Tus-Resumable': '1.0.0',
      },
    }))

    expect(response.status).not.toBe(404)
    expect([400, 401]).toContain(response.status)
  })

  it.concurrent('keeps GET /build/upload/:jobId/* as not found', async () => {
    const response = await createMountedBuildApp().request(new Request('http://localhost/build/upload/test-job/file.zip', {
      method: 'GET',
    }))

    expect(response.status).toBe(404)
  })
})
