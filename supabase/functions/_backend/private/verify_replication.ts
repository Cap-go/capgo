import type { Context } from '@hono/hono'
import { Hono } from 'hono/tiny'
import { supabaseAdmin } from '../utils/supabase.ts'

export const app = new Hono()

async function syncMissingRows(c: Context, table: string, d1Count: number, pgCount: number) {
  if (d1Count >= pgCount)
    return
  if (table === 'channel_devices')
    return

  const d1 = c.env.DB_REPLICATE as D1Database
  const supabase = supabaseAdmin(c)
  const batchSize = 1000
  let lastId = 0

  while (true) {
    const pgData = await supabase
      .from(table as any)
      .select('*')
      .order('id', { ascending: true })
      .gt('id', lastId)
      .limit(batchSize)

    if (pgData.error)
      throw pgData.error
    if (pgData.data.length === 0)
      break

    for (const row of pgData.data) {
      const existingRow = await d1.prepare(`SELECT * FROM ${table} WHERE id = ?`).bind(row.id).first()
      if (!existingRow) {
        await d1.prepare(`INSERT INTO ${table} (${Object.keys(row).join(', ')}) VALUES (${Object.keys(row).map(() => '?').join(', ')})`).bind(...Object.values(row)).run()
      }
      else if (table !== 'channel_devices') {
        const updates = Object.entries(row)
          .filter(([key, value]) => existingRow[key] !== value)
          .map(([key, value]) => `${key} = ?`)
        if (updates.length > 0) {
          const updateQuery = `UPDATE ${table} SET ${updates.join(', ')} WHERE id = ?`
          await d1.prepare(updateQuery).bind(...updates.map(([_, value]) => value), row.id).run()
        }
      }
      lastId = row.id
    }
  }
}

app.get('/', async (c: Context) => {
  try {
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
    console.log({ requestId: c.get('requestId'), context: 'd1Counts', d1Counts })

    // Count from update.ts (PostgreSQL database)
    const pgCounts = await Promise.all(
      tables.map(table =>
        supabaseAdmin(c)
          .from(table as any)
          .select('*', { count: 'exact', head: true })
          .then((v) => {
            console.log({ requestId: c.get('requestId'), context: 'v', v })
            return { count: v.count }
          }),
      ),
    )
    console.log({ requestId: c.get('requestId'), context: 'pgCounts', pgCounts })
    const diff = tables.reduce((acc, table, index) => {
      const d1Count = (d1Counts[index]?.count as number) || 0
      const pgCount = pgCounts[index]?.count || 0
      if (d1Count !== pgCount) {
        acc[table] = { d1: d1Count, supabase: pgCount }
        c.executionCtx.waitUntil(syncMissingRows(c, table, d1Count, pgCount))
      }
      return acc
    }, {} as Record<string, { d1: number, supabase: number }>)

    // if diff less than 1% of total rows, consider it as synced
    const totalRows = Object.values(diff).reduce((acc, table) => acc + table.d1, 0)
    const diffPercentage = Object.keys(diff).length / totalRows * 100
    if (diffPercentage < 1) {
      return c.json({
        status: 'ok',
        diff,
        diffPercentage,
      })
    }
    else {
      return c.json({ status: 'Mismatch found', diff }, 200)
    }
  }
  catch (e) {
    console.error({ requestId: c.get('requestId'), context: 'Error in db_comparison:', e })
    return c.json({ status: 'Error in db comparison', error: JSON.stringify(e) }, 500)
  }
})
