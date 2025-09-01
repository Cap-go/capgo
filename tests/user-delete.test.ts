import { afterAll, describe, expect, it } from 'vitest'
import { BASE_URL, USER_EMAIL, USER_ID, cleanup, headersInternal } from './test-utils.ts'

describe('[POST] /triggers/on_user_soft_delete', () => {
  it('accepts request and returns 200', async () => {
    const res = await fetch(`${BASE_URL}/triggers/on_user_soft_delete`, {
      method: 'POST',
      headers: headersInternal,
      body: JSON.stringify({ user_id: USER_ID, email: USER_EMAIL }),
    })
    expect(res.status).toBe(200)
  })
})

afterAll(async () => {
  await cleanup()
})

