import { beforeAll, describe, expect, it } from 'vitest'
import { getAuthHeadersForCredentials, getEndpointUrl, ORG_ID_2, USER_ADMIN_EMAIL, USER_ID, USER_ID_2, USER_ID_STATS } from './test-utils.ts'

let adminHeaders: Record<string, string>

function getJwtSub(jwt: string): string {
  const payload = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8')) as { sub?: string }
  return payload.sub ?? ''
}

async function callLogAs(body: Record<string, string>) {
  const response = await fetch(getEndpointUrl('/private/log_as'), {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify(body),
  })

  const data = await response.json() as { jwt?: string, refreshToken?: string, error?: string }

  expect(response.status).toBe(200)
  expect(data.error).toBeUndefined()
  expect(data.jwt).toBeTruthy()
  expect(data.refreshToken).toBeTruthy()

  return data.jwt!
}

describe('[POST] /private/log_as', () => {
  beforeAll(async () => {
    adminHeaders = await getAuthHeadersForCredentials(USER_ADMIN_EMAIL, 'adminadmin')
  })

  it('keeps user_id impersonation compatibility', async () => {
    const jwt = await callLogAs({ user_id: USER_ID })

    expect(getJwtSub(jwt)).toBe(USER_ID)
  })

  it('impersonates a user by auth email', async () => {
    const jwt = await callLogAs({ identifier: 'stats@capgo.app' })

    expect(getJwtSub(jwt)).toBe(USER_ID_STATS)
  })

  it('impersonates an organization owner by org id', async () => {
    const jwt = await callLogAs({ org_id: ORG_ID_2 })

    expect(getJwtSub(jwt)).toBe(USER_ID_2)
  })

  it('treats an unresolved UUID identifier as an organization id', async () => {
    const jwt = await callLogAs({ identifier: ORG_ID_2 })

    expect(getJwtSub(jwt)).toBe(USER_ID_2)
  })
})
