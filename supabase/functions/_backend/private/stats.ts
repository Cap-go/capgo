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

const ORDER_KEYS = ['created_at', 'app_id', 'device_id', 'action', 'version_name'] as const
const EXPORT_FORMATS = ['csv', 'json'] as const

function stripControlChars(input: string): string {
  const out: string[] = []
  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i)
    // 0-31 are control chars, 127 is DEL.
    if ((code >= 0 && code <= 31) || code === 127)
      continue
    out.push(input[i])
  }
  return out.join('')
}

function sanitizeFilename(input: string | undefined, extension: 'csv' | 'json'): string | undefined {
  if (!input)
    return undefined

  const trimmed = input.trim()
  if (!trimmed)
    return undefined

  // Strip path separators and control characters.
  const safe = stripControlChars(trimmed)
    .replace(/[\\/]/g, '_')
    .replace(/\s+/g, ' ')
    .slice(0, 180)

  const ext = `.${extension}`
  if (safe.toLowerCase().endsWith(ext))
    return safe
  return `${safe}${ext}`
}

const exportSchema = z.object({
  appId: z.string(),
  devicesId: z.optional(z.array(z.string())),
  search: z.optional(z.string()),
  order: z.optional(z.array(z.object({
    key: z.enum(ORDER_KEYS),
    sortable: z.enum(['asc', 'desc']),
  }))),
  rangeStart: z.optional(z.union([z.string(), z.number()])),
  rangeEnd: z.optional(z.union([z.string(), z.number()])),
  limit: z.optional(z.coerce.number()),
  actions: z.optional(z.array(z.string())),
  format: z.optional(z.enum(EXPORT_FORMATS)),
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

  const format = body.format ?? 'csv'
  const limit = Math.min(Math.max(body.limit ?? 10_000, 1), 50_000)

  const order: Order[] | undefined = body.order?.map(o => ({ key: o.key, sortable: o.sortable }))
  const startDate = body.rangeStart !== undefined ? String(body.rangeStart) : undefined
  const endDate = body.rangeEnd !== undefined ? String(body.rangeEnd) : undefined

  const data = await readStats(c, {
    app_id: body.appId,
    start_date: startDate,
    end_date: endDate,
    deviceIds: body.devicesId,
    search: body.search,
    order,
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
  const safeFilename = sanitizeFilename(body.filename, 'csv')
  return c.json({
    format: 'csv',
    filename: safeFilename || defaultFilename,
    contentType: 'text/csv; charset=utf-8',
    limit,
    rowCount: Array.isArray(data) ? data.length : 0,
    csv,
  })
})
