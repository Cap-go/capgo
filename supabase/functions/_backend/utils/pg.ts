// import { neon as postgres } from '@neondatabase/serverless'
// import { drizzle } from 'drizzle-orm/neon-http';
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import type { Context } from '@hono/hono'
import { getRuntimeKey } from 'hono/adapter'
import { existInEnv, getEnv } from './utils.ts'

export function getPgClient(c: Context) {
  // TODO: find why is not always working when we add the IF
  // if (getRuntimeKey() === 'workerd') {
  //   return postgres(c.env.HYPERDRIVE.connectionString, { prepare: false, idle_timeout: 2 })
  // }
  // else
  if (existInEnv(c, 'CUSTOM_SUPABASE_DB_URL')) {
    console.log('CUSTOM_SUPABASE_DB_URL', getEnv(c, 'CUSTOM_SUPABASE_DB_URL'))
    return postgres(getEnv(c, 'CUSTOM_SUPABASE_DB_URL'), { prepare: false, idle_timeout: 2 })
  }
  console.log('SUPABASE_DB_URL', getEnv(c, 'SUPABASE_DB_URL'))
  return postgres(getEnv(c, 'SUPABASE_DB_URL'), { prepare: false, idle_timeout: 2 })
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
