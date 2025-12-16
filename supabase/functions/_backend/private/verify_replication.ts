import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import { Hono } from 'hono/tiny'
import { simpleError } from '../utils/hono.ts'
import { cloudlog } from '../utils/logging.ts'
import { supabaseAdmin } from '../utils/supabase.ts'

export const app = new Hono<MiddlewareKeyVariables>()
export type TableNames = 'app_versions' | 'channels' | 'channel_devices' | 'apps' | 'orgs' | 'stripe_info' | 'manifest'
interface ReplicationsDiff {
  d1CountEU: number
  supabase: number
  percentEU: number
  percent: number
}

app.get('/', async (c) => {
  // Tables to compare
  const tables: TableNames[] = [
    'apps',
    'app_versions',
    'channels',
    'channel_devices',
    'manifest',
    'orgs',
  ]

  // Count from D1 database using pre-calculated counts
  const d1EU = c.env.DB_REPLICA_EU.withSession('first-unconstrained') as D1DatabaseSession
  const [d1CountsEU] = await Promise.all([Promise.all(
    tables.map(table =>
      d1EU.prepare(`SELECT record_count as count FROM table_counts WHERE table_name = ?`).bind(table).first(),
    ),
  )])
  cloudlog({ requestId: c.get('requestId'), message: 'd1Counts', d1CountsEU })

  // Count from update.ts (PostgreSQL database)
  const pgCounts = await Promise.all(
    tables.map(table =>
      supabaseAdmin(c)
        .from(table)
        .select('*', { count: 'exact', head: true })
        .then((v) => {
          cloudlog({ requestId: c.get('requestId'), message: 'v', v })
          return { count: v.count }
        }),
    ),
  )
  cloudlog({ requestId: c.get('requestId'), message: 'pgCounts', pgCounts })
  const diff = await tables.reduce(async (acc: Promise<Record<TableNames, ReplicationsDiff>>, table: TableNames, index: number) => {
    const result = await acc
    const d1CountEU = (d1CountsEU[index]?.count as number) ?? 0

    const pgCount = pgCounts[index]?.count ?? 0
    const percentEU = (pgCount - d1CountEU) / d1CountEU
    const percent = Number((percentEU).toFixed(3))

    result[table] = { d1CountEU, supabase: pgCount, percentEU, percent }
    return result
  }, Promise.resolve({} as Record<string, ReplicationsDiff>))
  // if diff less than 1% of total rows, consider it as synced
  const totalPercent = Object.values(diff).reduce((acc, table) => acc + table.percent, 0)
  const diffPercentage = Number((totalPercent / Object.keys(diff).length).toFixed(3))
  if (diffPercentage > 1) {
    return simpleError('mismatch_found', 'Mismatch found', { diff, diffPercentage })
  }
  return c.json({ status: 'ok', diff, diffPercentage })
})
