import type { PoolClient } from 'pg'
import { randomUUID } from 'node:crypto'
import { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ORG_ID, POSTGRES_URL, USER_ID } from './test-utils.ts'

async function rollbackAndRelease(client: PoolClient) {
  try {
    await client.query('ROLLBACK')
  }
  finally {
    client.release()
  }
}

describe('onboarding completion after first upload', () => {
  let pool: Pool

  beforeAll(() => {
    pool = new Pool({
      connectionString: POSTGRES_URL,
      max: 3,
      idleTimeoutMillis: 2000,
    })
  })

  afterAll(async () => {
    await pool.end()
  })

  it.concurrent('waits for an r2-direct upload to finish before completing onboarding', async () => {
    const client = await pool.connect()
    const appId = `com.onboarding.first.${randomUUID().slice(0, 8)}`
    const staleVersionName = `0.9.0-${randomUUID().slice(0, 8)}`

    try {
      await client.query('BEGIN')
      await client.query(
        `
        INSERT INTO public.apps (app_id, name, icon_url, owner_org, need_onboarding)
        VALUES ($1, $2, '', $3, true)
        `,
        [appId, `Onboarding First Upload ${appId}`, ORG_ID],
      )

      await client.query(
        `
        INSERT INTO public.app_versions (app_id, name, owner_org, user_id, storage_provider)
        VALUES ($1, $2, $3, $4, 'r2')
        `,
        [appId, staleVersionName, ORG_ID, USER_ID],
      )

      const inserted = await client.query<{ id: string }>(
        `
        INSERT INTO public.app_versions (app_id, name, owner_org, user_id, storage_provider)
        VALUES ($1, '1.0.0', $2, $3, 'r2-direct')
        RETURNING id
        `,
        [appId, ORG_ID, USER_ID],
      )
      const versionId = inserted.rows[0].id

      await client.query(
        `
        UPDATE public.app_versions
        SET r2_path = $2
        WHERE id = $1
        `,
        [versionId, `orgs/${ORG_ID}/apps/${appId}/1.0.0.zip`],
      )

      const draftApp = await client.query<{ need_onboarding: boolean }>(
        `
        SELECT need_onboarding
        FROM public.apps
        WHERE app_id = $1
        `,
        [appId],
      )
      expect(draftApp.rows[0].need_onboarding).toBe(true)

      await client.query(
        `
        UPDATE public.app_versions
        SET storage_provider = 'r2'
        WHERE id = $1
        `,
        [versionId],
      )

      const completedApp = await client.query<{ last_version: string, need_onboarding: boolean }>(
        `
        SELECT need_onboarding, last_version
        FROM public.apps
        WHERE app_id = $1
        `,
        [appId],
      )
      expect(completedApp.rows[0]).toEqual({
        need_onboarding: false,
        last_version: '1.0.0',
      })

      const versions = await client.query<{ name: string }>(
        `
        SELECT name
        FROM public.app_versions
        WHERE app_id = $1
        ORDER BY name
        `,
        [appId],
      )
      expect(versions.rows.map(row => row.name)).toEqual(['1.0.0', 'builtin', 'unknown'])
    }
    finally {
      await rollbackAndRelease(client)
    }
  })

  it.concurrent('completes onboarding immediately for an external bundle upload', async () => {
    const client = await pool.connect()
    const appId = `com.onboarding.external.${randomUUID().slice(0, 8)}`

    try {
      await client.query('BEGIN')
      await client.query(
        `
        INSERT INTO public.apps (app_id, name, icon_url, owner_org, need_onboarding)
        VALUES ($1, $2, '', $3, true)
        `,
        [appId, `Onboarding External Upload ${appId}`, ORG_ID],
      )

      await client.query(
        `
        INSERT INTO public.app_versions (
          app_id,
          name,
          owner_org,
          user_id,
          storage_provider,
          external_url,
          checksum
        )
        VALUES ($1, '1.0.0', $2, $3, 'external', 'https://example.com/bundle.zip', $4)
        `,
        [appId, ORG_ID, USER_ID, randomUUID().replaceAll('-', '')],
      )

      const completedApp = await client.query<{ last_version: string, need_onboarding: boolean }>(
        `
        SELECT need_onboarding, last_version
        FROM public.apps
        WHERE app_id = $1
        `,
        [appId],
      )
      expect(completedApp.rows[0]).toEqual({
        need_onboarding: false,
        last_version: '1.0.0',
      })

      const preservedVersion = await client.query<{ external_url: string }>(
        `
        SELECT external_url
        FROM public.app_versions
        WHERE app_id = $1
          AND name = '1.0.0'
        `,
        [appId],
      )
      expect(preservedVersion.rows).toEqual([{ external_url: 'https://example.com/bundle.zip' }])
    }
    finally {
      await rollbackAndRelease(client)
    }
  })
})
