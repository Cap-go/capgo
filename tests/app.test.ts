import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
import { BASE_URL, headers, ORG_ID, resetAndSeedAppData, resetAppData, resetAppDataStats } from './test-utils.ts'

describe('[DELETE] /app operations', () => {
  const id = randomUUID()
  const APPNAME = `com.app.${id}`

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

describe('[GET] /app operations with subkey', () => {
  const id = randomUUID()
  const APPNAME = `com.subkey.${id}`
  let subkey = 0

  afterAll(async () => {
    await resetAppData(APPNAME)
    await resetAppDataStats(APPNAME)
  })

  it('should create app and subkey with limited rights', async () => {
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

    // Create a subkey with limited rights to this app
    const createSubkey = await fetch(`${BASE_URL}/apikey`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: 'Limited Subkey',
        mode: 'all',
        limited_to_apps: [APPNAME],
      }),
    })
    expect(createSubkey.status).toBe(200)
    const subkeyData = await createSubkey.json() as { id: number }
    subkey = subkeyData.id
  })

  it('should access app with subkey', async () => {
    // Access app with subkey
    const subkeyHeaders = { 'x-limited-key-id': String(subkey) }
    const getAppWithSubkey = await fetch(`${BASE_URL}/app/${APPNAME}`, {
      method: 'GET',
      headers: { ...headers, ...subkeyHeaders },
    })
    expect(getAppWithSubkey.status).toBe(200)
    const data = await getAppWithSubkey.json() as { name: string }
    expect(data.name).toBe(APPNAME)
  })

  it('should not access another app with subkey', async () => {
    // Create another app
    const otherAppId = randomUUID()
    const OTHER_APPNAME = `com.other.subkey.${otherAppId}`
    const createOtherApp = await fetch(`${BASE_URL}/app`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        owner_org: ORG_ID,
        name: OTHER_APPNAME,
        icon: 'test-icon',
      }),
    })
    expect(createOtherApp.status).toBe(200)

    // Try to access the other app with the subkey
    const subkeyHeaders = { 'x-limited-key-id': String(subkey) }
    const getOtherAppWithSubkey = await fetch(`${BASE_URL}/app/${OTHER_APPNAME}`, {
      method: 'GET',
      headers: { ...headers, ...subkeyHeaders },
    })
    const data = await getOtherAppWithSubkey.json()
    expect(data).toHaveProperty('status', 'You can\'t access this app')
    expect(getOtherAppWithSubkey.status).toBe(400)

    // Clean up the other app
    await resetAppData(OTHER_APPNAME)
    await resetAppDataStats(OTHER_APPNAME)
  })

  it('should update app with subkey', async () => {
    // Update app with subkey
    const subkeyHeaders = { 'x-limited-key-id': String(subkey) }
    const updateApp = await fetch(`${BASE_URL}/app/${APPNAME}`, {
      method: 'PUT',
      headers: { ...headers, ...subkeyHeaders },
      body: JSON.stringify({
        name: APPNAME,
        icon: 'updated-icon',
      }),
    })
    expect(updateApp.status).toBe(200)
  })

  it('should not delete app with subkey if rights are read-only', async () => {
    // Attempt to delete app with subkey
    const createSubkey = await fetch(`${BASE_URL}/apikey`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: 'Limited Subkey2',
        mode: 'read',
        limited_to_apps: [APPNAME],
      }),
    })
    expect(createSubkey.status).toBe(200)
    const subkeyData = await createSubkey.json() as { id: number }
    const subkeyHeaders = { 'x-limited-key-id': String(subkeyData.id) }
    const deleteApp = await fetch(`${BASE_URL}/app/${APPNAME}`, {
      method: 'DELETE',
      headers: { ...headers, ...subkeyHeaders },
    })
    expect(deleteApp.status).toBe(401)
  })

  it('should get all apps with subkey', async () => {
    // Get all apps with subkey
    const subkeyHeaders = { 'x-limited-key-id': String(subkey) }
    const getAllApps = await fetch(`${BASE_URL}/app`, {
      method: 'GET',
      headers: { ...headers, ...subkeyHeaders },
    })
    expect(getAllApps.status).toBe(200)
    const appsDataWithSubkey = await getAllApps.json() as { name: string }[]
    const appNamesWithSubkey = appsDataWithSubkey.map(app => app.name)
    expect(appNamesWithSubkey).toContain(APPNAME)
  })

  it('should get all apps without subkey', async () => {
    // Get all apps without subkey
    const getAllApps = await fetch(`${BASE_URL}/app`, {
      method: 'GET',
      headers,
    })
    expect(getAllApps.status).toBe(200)
    const appsDataWithoutSubkey = await getAllApps.json() as { name: string }[]
    const appNamesWithoutSubkey = appsDataWithoutSubkey.map(app => app.name)
    expect(appNamesWithoutSubkey).toContain(APPNAME)
  })
})
