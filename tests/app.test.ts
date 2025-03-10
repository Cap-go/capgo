import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
import { BASE_URL, headers, ORG_ID, resetAndSeedAppData, resetAppData, resetAppDataStats } from './test-utils.ts'

describe('[DELETE] /app operations', () => {
  const id = randomUUID()
  const APPNAME = `com.demo.app.${id}`

  afterAll(async () => {
    await resetAppData(APPNAME)
    await resetAppDataStats(APPNAME)
  })

  it('should delete app and all associated data', async () => {
    // Create a test app
    const createApp = await fetch(`${BASE_URL}/app`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        owner_org: ORG_ID,
        name: APPNAME,
        icon: 'test-icon',
      }),
    })
    expect(createApp.status).toBe(200)

    await resetAndSeedAppData(APPNAME)

    // Delete the app
    const deleteApp = await fetch(`${BASE_URL}/app/${APPNAME}`, {
      method: 'DELETE',
      headers,
    })
    expect(deleteApp.status).toBe(200)

    // Verify app is deleted
    const checkApp = await fetch(`${BASE_URL}/app/${APPNAME}`, {
      method: 'GET',
      headers,
    })
    expect(checkApp.status).toBe(400)

    // Verify version is deleted
    const checkVersion = await fetch(`${BASE_URL}/bundle/${APPNAME}/1.0.0`, {
      method: 'GET',
      headers,
    })
    expect(checkVersion.status).toBe(404)

    // Verify channel devices are deleted
    const checkDevices = await fetch(`${BASE_URL}/device/${APPNAME}`, {
      method: 'GET',
      headers,
    })
    expect(checkDevices.status).toBe(404)

    // Verify channels are deleted
    const checkChannels = await fetch(`${BASE_URL}/channel/${APPNAME}`, {
      method: 'GET',
      headers,
    })
    expect(checkChannels.status).toBe(404)
  })
})
