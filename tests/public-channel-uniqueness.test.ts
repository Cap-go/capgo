import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
import { cleanupPostgresClient, executeSQL, ORG_ID, USER_ID } from './test-utils.ts'

interface ChannelStateRow {
  name: string
  public: boolean
}

async function createAppFixture(appId: string) {
  await executeSQL(
    `INSERT INTO public.apps (
      created_at,
      app_id,
      icon_url,
      name,
      last_version,
      updated_at,
      owner_org,
      user_id
    ) VALUES (
      NOW(),
      $1,
      '',
      $1,
      '1.0.0',
      NOW(),
      $2,
      $3
    )`,
    [appId, ORG_ID, USER_ID],
  )

  const [version] = await executeSQL(
    `INSERT INTO public.app_versions (
      created_at,
      app_id,
      name,
      r2_path,
      updated_at,
      deleted,
      external_url,
      checksum,
      storage_provider,
      owner_org,
      comment,
      link,
      user_id
    ) VALUES (
      NOW(),
      $1,
      '1.0.0',
      $2,
      NOW(),
      false,
      NULL,
      '',
      'r2',
      $3,
      NULL,
      NULL,
      $4
    )
    RETURNING id`,
    [appId, `orgs/${ORG_ID}/apps/${appId}/1.0.0.zip`, ORG_ID, USER_ID],
  )

  return Number(version.id)
}

async function insertChannel(
  appId: string,
  versionId: number,
  name: string,
  options: {
    public: boolean
    ios: boolean
    android: boolean
    electron: boolean
  },
) {
  await executeSQL(
    `INSERT INTO public.channels (
      created_at,
      name,
      app_id,
      version,
      updated_at,
      public,
      disable_auto_update_under_native,
      disable_auto_update,
      ios,
      android,
      electron,
      allow_device_self_set,
      allow_emulator,
      allow_device,
      allow_dev,
      allow_prod,
      created_by,
      owner_org
    ) VALUES (
      NOW(),
      $1,
      $2,
      $3,
      NOW(),
      $4,
      false,
      'none'::public.disable_update,
      $5,
      $6,
      $7,
      false,
      true,
      true,
      true,
      true,
      $8,
      $9
    )`,
    [name, appId, versionId, options.public, options.ios, options.android, options.electron, USER_ID, ORG_ID],
  )
}

async function getChannelStates(appId: string, channelNames: string[]) {
  const rows = await executeSQL(
    `SELECT name, public
     FROM public.channels
     WHERE app_id = $1
       AND name = ANY($2::text[])`,
    [appId, channelNames],
  ) as ChannelStateRow[]

  return new Map(rows.map(row => [row.name, row.public]))
}

afterAll(async () => {
  await cleanupPostgresClient()
})

describe('public channel uniqueness', () => {
  it('demotes overlapping public channels on insert while preserving other platforms', async () => {
    const appId = `com.public.channel.insert.${randomUUID()}`
    const versionId = await createAppFixture(appId)
    const iosPublic = `ios-public-${randomUUID().slice(0, 8)}`
    const androidPublic = `android-public-${randomUUID().slice(0, 8)}`
    const nextIosPublic = `ios-next-${randomUUID().slice(0, 8)}`

    await insertChannel(appId, versionId, iosPublic, {
      public: true,
      ios: true,
      android: false,
      electron: false,
    })
    await insertChannel(appId, versionId, androidPublic, {
      public: true,
      ios: false,
      android: true,
      electron: false,
    })
    await insertChannel(appId, versionId, nextIosPublic, {
      public: true,
      ios: true,
      android: false,
      electron: false,
    })

    const states = await getChannelStates(appId, [iosPublic, androidPublic, nextIosPublic])

    expect(states.get(iosPublic)).toBe(false)
    expect(states.get(androidPublic)).toBe(true)
    expect(states.get(nextIosPublic)).toBe(true)
  })

  it('demotes overlapping public channels on update while preserving other platforms', async () => {
    const appId = `com.public.channel.update.${randomUUID()}`
    const versionId = await createAppFixture(appId)
    const iosPublic = `ios-public-${randomUUID().slice(0, 8)}`
    const androidPublic = `android-public-${randomUUID().slice(0, 8)}`
    const privateCandidate = `ios-private-${randomUUID().slice(0, 8)}`

    await insertChannel(appId, versionId, iosPublic, {
      public: true,
      ios: true,
      android: false,
      electron: false,
    })
    await insertChannel(appId, versionId, androidPublic, {
      public: true,
      ios: false,
      android: true,
      electron: false,
    })
    await insertChannel(appId, versionId, privateCandidate, {
      public: false,
      ios: true,
      android: false,
      electron: false,
    })

    await executeSQL(
      `UPDATE public.channels
       SET public = true
       WHERE app_id = $1
         AND name = $2`,
      [appId, privateCandidate],
    )

    const states = await getChannelStates(appId, [iosPublic, androidPublic, privateCandidate])

    expect(states.get(iosPublic)).toBe(false)
    expect(states.get(androidPublic)).toBe(true)
    expect(states.get(privateCandidate)).toBe(true)
  })
})
