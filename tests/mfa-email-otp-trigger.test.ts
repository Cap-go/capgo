import { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { POSTGRES_URL } from './test-utils.ts'

describe('mfa email otp trigger wiring', () => {
  let pool: Pool

  beforeAll(() => {
    pool = new Pool({ connectionString: POSTGRES_URL })
  })

  afterAll(async () => {
    await pool.end()
  })

  it.concurrent('uses public.enforce_email_otp_for_mfa() for auth.mfa_factors', async () => {
    const { rows } = await pool.query<{ function_schema: string, function_name: string }>(`
      SELECT proc_ns.nspname AS function_schema,
             proc.proname AS function_name
      FROM pg_trigger trg
      JOIN pg_class tbl ON tbl.oid = trg.tgrelid
      JOIN pg_namespace tbl_ns ON tbl_ns.oid = tbl.relnamespace
      JOIN pg_proc proc ON proc.oid = trg.tgfoid
      JOIN pg_namespace proc_ns ON proc_ns.oid = proc.pronamespace
      WHERE trg.tgname = 'trg_enforce_email_otp_for_mfa'
        AND tbl_ns.nspname = 'auth'
        AND tbl.relname = 'mfa_factors'
        AND NOT trg.tgisinternal
      LIMIT 1
    `)

    expect(rows).toHaveLength(1)
    expect(rows[0]).toEqual({
      function_schema: 'public',
      function_name: 'enforce_email_otp_for_mfa',
    })
  })

  it.concurrent('does not leave a legacy auth.enforce_email_otp_for_mfa() function behind', async () => {
    const { rows } = await pool.query<{ exists: boolean }>(`
      SELECT EXISTS (
        SELECT 1
        FROM pg_proc proc
        JOIN pg_namespace ns ON ns.oid = proc.pronamespace
        WHERE ns.nspname = 'auth'
          AND proc.proname = 'enforce_email_otp_for_mfa'
          AND pg_get_function_identity_arguments(proc.oid) = ''
      ) AS exists
    `)

    expect(rows[0]?.exists).toBe(false)
  })
})
