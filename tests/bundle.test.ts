import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { BASE_URL, fetchBundle, headers, resetAndSeedAppData, resetAppData, resetAppDataStats } from './test-utils.ts'

const APPNAME = 'com.demo.app.bundle'

beforeAll(async () => {
  await resetAndSeedAppData(APPNAME)
})
afterAll(async () => {
  await resetAppData(APPNAME)
  await resetAppDataStats(APPNAME)
})

describe('[GET] /bundle operations', () => {
  it('valid app_id', async () => {
    const { response, data } = await fetchBundle(APPNAME)
    expect(response.status).toBe(200)
    expect(Array.isArray(data)).toBe(true)
  })

  it('invalid app_id', async () => {
    const { response } = await fetchBundle('invalid_app')
    expect(response.status).toBe(400)
  })
})

describe('[DELETE] /bundle operations', () => {
  it('invalid version', async () => {
    const response = await fetch(`${BASE_URL}/bundle`, {
      method: 'DELETE',
      headers,
      body: JSON.stringify({
        app_id: APPNAME,
        version: 'invalid_version',
      }),
    })
    await response.arrayBuffer()
    expect(response.status).toBe(400)
  })

  it('invalid app_id', async () => {
    const response = await fetch(`${BASE_URL}/bundle`, {
      method: 'DELETE',
      headers,
      body: JSON.stringify({
        app_id: 'invalid_app',
      }),
    })
    await response.arrayBuffer()
    expect(response.status).toBe(400)
  })

  it('delete specific bundle', async () => {
    const deleteBundle = await fetch(`${BASE_URL}/bundle`, {
      method: 'DELETE',
      headers,
      body: JSON.stringify({
        app_id: APPNAME,
        version: '1.0.1',
      }),
    })
    const deleteBundleData = await deleteBundle.json() as { status: string }
    expect(deleteBundle.status).toBe(200)
    expect(deleteBundleData.status).toBe('ok')
  })

  it('delete all bundles for an app', async () => {
    const deleteAllBundles = await fetch(`${BASE_URL}/bundle`, {
      method: 'DELETE',
      headers,
      body: JSON.stringify({
        app_id: APPNAME,
      }),
    })

    const deleteAllBundlesData = await deleteAllBundles.json() as { status: string }
    expect(deleteAllBundles.status).toBe(200)
    expect(deleteAllBundlesData.status).toBe('ok')
  })
})
