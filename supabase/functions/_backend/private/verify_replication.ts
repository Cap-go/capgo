import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import { Hono } from 'hono/tiny'
import { supabaseAdmin } from '../utils/supabase.ts'

export const app = new Hono<MiddlewareKeyVariables>()
export type TableNames = 'app_versions' | 'channels' | 'channel_devices' | 'apps' | 'orgs' | 'stripe_info' | 'manifest'

app.get('/', async (c) => {
  try {
    // Tables to compare
    const tables: TableNames[] = [
      'apps',
      'app_versions',
      'channels',
      'channel_devices',
      'manifest',
      'orgs',
    ]

    // Count from D1 database
    const d1 = c.env.DB_REPLICATE as D1Database
    const d1Counts = await Promise.all(
      tables.map(table =>
        d1.prepare(`SELECT COUNT(*) as count FROM ${table}`).first(),
      ),
    )
    console.log({ requestId: c.get('requestId'), message: 'd1Counts', d1Counts })

    // Count from update.ts (PostgreSQL database)
    const pgCounts = await Promise.all(
      tables.map(table =>
        supabaseAdmin(c as any)
          .from(table)
          .select('*', { count: 'exact', head: true })
          .then((v) => {
            console.log({ requestId: c.get('requestId'), message: 'v', v })
            return { count: v.count }
          }),
      ),
    )
    console.log({ requestId: c.get('requestId'), message: 'pgCounts', pgCounts })
    const diff = await tables.reduce(async (acc: Promise<Record<TableNames, { d1: number, supabase: number, percent: number }>>, table: TableNames, index: number) => {
      const result = await acc
      const d1Count = (d1Counts[index]?.count as number) || 0
      const pgCount = pgCounts[index]?.count || 0
      const percent = (pgCount - d1Count) / d1Count
      result[table] = { d1: d1Count, supabase: pgCount, percent }
      return result
    }, Promise.resolve({} as Record<string, { d1: number, supabase: number, percent: number }>))
    // if diff less than 1% of total rows, consider it as synced
    const totalPercent = Object.values(diff).reduce((acc, table) => acc + table.percent, 0)
    const diffPercentage = totalPercent / Object.keys(diff).length
    if (diffPercentage < 2) {
      return c.json({
        status: 'ok',
        diff,
        diffPercentage,
      })
    }
    else {
      return c.json({ status: 'Mismatch found', diff, diffPercentage }, 200)
    }
  }
  catch (e) {
    console.error({ requestId: c.get('requestId'), message: 'Error in db_comparison:', e })
    return c.json({ status: 'Error in db comparison', error: JSON.stringify(e) }, 500)
  }
})
