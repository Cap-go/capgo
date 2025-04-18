import type { Context } from '@hono/hono'
import type { TableNames } from '../triggers/replicate_data.ts'
import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import { Hono } from 'hono/tiny'
import { cleanFieldsAppVersions } from '../triggers/replicate_data.ts'
import { supabaseAdmin } from '../utils/supabase.ts'
import { backgroundTask } from '../utils/utils.ts'

export const app = new Hono<MiddlewareKeyVariables>()

// function to generate lastID for all table is 0 but for apps and orgs it's uuid 00000000-0000-0000-0000-000000000000
function generateLastId(table: TableNames) {
  if (table === 'apps' || table === 'orgs')
    return '00000000-0000-0000-0000-000000000000'
  return 0
}

async function deleteExtraRows(c: Context, table: TableNames) {
  const d1 = c.env.DB_REPLICATE as D1Database
  const supabase = supabaseAdmin(c)
  const batchSize = 1000
  let lastId = generateLastId(table)

  while (true) {
    try {
      console.log({ requestId: c.get('requestId'), context: `Checking for extra rows in D1 for table ${table} from id ${lastId}` })
      const d1Data = await d1.prepare(`SELECT id FROM ${table} WHERE id > ? ORDER BY id ASC LIMIT ?`).bind(lastId, batchSize).all()

      if (d1Data.error) {
        console.error({ requestId: c.get('requestId'), context: `Error fetching D1 data for table ${table}:`, error: d1Data.error })
        break
      }
      if (d1Data.results.length === 0) {
        console.log({ requestId: c.get('requestId'), context: `No more rows to check in D1 for table ${table}` })
        break
      }

      for (const row of d1Data.results) {
        const { data: supabaseData } = await supabase.from(table as any).select('id').eq('id', row.id).single()

        if (!supabaseData) {
          console.log({ requestId: c.get('requestId'), context: `Deleting extra row from D1 for table ${table}`, id: row.id })
          await d1.prepare(`DELETE FROM ${table} WHERE id = ?`).bind(row.id).run()
        }

        lastId = row.id as number
      }

      if (d1Data.results.length < batchSize) {
        console.log({ requestId: c.get('requestId'), context: `Finished checking all rows in D1 for table ${table}` })
        break
      }
    }
    catch (e) {
      console.error({ requestId: c.get('requestId'), context: `Error in deleteExtraRows for table ${table}:`, error: e })
      break
    }
  }
}

async function syncMissingRows(c: Context, table: TableNames) {
  const d1 = c.env.DB_REPLICATE as D1Database
  const supabase = supabaseAdmin(c)
  const batchSize = 1000
  let lastId = generateLastId(table)

  while (true) {
    try {
      console.log({ requestId: c.get('requestId'), context: `Syncing missing rows for table ${table} from id ${lastId}` })
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .order('id', { ascending: true })
        .gt('id', lastId)
        .limit(batchSize)

      console.log({ requestId: c.get('requestId'), context: `Found ${data?.length} missing rows for table ${table} from id ${lastId}` })
      if (error) {
        console.error({ requestId: c.get('requestId'), context: `Error in syncMissingRows for table ${table}:`, error })
        break
      }
      if (data.length === 0) {
        console.log({ requestId: c.get('requestId'), context: `No missing rows found for table ${table}` })
        break
      }
      console.log({ requestId: c.get('requestId'), context: `Looping through ${data.length} missing rows for table ${table}` })
      for (const row of data) {
        try {
          console.log({ requestId: c.get('requestId'), context: `Syncing missing rows for table ${table} starting from id ${lastId}` })
          const existingRow = await d1.prepare(`SELECT * FROM ${table} WHERE id = ?`).bind(row.id).first()
          const cleanRow = cleanFieldsAppVersions(row, table)
          if (!existingRow) {
            console.log({ requestId: c.get('requestId'), context: `inserting row for table ${table}`, id: row.id })
            await d1.prepare(`INSERT INTO ${table} (${Object.keys(cleanRow).join(', ')}) VALUES (${Object.keys(cleanRow).map(() => '?').join(', ')})`).bind(...Object.values(cleanRow)).run()
          }
          else {
            const updates = Object.entries(row)
              .filter(([key, value]) => existingRow[key] !== value)
              .map(([key]) => `${key} = ?`)
            if (updates.length > 0) {
              const updateQuery = `UPDATE ${table} SET ${updates.join(', ')} WHERE id = ?`
              console.log({ requestId: c.get('requestId'), context: `updating row for table ${table}`, id: row.id })
              await d1.prepare(updateQuery).bind(...updates.map(([_, value]) => value), row.id).run()
            }
          }
          lastId = row.id as number | string
        }
        catch (e) {
          console.error({ requestId: c.get('requestId'), context: `Error in deleteExtraRows for table ${table}:`, error: e })
          break
        }
      }
      if (data.length < batchSize) {
        console.log({ requestId: c.get('requestId'), context: `Finished syncing all missing rows for table ${table}` })
        break
      }
    }
    catch (e) {
      console.error({ requestId: c.get('requestId'), context: `Error in deleteExtraRows for table ${table}:`, error: e })
      break
    }
  }
}

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
        supabaseAdmin(c as any)
          .from(table)
          .select('*', { count: 'exact', head: true })
          .then((v) => {
            console.log({ requestId: c.get('requestId'), context: 'v', v })
            return { count: v.count }
          }),
      ),
    )
    console.log({ requestId: c.get('requestId'), context: 'pgCounts', pgCounts })
    const diff = await tables.reduce(async (acc: Promise<Record<TableNames, { d1: number, supabase: number, percent: number }>>, table: TableNames, index: number) => {
      const result = await acc
      const d1Count = (d1Counts[index]?.count as number) || 0
      const pgCount = pgCounts[index]?.count || 0
      const percent = (pgCount - d1Count) / d1Count
      result[table] = { d1: d1Count, supabase: pgCount, percent }
      if (d1Count <= pgCount) {
        console.log({ requestId: c.get('requestId'), context: `Syncing missing rows for table ${table}` })
        await backgroundTask(c as any, syncMissingRows(c as any, table))
      }
      else if (d1Count > pgCount) {
        console.log({ requestId: c.get('requestId'), context: `Deleting extra rows for table ${table}` })
        await backgroundTask(c as any, deleteExtraRows(c as any, table))
      }
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
    console.error({ requestId: c.get('requestId'), context: 'Error in db_comparison:', e })
    return c.json({ status: 'Error in db comparison', error: JSON.stringify(e) }, 500)
  }
})
