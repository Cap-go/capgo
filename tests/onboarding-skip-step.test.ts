import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createDirectApiKeyWithBindings, executeSQL, fetchTestRequest, getEndpointUrl, getSupabaseClient, USER_ID } from './test-utils.ts'

const fixture = randomUUID()
const orgId = randomUUID()
const appId = `com.test.onboarding.skip.${fixture}`
const admin = getSupabaseClient()
const keys: Awaited<ReturnType<typeof createDirectApiKeyWithBindings>>[] = []
let writerKey: string
let readerKey: string

async function skip(key: string, step: string, reason: string | null = 'Set up by my AI agent') {
  return fetchTestRequest(getEndpointUrl('/private/onboarding_progress/skip_step'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': key },
    body: JSON.stringify({ appId, step, reason }),
  })
}

async function readSetup() {
  const { data, error } = await admin.from('apps').select('onboarding').eq('app_id', appId).single()
  expect(error).toBeNull()
  return (data!.onboarding as any).setup
}

beforeAll(async () => {
  expect((await admin.from('orgs').insert({ id: orgId, created_by: USER_ID, name: 'Onboarding skip test', management_email: 'onboarding-skip@example.com' })).error).toBeNull()
  expect((await admin.from('apps').insert({ app_id: appId, owner_org: orgId, name: 'Onboarding skip test', icon_url: '' })).error).toBeNull()
  // A channel exists although `init` never ran: the step was passed over.
  expect((await admin.from('apps').update({ onboarding: { setup: {
    todo_list_version: 4,
    ota_todo_list_version: '1',
    builder_todo_list_version: '1',
    paths: ['ota', 'builder'],
    source: 'manual',
    outcome: 'in_progress',
    steps: {
      ota: { login_cli_mcp: { status: 'pending' }, add_channel: { status: 'done' } },
      builder: {
        ios: {},
        android: { start_setup: { status: 'pending' }, prepare_keystore: { status: 'done' }, connect_google_play: { status: 'pending' }, successful_cloud_build: { status: 'pending' } },
      },
    },
  } } }).eq('app_id', appId)).error).toBeNull()
  const writer = await createDirectApiKeyWithBindings({ key: randomUUID(), name: 'Onboarding skip writer', orgId })
  keys.push(writer)
  writerKey = writer.key!
  const reader = await createDirectApiKeyWithBindings({ key: randomUUID(), name: 'Onboarding skip reader', orgId, appId, appRoleName: 'app_reader' })
  keys.push(reader)
  await executeSQL('DELETE FROM public.role_bindings WHERE principal_type = \'apikey\' AND principal_id = $1::uuid AND scope_type = \'org\'', [reader.rbac_id])
  readerKey = reader.key!
})

afterAll(async () => {
  for (const key of keys)
    await admin.from('apikeys').delete().eq('id', key.id)
  await admin.from('apps').delete().eq('app_id', appId)
  await admin.from('orgs').delete().eq('id', orgId)
})

describe('onboarding skip step', () => {
  it('rejects malformed step ids and missing or blank reasons', async () => {
    expect((await skip(writerKey, 'ota.login_cli_mcp; drop')).status).toBe(400)
    expect((await skip(writerKey, 'ota.login_cli_mcp', null)).status).toBe(400)
    expect((await skip(writerKey, 'ota.login_cli_mcp', '   ')).status).toBe(400)
    expect((await skip(writerKey, 'ota.login_cli_mcp', 'x'.repeat(501))).status).toBe(400)
  })

  it('refuses steps that were not passed over, including the final step', async () => {
    for (const step of ['ota.add_updater', 'ota.test_update', 'builder.android.connect_google_play', 'builder.android.successful_cloud_build']) {
      const response = await skip(writerKey, step)
      expect(response.status, step).toBe(409)
      expect(await response.json()).toMatchObject({ error: 'step_not_skippable' })
    }
  })

  it('does not let an app reader skip steps', async () => {
    const response = await skip(readerKey, 'ota.login_cli_mcp')
    expect(response.status).toBe(409)
    expect((await readSetup()).steps.ota.login_cli_mcp.status).toBe('pending')
  })

  it('records an explicit skip for passed-over live update and Builder steps', async () => {
    const ota = await skip(writerKey, 'ota.login_cli_mcp')
    expect(ota.status).toBe(200)
    expect((await ota.json() as any).onboarding.setup.steps.ota.login_cli_mcp.status).toBe('skipped')

    const builder = await skip(writerKey, 'builder.android.start_setup')
    expect(builder.status).toBe(200)
    const setup = await readSetup()
    expect(setup.steps.builder.android.start_setup.status).toBe('skipped')
    expect(setup.steps.ota.add_channel.status).toBe('done')
    expect(setup.outcome).toBe('in_progress')
  })
})
