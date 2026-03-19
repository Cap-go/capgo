import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  APIKEY_TEST2_ALL,
  APIKEY_TEST_ALL,
  getAuthHeaders,
  getAuthHeadersForCredentials,
  getSupabaseClient,
  headers,
  ORG_ID_2,
  resetAndSeedAppData,
  resetAppData,
  STRIPE_INFO_CUSTOMER_ID_2,
  USER_EMAIL_NONMEMBER,
  USER_ID_2,
  USER_PASSWORD,
  USER_PASSWORD_NONMEMBER,
} from './test-utils.ts'

const id = randomUUID()
const APP_OWN = `com.demo.manifest-own.${id}`
const APP_OTHER = `com.demo.manifest-other.${id}`
const OTHER_USER_EMAIL = 'test2@capgo.app'

let authHeadersUser1: Record<string, string>
let authHeadersUser2: Record<string, string>
let authHeadersNonMember: Record<string, string>
let ownVersionId: number
let otherVersionId: number

function getRestManifestUrl(appVersionId: number): string {
  const supabaseUrl = process.env.SUPABASE_URL
  if (!supabaseUrl)
    throw new Error('SUPABASE_URL is missing')

  const url = new URL('/rest/v1/manifest', supabaseUrl)
  url.searchParams.set('select', 'id,file_name,file_hash,s3_path,app_version_id')
  url.searchParams.set('app_version_id', `eq.${appVersionId}`)
  return url.toString()
}

async function fetchManifestRows(headers: Record<string, string>, appVersionId: number) {
  const anonKey = process.env.SUPABASE_ANON_KEY
  if (!anonKey)
    throw new Error('SUPABASE_ANON_KEY is missing')

  const response = await fetch(getRestManifestUrl(appVersionId), {
    method: 'GET',
    headers: {
      ...headers,
      apikey: anonKey,
    },
  })

  const data = await response.json() as Array<{
    id: number
    file_name: string
    file_hash: string
    s3_path: string
    app_version_id: number
  }>

  return { response, data }
}

beforeAll(async () => {
  await Promise.all([
    resetAndSeedAppData(APP_OWN),
    resetAndSeedAppData(APP_OTHER, {
      orgId: ORG_ID_2,
      userId: USER_ID_2,
      stripeCustomerId: STRIPE_INFO_CUSTOMER_ID_2,
    }),
  ])

  authHeadersUser1 = await getAuthHeaders()
  authHeadersUser2 = await getAuthHeadersForCredentials(OTHER_USER_EMAIL, USER_PASSWORD)
  authHeadersNonMember = await getAuthHeadersForCredentials(USER_EMAIL_NONMEMBER, USER_PASSWORD_NONMEMBER)

  const supabase = getSupabaseClient()
  const { data: ownVersion, error: ownVersionError } = await supabase
    .from('app_versions')
    .select('id')
    .eq('app_id', APP_OWN)
    .eq('name', '1.0.0')
    .single()

  if (ownVersionError || !ownVersion)
    throw ownVersionError ?? new Error('Missing own app version')

  ownVersionId = ownVersion.id

  const { data: otherVersion, error: otherVersionError } = await supabase
    .from('app_versions')
    .select('id')
    .eq('app_id', APP_OTHER)
    .eq('name', '1.0.0')
    .single()

  if (otherVersionError || !otherVersion)
    throw otherVersionError ?? new Error('Missing foreign app version')

  otherVersionId = otherVersion.id

  await supabase.from('manifest').insert([
    {
      app_version_id: ownVersionId,
      file_name: 'own-entry.js',
      s3_path: '/own-entry.js',
      file_hash: 'own-hash',
      file_size: 101,
    },
    {
      app_version_id: otherVersionId,
      file_name: 'other-entry.js',
      s3_path: '/other-entry.js',
      file_hash: 'other-hash',
      file_size: 102,
    },
  ]).throwOnError()
})

afterAll(async () => {
  await Promise.all([
    resetAppData(APP_OWN),
    resetAppData(APP_OTHER),
  ])
})

describe('manifest RLS', () => {
  it.concurrent('allows an authenticated user to read manifest entries for their own org', async () => {
    const { response, data } = await fetchManifestRows(authHeadersUser1, ownVersionId)

    expect(response.status).toBe(200)
    expect(data).toHaveLength(1)
    expect(data[0]?.file_name).toBe('own-entry.js')
  })

  it.concurrent('prevents an authenticated user from reading manifest entries for another org', async () => {
    const { response, data } = await fetchManifestRows(authHeadersNonMember, otherVersionId)

    expect(response.status).toBe(200)
    expect(data).toHaveLength(0)
  })

  it.concurrent('still allows the other org owner to read their own manifest entries', async () => {
    const { response, data } = await fetchManifestRows(authHeadersUser2, otherVersionId)

    expect(response.status).toBe(200)
    expect(data).toHaveLength(1)
    expect(data[0]?.file_name).toBe('other-entry.js')
  })

  it.concurrent('allows an API key for the owning org to read manifest entries', async () => {
    const { response, data } = await fetchManifestRows({
      ...headers,
      capgkey: APIKEY_TEST_ALL,
    }, ownVersionId)

    expect(response.status).toBe(200)
    expect(data).toHaveLength(1)
    expect(data[0]?.file_name).toBe('own-entry.js')
  })

  it.concurrent('prevents an API key from reading another org\'s manifest entries', async () => {
    const { response, data } = await fetchManifestRows({
      ...headers,
      capgkey: APIKEY_TEST2_ALL,
    }, ownVersionId)

    expect(response.status).toBe(200)
    expect(data).toHaveLength(0)
  })
})
