// import { count } from 'drizzle-orm'
import { Hono } from 'hono/tiny'
import type { Context } from '@hono/hono'
import { BRES } from '../utils/hono.ts'
// import { closeClient, getDrizzleClient, getPgClient } from '../utils/pg.ts'
// import * as schema from '../utils/postgress_schema.ts'
import { supabaseAdmin } from '../utils/supabase.ts'

export const app = new Hono()

app.get('/', async (c: Context) => {
  try {
    // const pgClient = getPgClient(c)
    // const drizzleClient = getDrizzleClient(pgClient as any)

    // Tables to compare
    const tables = [
      'apps',
      'app_versions',
      'channels',
      'devices_override',
      'channel_devices',
      'orgs',
    ]

    // Count from replicate_data.ts (D1 database)
    const d1 = c.env.DB_REPLICATE as D1Database
    const d1Counts = await Promise.all(
      tables.map(table =>
        d1.prepare(`SELECT COUNT(*) as count FROM ${table}`).first(),
      ),
    )
    console.log('d1Counts', d1Counts)

    // Count from update.ts (PostgreSQL database)
    const pgCounts = await Promise.all(
      tables.map(table =>
        supabaseAdmin(c)
          .from(table as any)
          .select('*', { count: 'exact', head: true })
          .then((v) => {
            console.log('v', v)
            return { count: v.count }
          }),
      ),
    )
    console.log('pgCounts', pgCounts)
    // closeClient(c, pgClient)
    const diff = tables.reduce((acc, table, index) => {
      const d1Count = (d1Counts[index]?.count as number) || 0
      const pgCount = pgCounts[index]?.count || 0
      if (d1Count !== pgCount) {
        acc[table] = { d1: d1Count, pg: pgCount }
      }
      return acc
    }, {} as Record<string, { d1: number, pg: number }>)

    if (Object.keys(diff).length === 0) {
      return c.json(BRES)
    }
    else {
      return c.json({ status: 'Mismatch found', diff })
    }
  }
  catch (e) {
    console.error('Error in db_comparison:', e)
    return c.json({ status: 'Error in db comparison', error: JSON.stringify(e) }, 500)
  }
})
