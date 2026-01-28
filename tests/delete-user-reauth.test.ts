import type { PoolClient } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  USER_EMAIL_DELETE_USER_FRESH,
  USER_ID_DELETE_USER_FRESH,
  USER_ID_DELETE_USER_STALE,
  getPostgresClient,
  getSupabaseClient,
} from './test-utils.ts'

async function withAuthClient<T>(userId: string, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const pool = await getPostgresClient()
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('SELECT set_config($1, $2, true)', [
      'request.jwt.claim.sub',
      userId,
    ])
    await client.query('SELECT set_config($1, $2, true)', [
      'request.jwt.claims',
      JSON.stringify({
        sub: userId,
        role: 'authenticated',
        aud: 'authenticated',
      }),
    ])
    const result = await fn(client)
    await client.query('COMMIT')
    return result
  }
  catch (error) {
    try {
      await client.query('ROLLBACK')
    }
    catch {
      // Ignore rollback errors to surface the original failure.
    }
    throw error
  }
  finally {
    client.release()
  }
}

async function deleteUserAs(userId: string) {
  return await withAuthClient(userId, client => client.query('SELECT public.delete_user()'))
}

beforeAll(async () => {
  const supabase = getSupabaseClient()
  const { error: cleanupError } = await supabase
    .from('to_delete_accounts')
    .delete()
    .in('account_id', [USER_ID_DELETE_USER_STALE, USER_ID_DELETE_USER_FRESH])
  if (cleanupError)
    throw cleanupError

  const pool = await getPostgresClient()
  const client = await pool.connect()
  try {
    await client.query(
      'UPDATE "auth"."users" SET "last_sign_in_at" = NOW() - interval \'10 minutes\' WHERE "id" = $1',
      [USER_ID_DELETE_USER_STALE],
    )
    await client.query(
      'UPDATE "auth"."users" SET "last_sign_in_at" = NOW() WHERE "id" = $1',
      [USER_ID_DELETE_USER_FRESH],
    )
  }
  finally {
    client.release()
  }
})

afterAll(async () => {
  const { error } = await getSupabaseClient()
    .from('to_delete_accounts')
    .delete()
    .in('account_id', [USER_ID_DELETE_USER_STALE, USER_ID_DELETE_USER_FRESH])
  if (error)
    throw error
})

describe('delete_user reauthentication guard', () => {
  it.concurrent('rejects deletion when reauthentication is stale', async () => {
    let caught: unknown
    try {
      await deleteUserAs(USER_ID_DELETE_USER_STALE)
    }
    catch (error) {
      caught = error
    }

    expect(caught).toBeTruthy()
    const message = (caught as { message?: string }).message ?? ''
    expect(message).toContain('reauth_required')

    const { data, error } = await getSupabaseClient()
      .from('to_delete_accounts')
      .select('account_id')
      .eq('account_id', USER_ID_DELETE_USER_STALE)
    expect(error).toBeNull()
    expect(data ?? []).toHaveLength(0)
  })

  it.concurrent('allows deletion when reauthentication is recent', async () => {
    await deleteUserAs(USER_ID_DELETE_USER_FRESH)

    const { data, error } = await getSupabaseClient()
      .from('to_delete_accounts')
      .select('account_id, removed_data')
      .eq('account_id', USER_ID_DELETE_USER_FRESH)
      .single()
    expect(error).toBeNull()
    expect(data?.account_id).toBe(USER_ID_DELETE_USER_FRESH)
    const removedData = data?.removed_data as { email?: string } | null
    expect(removedData?.email).toBe(USER_EMAIL_DELETE_USER_FRESH)
  })
})
