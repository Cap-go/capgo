import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  BASE_URL,
  executeSQL,
  fetchWithRetry,
  getEndpointUrl,
  getSupabaseClient,
  headers,
} from './test-utils.ts'

const TUS_VERSION = '1.0.0'

function buildAttachmentPath(orgId: string, appId: string, filename: string) {
  const filePath = `orgs/${orgId}/apps/${appId}/${filename}`
  return {
    filePath,
    uploadMetadata: `filename ${btoa(filePath)}`,
  }
}

async function createUploadScopedKey(appId: string, name: string): Promise<{ id: number, key: string }> {
  const response = await fetchWithRetry(`${BASE_URL}/apikey`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      name,
      mode: 'upload',
      limited_to_apps: [appId],
    }),
  }, 5, 750)
  if (response.status !== 200) {
    throw new Error(`Failed to create upload-scoped key (${response.status}): ${await response.text()}`)
  }

  const created = await response.json() as { id: number, key: string | null }
  let key = created.key

  if (!key) {
    const { data, error } = await getSupabaseClient()
      .from('apikeys')
      .select('key')
      .eq('id', created.id)
      .single()

    expect(error).toBeNull()
    key = data?.key ?? null
  }

  expect(key).toBeTruthy()
  return {
    id: created.id,
    key: key!,
  }
}

async function cleanupSeededOrg(appId: string, orgId: string, stripeCustomerId: string, apikeyId?: number) {
  const supabase = getSupabaseClient()

  if (apikeyId != null) {
    await supabase.from('apikeys').delete().eq('id', apikeyId)
  }

  await executeSQL('SELECT public.reset_app_data($1)', [appId])
  await executeSQL('DELETE FROM public.deleted_apps WHERE app_id = $1', [appId])
  await supabase.from('org_users').delete().eq('org_id', orgId)
  await supabase.from('orgs').delete().eq('id', orgId)
  await supabase.from('stripe_info').delete().eq('customer_id', stripeCustomerId)
}

async function seedApp(appId: string, orgId: string, stripeCustomerId: string) {
  await executeSQL(
    'SELECT public.reset_and_seed_app_data($1, $2::uuid, NULL, NULL, $3, NULL)',
    [appId, orgId, stripeCustomerId],
  )
}

describe('attachment upload plan gating regression', () => {
  const scopeId = randomUUID().replaceAll('-', '')
  const orgId = randomUUID()
  const stripeCustomerId = `cus_files_plan_${scopeId}`
  const appId = `com.files.plan.${scopeId}`
  let uploadKeyId: number | undefined
  let uploadKey: string | undefined

  beforeAll(async () => {
    await seedApp(appId, orgId, stripeCustomerId)

    const createdKey = await createUploadScopedKey(appId, `upload-only-${appId}`)
    uploadKeyId = createdKey.id
    uploadKey = createdKey.key

    await executeSQL(
      'UPDATE public.stripe_info SET status = $1, is_good_plan = $2, trial_at = $3 WHERE customer_id = $4',
      ['canceled', false, '1970-01-01T00:00:00+00:00', stripeCustomerId],
    )
    await executeSQL('UPDATE public.orgs SET has_usage_credits = false WHERE id = $1', [orgId])
  }, 60_000)

  afterAll(async () => {
    await cleanupSeededOrg(appId, orgId, stripeCustomerId, uploadKeyId)
  }, 60_000)

  it('blocks attachment uploads for plan-blocked apps even with upload-scoped API keys', async () => {
    const { uploadMetadata } = buildAttachmentPath(orgId, appId, 'plan-blocked.txt')

    const response = await fetch(getEndpointUrl('/files/upload/attachments'), {
      method: 'POST',
      headers: {
        'Authorization': uploadKey!,
        'Content-Type': 'application/offset+octet-stream',
        'Tus-Resumable': TUS_VERSION,
        'Upload-Length': '4',
        'Upload-Metadata': uploadMetadata,
      },
    })

    expect(response.status).toBe(429)
    const data = await response.json() as { error?: string }
    expect(data.error).toBe('on_premise_app')
  })
})

describe('attachment cleanup on app deletion regression', () => {
  const scopeId = randomUUID().replaceAll('-', '')
  const orgId = randomUUID()
  const stripeCustomerId = `cus_files_delete_${scopeId}`
  const appId = `com.files.delete.${scopeId}`
  let uploadKeyId: number | undefined
  let uploadKey: string | undefined

  beforeAll(async () => {
    await seedApp(appId, orgId, stripeCustomerId)
    const createdKey = await createUploadScopedKey(appId, `upload-cleanup-${appId}`)
    uploadKeyId = createdKey.id
    uploadKey = createdKey.key
  }, 60_000)

  afterAll(async () => {
    await cleanupSeededOrg(appId, orgId, stripeCustomerId, uploadKeyId)
  }, 60_000)

  it('returns not_found for uploaded attachments after the app is deleted', async () => {
    const body = new TextEncoder().encode('delete-me-after-app-delete')
    const { filePath, uploadMetadata } = buildAttachmentPath(orgId, appId, 'orphan-check.txt')

    const createResponse = await fetch(getEndpointUrl('/files/upload/attachments'), {
      method: 'POST',
      headers: {
        'Authorization': uploadKey!,
        'Content-Type': 'application/offset+octet-stream',
        'Tus-Resumable': TUS_VERSION,
        'Upload-Length': body.byteLength.toString(),
        'Upload-Metadata': uploadMetadata,
      },
    })
    expect(createResponse.status).toBe(201)

    const uploadUrl = createResponse.headers.get('Location')
    expect(uploadUrl).toBeTruthy()

    const patchResponse = await fetch(uploadUrl!, {
      method: 'PATCH',
      headers: {
        'Authorization': uploadKey!,
        'Content-Type': 'application/offset+octet-stream',
        'Tus-Resumable': TUS_VERSION,
        'Upload-Offset': '0',
      },
      body,
    })
    expect(patchResponse.status).toBe(204)

    const readBeforeDelete = await fetch(getEndpointUrl(`/files/read/attachments/${filePath}`))
    expect(readBeforeDelete.status).toBe(200)
    expect(await readBeforeDelete.text()).toBe('delete-me-after-app-delete')

    const deleteResponse = await fetchWithRetry(`${BASE_URL}/app/${appId}`, {
      method: 'DELETE',
      headers,
    })
    expect(deleteResponse.status).toBe(200)

    const readAfterDelete = await fetch(getEndpointUrl(`/files/read/attachments/${filePath}`))
    expect(readAfterDelete.status).toBe(404)
  })
})
