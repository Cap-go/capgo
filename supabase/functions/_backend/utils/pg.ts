// import { neon as postgres } from '@neondatabase/serverless'
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import { getRuntimeKey } from 'hono/adapter'
// import { drizzle } from 'drizzle-orm/neon-http';
import postgres from 'postgres'
import type { Context } from '@hono/hono'
import { existInEnv, getEnv } from './utils.ts'

export function getBestDatabaseURL(c: Context): string {
  // TODO: use it when we deployed replicate of database
  // Use replicate i
  const clientContinent = (c.req.raw as any)?.cf?.continent
  console.log('clientContinent', clientContinent)
  let DEFAULT_DB_URL = getEnv(c, 'SUPABASE_DB_URL')
  if (existInEnv(c, 'CUSTOM_SUPABASE_DB_URL'))
    DEFAULT_DB_URL = getEnv(c, 'CUSTOM_SUPABASE_DB_URL')

  if (!clientContinent)
    return DEFAULT_DB_URL

  // European countries or Africa or Antarctica
  if ((clientContinent === 'EU' || clientContinent === 'AF' || clientContinent === 'AN')) {
    return DEFAULT_DB_URL
  }

  // Asian and Oceanian countries
  if ((clientContinent === 'AS' || clientContinent === 'OC') && existInEnv(c, 'SG_SUPABASE_DB_URL')) {
    return getEnv(c, 'SG_SUPABASE_DB_URL')
  }

  // North and South American countries
  if ((clientContinent === 'NA' || clientContinent === 'SA') && existInEnv(c, 'GK_SUPABASE_DB_URL')) {
    return getEnv(c, 'GK_SUPABASE_DB_URL')
  }

  // Default to Germany for any other cases
  return DEFAULT_DB_URL
}

export function getPgClient(c: Context) {
  const dbUrl = getBestDatabaseURL(c)
  console.log('SUPABASE_DB_URL', dbUrl)
  return postgres(dbUrl, { prepare: false, idle_timeout: 2 })
}

export function getDrizzleClient(client: ReturnType<typeof getPgClient>) {
  return drizzle(client as any)
}

export function closeClient(c: Context, client: ReturnType<typeof getPgClient>) {
  // c.executionCtx.waitUntil(Promise.resolve())
  // console.log('Closing client', client)
  if (getRuntimeKey() === 'workerd')
    c.executionCtx.waitUntil(client.end())
  else
    client.end()
}

export async function isAllowedActionOrg(drizzleCient: ReturnType<typeof getDrizzleClient>, orgId: string): Promise<boolean> {
  try {
    // Assuming you have a way to get your database connection string

    const result = await drizzleCient.execute<{ is_allowed: boolean }>(
      sql`SELECT is_allowed_action_org(${orgId}) AS is_allowed`,
    )

    return result[0]?.is_allowed || false
  }
  catch (error) {
    console.error('isAllowedActionOrg error', orgId, error)
  }
  return false
}
