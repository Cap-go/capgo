import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { executeSQL } from './test-utils.ts'

describe('users.created_via_invite', () => {
  it.concurrent('defaults to false for normal inserts (self-signup semantics)', async () => {
    const userId = randomUUID()
    const email = `user-created-via-invite-default-${randomUUID()}@test.com`

    await executeSQL(
      'INSERT INTO public.users (id, email) VALUES ($1, $2)',
      [userId, email],
    )

    const rows = await executeSQL(
      'SELECT created_via_invite FROM public.users WHERE id = $1',
      [userId],
    )
    expect(rows[0]?.created_via_invite).toBe(false)
  })

  it.concurrent('can be explicitly set true for invite-created accounts', async () => {
    const userId = randomUUID()
    const email = `user-created-via-invite-true-${randomUUID()}@test.com`

    await executeSQL(
      'INSERT INTO public.users (id, email, created_via_invite) VALUES ($1, $2, $3)',
      [userId, email, true],
    )

    const rows = await executeSQL(
      'SELECT created_via_invite FROM public.users WHERE id = $1',
      [userId],
    )
    expect(rows[0]?.created_via_invite).toBe(true)
  })
})

