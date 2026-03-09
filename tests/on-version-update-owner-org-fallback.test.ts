import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'
import { API_SECRET, BASE_URL, executeSQL, ORG_ID } from './test-utils.ts'

const triggerHeaders = {
  'Content-Type': 'application/json',
  apisecret: API_SECRET,
}

describe('[POST] /triggers/on_version_update - owner_org fallback', () => {
  const appId = `com.test.deleted_owner_org.${randomUUID()}`
  const versionId = Date.now() + Math.floor(Math.random() * 1_000_000)

  afterEach(async () => {
    await Promise.all([
      executeSQL('DELETE FROM public.deleted_apps WHERE app_id = $1', [appId]),
      executeSQL('DELETE FROM public.app_versions_meta WHERE id = $1', [versionId]),
    ])
  })

  it('uses deleted_apps fallback when apps lookup is missing owner_org', async () => {
    await executeSQL(
      'INSERT INTO public.deleted_apps (app_id, owner_org) VALUES ($1, $2)',
      [appId, ORG_ID],
    )

    const response = await fetch(`${BASE_URL}/triggers/on_version_update`, {
      method: 'POST',
      headers: triggerHeaders,
      body: JSON.stringify({
        table: 'app_versions',
        type: 'UPDATE',
        record: {
          id: versionId,
          app_id: appId,
          owner_org: null,
          manifest: [],
        },
        old_record: {
          id: versionId,
          app_id: appId,
        },
      }),
    })
    expect(response.status).toBe(200)

    const meta = await executeSQL('SELECT owner_org FROM public.app_versions_meta WHERE id = $1', [versionId])
    expect(meta).toHaveLength(1)
    expect(meta[0]?.owner_org).toBe(ORG_ID)
  })
})
