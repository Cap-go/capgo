import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
import { APP_NAME_STATS, BASE_URL, getAuthHeadersForCredentials, getSupabaseClient, headersStats, ORG_ID_STATS, USER_ID_STATS } from './test-utils.ts'

function hasSeededStats(statsData: unknown) {
  if (!Array.isArray(statsData))
    return false

  return statsData.some((stat: any) =>
    (stat.mau ?? 0) > 0
    || (stat.storage ?? 0) > 0
    || (stat.bandwidth ?? 0) > 0
    || (stat.get ?? 0) > 0,
  )
}

async function deleteApikeyById(id: number) {
  await getSupabaseClient()
    .from('apikeys')
    .delete()
    .eq('id', id)
    .throwOnError()
}

async function createStatsSiblingApp(appId: string) {
  await getSupabaseClient()
    .from('apps')
    .insert({
      app_id: appId,
      icon_url: '',
      name: 'Stats sibling oracle test app',
      last_version: '1.0.0',
      updated_at: new Date().toISOString(),
      owner_org: ORG_ID_STATS,
      user_id: USER_ID_STATS,
    })
    .throwOnError()
}

async function deleteAppByAppId(appId: string) {
  await getSupabaseClient()
    .from('apps')
    .delete()
    .eq('app_id', appId)
    .throwOnError()
}

describe('[GET] /statistics operations with and without subkey', () => {
  const APPNAME = APP_NAME_STATS // Use the seeded stats app
  let subkeyId = 0

  afterAll(async () => {
    if (subkeyId)
      await deleteApikeyById(subkeyId)
  })

  it('should get app statistics without subkey', async () => {
    const fromDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    const toDate = new Date().toISOString().split('T')[0]
    const getStats = await fetch(`${BASE_URL}/statistics/app/${APPNAME}?from=${fromDate}&to=${toDate}`, {
      method: 'GET',
      headers: headersStats,
    })
    expect(getStats.status).toBe(200)
    const statsData = await getStats.json()
    expect(Array.isArray(statsData)).toBe(true)
    expect(hasSeededStats(statsData)).toBe(true)
  })

  it('should get organization statistics without subkey', async () => {
    const fromDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    const toDate = new Date().toISOString().split('T')[0]
    const getOrgStats = await fetch(`${BASE_URL}/statistics/org/${ORG_ID_STATS}?from=${fromDate}&to=${toDate}`, {
      method: 'GET',
      headers: headersStats,
    })
    expect(getOrgStats.status).toBe(200)
    const orgStatsData = await getOrgStats.json()
    expect(Array.isArray(orgStatsData)).toBe(true)
    expect(hasSeededStats(orgStatsData)).toBe(true)
  })

  it('should get organization statistics breakdown without subkey', async () => {
    const fromDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    const toDate = new Date().toISOString().split('T')[0]
    const getOrgStats = await fetch(`${BASE_URL}/statistics/org/${ORG_ID_STATS}?from=${fromDate}&to=${toDate}&breakdown=true&noAccumulate=true`, {
      method: 'GET',
      headers: headersStats,
    })
    expect(getOrgStats.status).toBe(200)
    const orgStatsData = await getOrgStats.json() as { global: any[], byApp: any[] }
    expect(Array.isArray(orgStatsData.global)).toBe(true)
    expect(Array.isArray(orgStatsData.byApp)).toBe(true)
    expect(hasSeededStats(orgStatsData.global)).toBe(true)
    expect(orgStatsData.byApp.some(stat => stat.app_id === APPNAME)).toBe(true)
  })

  it('should get organization statistics breakdown with jwt', async () => {
    const authHeaders = await getAuthHeadersForCredentials('stats@capgo.app', 'testtest')
    const fromDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    const toDate = new Date().toISOString().split('T')[0]
    const getOrgStats = await fetch(`${BASE_URL}/statistics/org/${ORG_ID_STATS}?from=${fromDate}&to=${toDate}&breakdown=true&noAccumulate=true`, {
      method: 'GET',
      headers: authHeaders,
    })
    expect(getOrgStats.status).toBe(200)
    const orgStatsData = await getOrgStats.json() as { global: any[], byApp: any[] }
    expect(Array.isArray(orgStatsData.global)).toBe(true)
    expect(Array.isArray(orgStatsData.byApp)).toBe(true)
    expect(hasSeededStats(orgStatsData.global)).toBe(true)
    expect(orgStatsData.byApp.some(stat => stat.app_id === APPNAME)).toBe(true)
  })

  it('should get user statistics without subkey', async () => {
    const fromDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    const toDate = new Date().toISOString().split('T')[0]
    const getUserStats = await fetch(`${BASE_URL}/statistics/user?from=${fromDate}&to=${toDate}`, {
      method: 'GET',
      headers: headersStats,
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
      headers: headersStats,
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
      headers: headersStats,
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
      headers: { ...headersStats, ...subkeyHeaders },
    })
    expect(getStats.status).toBe(200)
    const statsData = await getStats.json()
    expect(Array.isArray(statsData)).toBe(true)
    expect(hasSeededStats(statsData)).toBe(true)
  })

  it.concurrent('should not reveal sibling app existence outside an app-limited subkey', async () => {
    const createSubkey = await fetch(`${BASE_URL}/apikey`, {
      method: 'POST',
      headers: headersStats,
      body: JSON.stringify({
        name: 'Limited Stats Subkey - oracle test',
        mode: 'read',
        limited_to_apps: [APPNAME],
      }),
    })
    expect(createSubkey.status).toBe(200)
    const localSubkey = await createSubkey.json() as { id: number }
    const siblingApp = `com.stats.oracle.${randomUUID().replaceAll('-', '')}`
    const fakeApp = `com.stats.fake.${randomUUID().replaceAll('-', '')}`

    try {
      await createStatsSiblingApp(siblingApp)
      const subkeyHeaders = { 'x-limited-key-id': String(localSubkey.id) }
      const fromDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      const toDate = new Date().toISOString().split('T')[0]
      const headers = { ...headersStats, ...subkeyHeaders }
      const [realSiblingStats, fakeStats] = await Promise.all([
        fetch(`${BASE_URL}/statistics/app/${siblingApp}?from=${fromDate}&to=${toDate}`, {
          method: 'GET',
          headers,
        }),
        fetch(`${BASE_URL}/statistics/app/${fakeApp}?from=${fromDate}&to=${toDate}`, {
          method: 'GET',
          headers,
        }),
      ])

      expect(realSiblingStats.status).toBe(401)
      expect(fakeStats.status).toBe(401)
      const realSiblingData = await realSiblingStats.json<{ error: string }>()
      const fakeData = await fakeStats.json<{ error: string }>()
      expect(realSiblingData.error).toBe('no_access_to_app')
      expect(fakeData.error).toBe('no_access_to_app')
    }
    finally {
      await deleteAppByAppId(siblingApp)
      await deleteApikeyById(localSubkey.id)
    }
  })

  it('should get organization statistics with subkey', async () => {
    const subkeyHeaders = { 'x-limited-key-id': String(subkeyId) }
    const fromDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    const toDate = new Date().toISOString().split('T')[0]
    const getOrgStats = await fetch(`${BASE_URL}/statistics/org/${ORG_ID_STATS}?from=${fromDate}&to=${toDate}`, {
      method: 'GET',
      headers: { ...headersStats, ...subkeyHeaders },
    })
    expect(getOrgStats.status).toBe(401)
  })

  it('should get user statistics with subkey', async () => {
    const subkeyHeaders = { 'x-limited-key-id': String(subkeyId) }
    const fromDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    const toDate = new Date().toISOString().split('T')[0]
    const getUserStats = await fetch(`${BASE_URL}/statistics/user?from=${fromDate}&to=${toDate}`, {
      method: 'GET',
      headers: { ...headersStats, ...subkeyHeaders },
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
      headers: { ...headersStats, ...subkeyHeaders },
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
      headers: { ...headersStats, ...subkeyHeaders },
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
      headers: { ...headersStats, ...subkeyHeaders },
    })
    expect(getOrgStats.status).toBe(401)
    const orgStatsData = await getOrgStats.json<{ error: string }>()
    expect(orgStatsData.error).toBe('no_access_to_organization')
  })

  it('should create subkey with non-accessible org and fail to get org statistics', async () => {
    // Create a subkey with limited rights to a non-accessible org
    const createSubkey = await fetch(`${BASE_URL}/apikey`, {
      method: 'POST',
      headers: headersStats,
      body: JSON.stringify({
        name: 'Non-Accessible Org Subkey',
        mode: 'read',
        limited_to_orgs: ['22dbad8a-b885-4309-9b3b-a09f8460fb6d'],
      }),
    })
    expect(createSubkey.status).toBe(200)
    const subkeyData = await createSubkey.json() as { id: number }
    const nonAccessibleOrgSubkeyId = subkeyData.id

    try {
      const subkeyHeaders = { 'x-limited-key-id': String(nonAccessibleOrgSubkeyId) }
      const fromDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      const toDate = new Date().toISOString().split('T')[0]
      const getOrgStats = await fetch(`${BASE_URL}/statistics/org/22dbad8a-b885-4309-9b3b-a09f8460fb6d?from=${fromDate}&to=${toDate}`, {
        method: 'GET',
        headers: { ...headersStats, ...subkeyHeaders },
      })
      expect(getOrgStats.status).toBe(401)
      const orgStatsData = await getOrgStats.json<{ error: string }>()
      expect(orgStatsData.error).toBe('no_access_to_organization')
    }
    finally {
      await deleteApikeyById(nonAccessibleOrgSubkeyId)
    }
  })

  it('should create subkey with non-accessible app and fail to get app statistics', async () => {
    // Create a subkey with limited rights to a non-accessible app
    const createSubkey = await fetch(`${BASE_URL}/apikey`, {
      method: 'POST',
      headers: headersStats,
      body: JSON.stringify({
        name: 'Non-Accessible App Subkey',
        mode: 'read',
        limited_to_apps: ['com.demoadmin.app'],
      }),
    })
    expect(createSubkey.status).toBe(200)
    const subkeyData = await createSubkey.json() as { id: number }
    const nonAccessibleAppSubkeyId = subkeyData.id

    try {
      const subkeyHeaders = { 'x-limited-key-id': String(nonAccessibleAppSubkeyId) }
      const fromDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      const toDate = new Date().toISOString().split('T')[0]
      const getStats = await fetch(`${BASE_URL}/statistics/app/com.demoadmin.app?from=${fromDate}&to=${toDate}`, {
        method: 'GET',
        headers: { ...headersStats, ...subkeyHeaders },
      })
      expect(getStats.status).toBe(401)
      const statsData = await getStats.json<{ error: string }>()
      expect(statsData.error).toBe('no_access_to_app')
    }
    finally {
      await deleteApikeyById(nonAccessibleAppSubkeyId)
    }
  })
})
