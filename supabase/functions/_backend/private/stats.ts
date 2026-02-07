import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import type { Order } from '../utils/types.ts'
import { Hono } from 'hono/tiny'
import { z } from 'zod/mini'
import { toCsv } from '../utils/csv.ts'
import { parseBody, simpleError, useCors } from '../utils/hono.ts'
import { middlewareV2 } from '../utils/hono_middleware.ts'
import { cloudlog } from '../utils/logging.ts'
import { checkPermission } from '../utils/rbac.ts'
import { readStats } from '../utils/stats.ts'

interface DataStats {
  appId: string
  devicesId?: string[]
  search?: string
  order?: Order[]
  rangeStart?: string
  rangeEnd?: string
  limit?: number
  actions?: string[]
}

const exportSchema = z.object({
  appId: z.string(),
  devicesId: z.optional(z.array(z.string())),
  search: z.optional(z.string()),
  order: z.optional(z.array(z.object({
    key: z.string(),
    sortable: z.union([z.boolean(), z.literal('asc'), z.literal('desc')]),
  }))),
  rangeStart: z.optional(z.union([z.string(), z.number()]).transform(v => String(v))),
  rangeEnd: z.optional(z.union([z.string(), z.number()]).transform(v => String(v))),
  limit: z.optional(z.coerce.number()),
  actions: z.optional(z.array(z.string())),
  format: z.optional(z.string()),
  filename: z.optional(z.string()),
})

export const app = new Hono<MiddlewareKeyVariables>()

app.use('/', useCors)

app.post('/', middlewareV2(['read', 'write', 'all', 'upload']), async (c) => {
  const body = await parseBody<DataStats>(c)
  cloudlog({ requestId: c.get('requestId'), message: 'post private/stats body', body })
  if (!(await checkPermission(c, 'app.read_logs', { appId: body.appId }))) {
    throw simpleError('app_access_denied', 'You can\'t access this app', { app_id: body.appId })
  }
  return c.json(await readStats(c, {
    app_id: body.appId,
    start_date: body.rangeStart,
    end_date: body.rangeEnd,
    deviceIds: body.devicesId,
    search: body.search,
    order: body.order,
    limit: body.limit,
    actions: body.actions,
  }))
})

app.post('/export', middlewareV2(['read', 'write', 'all', 'upload']), async (c) => {
  const bodyRaw = await parseBody<any>(c)
  const parsed = exportSchema.safeParse(bodyRaw)
  if (!parsed.success) {
    throw simpleError('invalid_body', 'Invalid body', { error: parsed.error })
  }
  const body = parsed.data
  cloudlog({ requestId: c.get('requestId'), message: 'post private/stats/export body', body })

  if (!(await checkPermission(c, 'app.read_logs', { appId: body.appId }))) {
    throw simpleError('app_access_denied', 'You can\'t access this app', { app_id: body.appId })
  }

  const format = (body.format ?? 'csv').toLowerCase()
  const limit = Math.min(Math.max(body.limit ?? 10_000, 1), 50_000)

  const data = await readStats(c, {
    app_id: body.appId,
    start_date: body.rangeStart,
    end_date: body.rangeEnd,
    deviceIds: body.devicesId,
    search: body.search,
    order: body.order as any,
    limit,
    actions: body.actions,
  })

  if (format === 'json') {
    return c.json({
      format: 'json',
      data,
      limit,
      rowCount: Array.isArray(data) ? data.length : 0,
    })
  }

  const header = ['created_at', 'app_id', 'device_id', 'action', 'version_name'] as const
  const csv = toCsv(
    header,
    (Array.isArray(data) ? data : []).map((row: any) => ({
      created_at: row.created_at ?? '',
      app_id: row.app_id ?? '',
      device_id: row.device_id ?? '',
      action: row.action ?? '',
      version_name: row.version_name ?? '',
    })),
  )

  const defaultFilename = `capgo-logs-${body.appId}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.csv`
  return c.json({
    format: 'csv',
    filename: body.filename?.trim() || defaultFilename,
    contentType: 'text/csv; charset=utf-8',
    limit,
    rowCount: Array.isArray(data) ? data.length : 0,
    csv,
  })
})
