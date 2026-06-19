import { describe, expect, it } from 'vitest'

import {
  ensureProdDatabaseSslMode,
  getPgPoolSslOptions,
  isHostedSupabaseDatabaseUrl,
  isLocalDatabaseUrl,
  shouldEnforceProdDatabaseSsl,
} from '../supabase/functions/_backend/utils/pg.ts'

describe('prod database ssl helpers', () => {
  const prodDirectUrl = 'postgresql://postgres:secret@db.xvwzpoazmxkqosrdewyv.supabase.co:5432/postgres'
  const prodPoolerUrl = 'postgresql://postgres.xvwzpoazmxkqosrdewyv:secret@aws-0-eu-central-1.pooler.supabase.com:6543/postgres'
  const localUrl = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

  it.concurrent('detects hosted Supabase URLs', () => {
    expect(isHostedSupabaseDatabaseUrl(prodDirectUrl)).toBe(true)
    expect(isHostedSupabaseDatabaseUrl(prodPoolerUrl)).toBe(true)
    expect(isHostedSupabaseDatabaseUrl(localUrl)).toBe(false)
  })

  it.concurrent('detects local database URLs', () => {
    expect(isLocalDatabaseUrl(localUrl)).toBe(true)
    expect(isLocalDatabaseUrl('postgresql://postgres:postgres@localhost:5432/postgres')).toBe(true)
    expect(isLocalDatabaseUrl('postgresql://postgres:postgres@supabase_db_capgo:5432/postgres')).toBe(true)
    expect(isLocalDatabaseUrl(prodDirectUrl)).toBe(false)
  })

  it.concurrent('enforces SSL only for direct hosted Supabase connections', () => {
    expect(shouldEnforceProdDatabaseSsl(prodDirectUrl, 'direct')).toBe(true)
    expect(shouldEnforceProdDatabaseSsl(prodPoolerUrl, 'sb_pooler_main')).toBe(true)
    expect(shouldEnforceProdDatabaseSsl(localUrl, 'direct')).toBe(false)
    expect(shouldEnforceProdDatabaseSsl(prodDirectUrl, 'HYPERDRIVE_CAPGO_DIRECT_EU')).toBe(false)
  })

  it.concurrent('upgrades insecure prod connection strings to sslmode=require', () => {
    expect(ensureProdDatabaseSslMode(`${prodDirectUrl}?sslmode=disable`)).toBe(`${prodDirectUrl}?sslmode=require`)
    expect(ensureProdDatabaseSslMode(`${prodDirectUrl}?ssl=false`)).toBe(`${prodDirectUrl}?sslmode=require`)
    expect(ensureProdDatabaseSslMode(prodDirectUrl)).toBe(`${prodDirectUrl}?sslmode=require`)
    expect(ensureProdDatabaseSslMode(`${prodDirectUrl}?sslmode=verify-full`)).toBe(`${prodDirectUrl}?sslmode=verify-full`)
    expect(ensureProdDatabaseSslMode(localUrl)).toBe(localUrl)
  })

  it.concurrent('enables TLS for prod poolers while allowing managed pooler certificates', () => {
    const ctx = { env: {} } as any
    expect(getPgPoolSslOptions(ctx, prodPoolerUrl, 'sb_pooler_main')).toEqual({ rejectUnauthorized: false })
    expect(getPgPoolSslOptions(ctx, prodDirectUrl, 'direct')).toEqual({ rejectUnauthorized: true })
    expect(getPgPoolSslOptions(ctx, localUrl, 'direct')).toBe(false)
    expect(getPgPoolSslOptions(ctx, prodDirectUrl, 'HYPERDRIVE_CAPGO_DIRECT_EU')).toBe(false)
  })
})
