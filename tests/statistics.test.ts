import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { BASE_URL, headers, ORG_ID, resetAndSeedAppData, resetAndSeedAppDataStats, resetAppData, resetAppDataStats } from './test-utils.ts'

describe('[GET] /statistics operations with and without subkey', () => {
  const id = randomUUID()
  const APPNAME = `com.stats.${id}`
  let subkeyId = 0

  beforeAll(async () => {
    await resetAndSeedAppData(APPNAME)
    await resetAndSeedAppDataStats(APPNAME)
  })

  afterAll(async () => {
    await resetAppData(APPNAME)
    await resetAppDataStats(APPNAME)
    const deleteApikey = await fetch(`${BASE_URL}/apikey/${subkeyId}`, {
      method: 'DELETE',
      headers,
    })
    expect(deleteApikey.status).toBe(200)
  })

  it('should get app statistics without subkey', async () => {
    const fromDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    const toDate = new Date().toISOString().split('T')[0]
    const getStats = await fetch(`${BASE_URL}/statistics/app/${APPNAME}?from=${fromDate}&to=${toDate}`, {
      method: 'GET',
      headers,
    })
    expect(getStats.status).toBe(200)
    const statsData = await getStats.json()
    expect(Array.isArray(statsData)).toBe(true)
  })

  it('should get organization statistics without subkey', async () => {
    const fromDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    const toDate = new Date().toISOString().split('T')[0]
    const getOrgStats = await fetch(`${BASE_URL}/statistics/org/${ORG_ID}?from=${fromDate}&to=${toDate}`, {
      method: 'GET',
      headers,
    })
    expect(getOrgStats.status).toBe(200)
    const orgStatsData = await getOrgStats.json()
    expect(Array.isArray(orgStatsData)).toBe(true)
  })

  it('should get user statistics without subkey', async () => {
    const fromDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    const toDate = new Date().toISOString().split('T')[0]
    const getUserStats = await fetch(`${BASE_URL}/statistics/user?from=${fromDate}&to=${toDate}`, {
      method: 'GET',
      headers,
    })
    expect(getUserStats.status).toBe(200)
    const userStatsData = await getUserStats.json()
    expect(Array.isArray(userStatsData)).toBe(true)
  })

  it('should get bundle usage statistics without subkey', async () => {
    const fromDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    const toDate = new Date().toISOString().split('T')[0]
    const getBundleUsage = await fetch(`${BASE_URL}/statistics/app/${APPNAME}/bundle_usage?from=${fromDate}&to=${toDate}`, {
      method: 'GET',
      headers,
    })
    expect(getBundleUsage.status).toBe(200)
    const bundleUsageData = await getBundleUsage.json()
    expect(bundleUsageData).toHaveProperty('labels')
    expect(bundleUsageData).toHaveProperty('datasets')
  })

  it('should create app and subkey with limited rights', async () => {
    // Create a subkey with limited rights to this app
    const createSubkey = await fetch(`${BASE_URL}/apikey`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: 'Limited Stats Subkey',
        mode: 'read',
        limited_to_apps: [APPNAME],
      }),
    })
    expect(createSubkey.status).toBe(200)
    const subkeyData = await createSubkey.json() as { id: number }
    subkeyId = subkeyData.id
  })

  it('should get app statistics with subkey', async () => {
    const subkeyHeaders = { 'x-limited-key-id': String(subkeyId) }
    const fromDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    const toDate = new Date().toISOString().split('T')[0]
    const getStats = await fetch(`${BASE_URL}/statistics/app/${APPNAME}?from=${fromDate}&to=${toDate}`, {
      method: 'GET',
      headers: { ...headers, ...subkeyHeaders },
    })
    expect(getStats.status).toBe(200)
    const statsData = await getStats.json()
    expect(Array.isArray(statsData)).toBe(true)
  })

  it('should get organization statistics with subkey', async () => {
    const subkeyHeaders = { 'x-limited-key-id': String(subkeyId) }
    const fromDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    const toDate = new Date().toISOString().split('T')[0]
    const getOrgStats = await fetch(`${BASE_URL}/statistics/org/${ORG_ID}?from=${fromDate}&to=${toDate}`, {
      method: 'GET',
      headers: { ...headers, ...subkeyHeaders },
    })
    expect(getOrgStats.status).toBe(401)
  })

  it('should get user statistics with subkey', async () => {
    const subkeyHeaders = { 'x-limited-key-id': String(subkeyId) }
    const fromDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    const toDate = new Date().toISOString().split('T')[0]
    const getUserStats = await fetch(`${BASE_URL}/statistics/user?from=${fromDate}&to=${toDate}`, {
      method: 'GET',
      headers: { ...headers, ...subkeyHeaders },
    })
    expect(getUserStats.status).toBe(200)
    const userStatsData = await getUserStats.json()
    expect(Array.isArray(userStatsData)).toBe(true)
  })

  it('should get bundle usage statistics with subkey', async () => {
    const subkeyHeaders = { 'x-limited-key-id': String(subkeyId) }
    const fromDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    const toDate = new Date().toISOString().split('T')[0]
    const getBundleUsage = await fetch(`${BASE_URL}/statistics/app/${APPNAME}/bundle_usage?from=${fromDate}&to=${toDate}`, {
      method: 'GET',
      headers: { ...headers, ...subkeyHeaders },
    })
    expect(getBundleUsage.status).toBe(200)
    const bundleUsageData = await getBundleUsage.json()
    expect(bundleUsageData).toHaveProperty('labels')
    expect(bundleUsageData).toHaveProperty('datasets')
  })

  it('should fail to get app statistics with subkey for app not belonging to user', async () => {
    const subkeyHeaders = { 'x-limited-key-id': String(subkeyId) }
    const fromDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    const toDate = new Date().toISOString().split('T')[0]
    const nonUserApp = 'com.nonuser.app'
    const getStats = await fetch(`${BASE_URL}/statistics/app/${nonUserApp}?from=${fromDate}&to=${toDate}`, {
      method: 'GET',
      headers: { ...headers, ...subkeyHeaders },
    })
    expect(getStats.status).toBe(401)
    const statsData = await getStats.json()
    expect(statsData).toHaveProperty('error', 'no_access_to_app')
  })

  it('should fail to get organization statistics with subkey for org not belonging to user', async () => {
    const subkeyHeaders = { 'x-limited-key-id': String(subkeyId) }
    const fromDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    const toDate = new Date().toISOString().split('T')[0]
    const nonUserOrg = 'non-user-org-id'
    const getOrgStats = await fetch(`${BASE_URL}/statistics/org/${nonUserOrg}?from=${fromDate}&to=${toDate}`, {
      method: 'GET',
      headers: { ...headers, ...subkeyHeaders },
    })
    expect(getOrgStats.status).toBe(401)
    const orgStatsData = await getOrgStats.json<{ error: string }>()
    expect(orgStatsData.error).toBe('no_access_to_organization')
  })

  it('should create subkey with non-accessible org and fail to get org statistics', async () => {
    // Create a subkey with limited rights to a non-accessible org
    const createSubkey = await fetch(`${BASE_URL}/apikey`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: 'Non-Accessible Org Subkey',
        mode: 'read',
        limited_to_orgs: ['22dbad8a-b885-4309-9b3b-a09f8460fb6d'],
      }),
    })
    expect(createSubkey.status).toBe(200)
    const subkeyData = await createSubkey.json() as { id: number }
    const nonAccessibleOrgSubkeyId = subkeyData.id

    const subkeyHeaders = { 'x-limited-key-id': String(nonAccessibleOrgSubkeyId) }
    const fromDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    const toDate = new Date().toISOString().split('T')[0]
    const getOrgStats = await fetch(`${BASE_URL}/statistics/org/22dbad8a-b885-4309-9b3b-a09f8460fb6d?from=${fromDate}&to=${toDate}`, {
      method: 'GET',
      headers: { ...headers, ...subkeyHeaders },
    })
    expect(getOrgStats.status).toBe(401)
    const orgStatsData = await getOrgStats.json<{ error: string }>()
    expect(orgStatsData.error).toBe('no_access_to_organization')

    // Clean up
    const deleteApikey = await fetch(`${BASE_URL}/apikey/${nonAccessibleOrgSubkeyId}`, {
      method: 'DELETE',
      headers,
    })
    expect(deleteApikey.status).toBe(200)
  })

  it('should create subkey with non-accessible app and fail to get app statistics', async () => {
    // Create a subkey with limited rights to a non-accessible app
    const createSubkey = await fetch(`${BASE_URL}/apikey`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: 'Non-Accessible App Subkey',
        mode: 'read',
        limited_to_apps: ['com.demoadmin.app'],
      }),
    })
    expect(createSubkey.status).toBe(200)
    const subkeyData = await createSubkey.json() as { id: number }
    const nonAccessibleAppSubkeyId = subkeyData.id

    const subkeyHeaders = { 'x-limited-key-id': String(nonAccessibleAppSubkeyId) }
    const fromDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    const toDate = new Date().toISOString().split('T')[0]
    const getStats = await fetch(`${BASE_URL}/statistics/app/com.demoadmin.app?from=${fromDate}&to=${toDate}`, {
      method: 'GET',
      headers: { ...headers, ...subkeyHeaders },
    })
    expect(getStats.status).toBe(401)
    const statsData = await getStats.json<{ error: string }>()
    expect(statsData.error).toBe('no_access_to_app')

    // Clean up
    const deleteApikey = await fetch(`${BASE_URL}/apikey/${nonAccessibleAppSubkeyId}`, {
      method: 'DELETE',
      headers,
    })
    expect(deleteApikey.status).toBe(200)
  })
})
