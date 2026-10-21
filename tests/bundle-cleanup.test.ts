import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { BASE_URL, createAppVersions, getSupabaseClient, headers, resetAndSeedAppData, resetAppData } from './test-utils.ts'

const APPNAME = `com.app.cleanup.${randomUUID()}`
// Scope every request to 5.x so the seeded bundles of the app are never touched.
const RANGE = '5.0.0'

interface CleanupResponse {
  total: number
  kept: { id: number, name: string, linked: boolean }[]
  removed: { id: number, name: string, linked: boolean }[]
  dry_run: boolean
}

function postCleanup(body: Record<string, unknown>) {
  return fetch(`${BASE_URL}/bundle/cleanup`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ app_id: APPNAME, bundle: RANGE, ...body }),
  })
}

async function deletedNames() {
  const { data, error } = await getSupabaseClient()
    .from('app_versions')
    .select('name')
    .eq('app_id', APPNAME)
    .eq('deleted', true)
    .like('name', '5.%')
  expect(error).toBeNull()
  return (data ?? []).map(row => row.name).sort()
}

beforeAll(async () => {
  await resetAndSeedAppData(APPNAME)
  for (const name of ['5.0.1', '5.0.2', '5.0.3', '5.0.4'])
    await createAppVersions(name, APPNAME)
})

afterAll(async () => {
  await resetAppData(APPNAME)
})

describe('[POST] /bundle/cleanup', () => {
  it('rejects an invalid bundle range', async () => {
    const response = await postCleanup({ bundle: 'not-semver', keep: 1 })
    expect(response.status).toBe(400)
    expect((await response.json() as { error: string }).error).toBe('invalid_bundle')
  })

  it('previews with dry_run without deleting anything', async () => {
    const response = await postCleanup({ keep: 2, dry_run: true })
    expect(response.status).toBe(200)
    const data = await response.json() as CleanupResponse
    expect(data.dry_run).toBe(true)
    expect(data.total).toBe(4)
    expect(data.kept.map(row => row.name)).toEqual(['5.0.4', '5.0.3'])
    expect(data.removed.map(row => row.name)).toEqual(['5.0.2', '5.0.1'])
    expect(await deletedNames()).toEqual([])
  })

  it('soft-deletes the selected bundles in one request', async () => {
    const response = await postCleanup({ keep: 2 })
    expect(response.status).toBe(200)
    const data = await response.json() as CleanupResponse
    expect(data.dry_run).toBe(false)
    expect(data.removed.map(row => row.name)).toEqual(['5.0.2', '5.0.1'])
    expect(await deletedNames()).toEqual(['5.0.1', '5.0.2'])

    const again = await postCleanup({ keep: 2 })
    const againData = await again.json() as CleanupResponse
    expect(againData.total).toBe(2)
    expect(againData.removed).toEqual([])
  })
})
