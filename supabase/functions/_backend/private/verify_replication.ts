import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import { Hono } from 'hono/tiny'
import { simpleError } from '../utils/hono.ts'
import { cloudlog } from '../utils/loggin.ts'
import { supabaseAdmin } from '../utils/supabase.ts'

export const app = new Hono<MiddlewareKeyVariables>()
export type TableNames = 'app_versions' | 'channels' | 'channel_devices' | 'apps' | 'orgs' | 'stripe_info' | 'manifest'
interface ReplicationsDiff {
  d1CountEU: number
  d1CountUS: number
  d1CountAS: number
  supabase: number
  percentEU: number
  percentUS: number
  percentAS: number
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
  const d1US = c.env.DB_REPLICA_US.withSession('first-unconstrained') as D1DatabaseSession
  const d1AS = c.env.DB_REPLICA_AS.withSession('first-unconstrained') as D1DatabaseSession
  const [d1CountsEU, d1CountsUS, d1CountsAS] = await Promise.all([Promise.all(
    tables.map(table =>
      d1EU.prepare(`SELECT record_count as count FROM table_counts WHERE table_name = ?`).bind(table).first(),
    ),
  ), Promise.all(
    tables.map(table =>
      d1US.prepare(`SELECT record_count as count FROM table_counts WHERE table_name = ?`).bind(table).first(),
    ),
  ), Promise.all(
    tables.map(table =>
      d1AS.prepare(`SELECT record_count as count FROM table_counts WHERE table_name = ?`).bind(table).first(),
    ),
  )])
  cloudlog({ requestId: c.get('requestId'), message: 'd1Counts', d1CountsEU, d1CountsUS, d1CountsAS })

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
    const d1CountUS = (d1CountsUS[index]?.count as number) ?? 0
    const d1CountAS = (d1CountsAS[index]?.count as number) ?? 0

    const pgCount = pgCounts[index]?.count ?? 0
    const percentEU = (pgCount - d1CountEU) / d1CountEU
    const percentUS = (pgCount - d1CountUS) / d1CountUS
    const percentAS = (pgCount - d1CountAS) / d1CountAS
    const percent = Number(((percentEU + percentUS + percentAS) / 3).toFixed(3))

    result[table] = { d1CountEU, d1CountUS, d1CountAS, supabase: pgCount, percentEU, percentUS, percentAS, percent }
    return result
  }, Promise.resolve({} as Record<string, ReplicationsDiff>))
  // if diff less than 1% of total rows, consider it as synced
  const totalPercent = Object.values(diff).reduce((acc, table) => acc + table.percent, 0)
  const diffPercentage = Number((totalPercent / Object.keys(diff).length).toFixed(3))
  if (diffPercentage > 1) {
    throw simpleError('mismatch_found', 'Mismatch found', { diff, diffPercentage })
  }
  return c.json({ status: 'ok', diff, diffPercentage })
})
