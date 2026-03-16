import type { PoolClient } from 'pg'
import type { Database } from '../src/types/supabase.types'
import { env } from 'node:process'
import { createClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  getPostgresClient,
  getSupabaseClient,
  USER_EMAIL_DELETE_USER_FRESH,
  USER_ID_DELETE_USER_FRESH,
  USER_ID_DELETE_USER_STALE,
} from './test-utils.ts'

const USER_EMAIL_DELETE_USER_UNVERIFIED = 'delete-user-unverified@capgo.app'
const USER_PASSWORD_DELETE_USER_UNVERIFIED = 'testtest'
let userIdDeleteUserUnverified = ''

function createAnonSupabaseClient() {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY)
    throw new Error('SUPABASE_URL or SUPABASE_ANON_KEY is missing for delete-user SDK test')

  return createClient<Database>(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
    },
  })
}

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
    await client.query('DELETE FROM "public"."users" WHERE "email" = $1', [USER_EMAIL_DELETE_USER_UNVERIFIED])
    await client.query('DELETE FROM "auth"."users" WHERE "email" = $1', [USER_EMAIL_DELETE_USER_UNVERIFIED])

    const { data: createdUserData, error: createUserError } = await supabase.auth.admin.createUser({
      email: USER_EMAIL_DELETE_USER_UNVERIFIED,
      password: USER_PASSWORD_DELETE_USER_UNVERIFIED,
      email_confirm: false,
      user_metadata: {
        test_identifier: 'test_delete_user_unverified',
      },
    })
    if (createUserError || !createdUserData.user?.id)
      throw createUserError ?? new Error('Failed to create unverified delete-user test account')

    userIdDeleteUserUnverified = createdUserData.user.id

    await client.query(
      `
        INSERT INTO "public"."users" (
          "id",
          "email",
          "first_name",
          "last_name",
          "country",
          "created_at",
          "updated_at",
          "image_url",
          "enable_notifications",
          "opt_for_newsletters"
        ) VALUES (
          $1,
          $2,
          'delete',
          'unverified',
          NULL,
          NOW(),
          NOW(),
          '',
          true,
          true
        )
        ON CONFLICT ("id") DO UPDATE
        SET
          "email" = EXCLUDED."email",
          "updated_at" = NOW()
      `,
      [userIdDeleteUserUnverified, USER_EMAIL_DELETE_USER_UNVERIFIED],
    )
    await client.query(
      'UPDATE "auth"."users" SET "last_sign_in_at" = NOW(), "email_confirmed_at" = NULL WHERE "id" = $1',
      [userIdDeleteUserUnverified],
    )
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
  const accountIds = [USER_ID_DELETE_USER_STALE, USER_ID_DELETE_USER_FRESH]
  if (userIdDeleteUserUnverified)
    accountIds.push(userIdDeleteUserUnverified)

  const { error } = await getSupabaseClient()
    .from('to_delete_accounts')
    .delete()
    .in('account_id', accountIds)
  if (error)
    throw error

  const pool = await getPostgresClient()
  const client = await pool.connect()
  try {
    if (userIdDeleteUserUnverified) {
      await client.query('DELETE FROM "public"."users" WHERE "id" = $1', [userIdDeleteUserUnverified])
      await client.query('DELETE FROM "auth"."users" WHERE "id" = $1', [userIdDeleteUserUnverified])
    }
  }
  finally {
    client.release()
  }
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

  it.concurrent('rejects deletion when email is not verified', async () => {
    let caught: unknown
    try {
      await deleteUserAs(userIdDeleteUserUnverified)
    }
    catch (error) {
      caught = error
    }

    expect(caught).toBeTruthy()
    const message = (caught as { message?: string }).message ?? ''
    expect(message).toContain('email_not_verified')

    const { data, error } = await getSupabaseClient()
      .from('to_delete_accounts')
      .select('account_id')
      .eq('account_id', userIdDeleteUserUnverified)
    expect(error).toBeNull()
    expect(data ?? []).toHaveLength(0)
  })

  it.concurrent('does not allow an unverified user to obtain a Supabase SDK session', async () => {
    const client = createAnonSupabaseClient()

    const { data: signInData, error: signInError } = await client.auth.signInWithPassword({
      email: USER_EMAIL_DELETE_USER_UNVERIFIED,
      password: USER_PASSWORD_DELETE_USER_UNVERIFIED,
    })
    expect(signInData.session).toBeNull()
    expect(signInError).toBeTruthy()
    expect(signInError?.message ?? '').toContain('Email not confirmed')

    const { data, error } = await getSupabaseClient()
      .from('to_delete_accounts')
      .select('account_id')
      .eq('account_id', userIdDeleteUserUnverified)
    expect(error).toBeNull()
    expect(data ?? []).toHaveLength(0)
  })
})
