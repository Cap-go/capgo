import type { Context } from 'hono'
import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import type { Order } from '../utils/types.ts'
import { Hono } from 'hono/tiny'
import { z } from 'zod/mini'
import { toCsv } from '../utils/csv.ts'
import { parseBody, simpleError, useCors } from '../utils/hono.ts'
import { middlewareV2 } from '../utils/hono_middleware.ts'
import { cloudlog } from '../utils/logging.ts'
import { appIdSchema, deviceIdSchema, hasInvalidQueryLimitInput, hasUnsafeStatsQueryText, MAX_QUERY_LIMIT, queryLimitSchema, safeQueryDateSchema, safeQueryTextSchema, statsActionSchema } from '../utils/privateAnalyticsValidation.ts'
import { checkPermission } from '../utils/rbac.ts'
import { readStats } from '../utils/stats.ts'

interface DataStats {
  appId: string
  devicesId?: string[]
  search?: string
  order?: Order[]
  rangeStart?: string | number
  rangeEnd?: string | number
  limit?: number
  actions?: string[]
}

const ORDER_KEYS = ['created_at', 'app_id', 'device_id', 'action', 'version_name'] as const
const EXPORT_FORMATS = ['csv', 'json'] as const

const statsBodyShape = {
  appId: appIdSchema,
  devicesId: z.optional(z.array(deviceIdSchema)),
  search: z.optional(safeQueryTextSchema),
  order: z.optional(z.array(z.object({
    key: z.enum(ORDER_KEYS),
    sortable: z.enum(['asc', 'desc']),
  }))),
  rangeStart: z.optional(z.union([safeQueryDateSchema, z.coerce.number()])),
  rangeEnd: z.optional(z.union([safeQueryDateSchema, z.coerce.number()])),
  limit: z.optional(queryLimitSchema),
  actions: z.optional(z.array(statsActionSchema)),
} as const

const statsBodySchema = z.object(statsBodyShape)

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
  ...statsBodyShape,
  format: z.optional(z.enum(EXPORT_FORMATS)),
  filename: z.optional(z.string()),
})

type StatsBody = z.infer<typeof statsBodySchema>
type ExportBody = z.infer<typeof exportSchema>
interface ValidatedStatsRequest<T extends StatsBody | ExportBody> {
  body: T
  startDate: string | undefined
  endDate: string | undefined
}

export const app = new Hono<MiddlewareKeyVariables>()

// Browser clients call this endpoint and require CORS preflight (OPTIONS).
// Use '*' so it also applies to sub-routes like '/export'.
app.use('*', useCors)

function normalizeRangeDate(value: string | number | undefined): string | undefined {
  if (value === undefined)
    return undefined

  const normalizedValue = typeof value === 'string' && /^\d+$/.test(value.trim())
    ? Number(value)
    : value

  const date = new Date(normalizedValue)
  if (Number.isNaN(date.getTime()))
    throw simpleError('invalid_body', 'Invalid body')

  return date.toISOString()
}

async function getValidatedStatsRequestBody<T extends StatsBody | ExportBody>(
  c: Context,
  schema: z.ZodMiniType<T>,
  logMessage: string,
): Promise<ValidatedStatsRequest<T>> {
  const bodyRaw = await parseBody<DataStats>(c)
  if (hasInvalidQueryLimitInput(bodyRaw.limit))
    throw simpleError('invalid_body', 'Invalid body')
  const parsed = schema.safeParse(bodyRaw)
  if (!parsed.success) {
    throw simpleError('invalid_body', 'Invalid body', { error: parsed.error })
  }
  const body = parsed.data
  if (hasUnsafeStatsQueryText(body)) {
    throw simpleError('invalid_body', 'Invalid body')
  }
  const startDate = normalizeRangeDate(body.rangeStart)
  const endDate = normalizeRangeDate(body.rangeEnd)
  cloudlog({ requestId: c.get('requestId'), message: logMessage, body })
  const hasAppReadLogsPermission = await checkPermission(c, 'app.read_logs', { appId: body.appId })
  if (!hasAppReadLogsPermission) {
    throw simpleError('app_access_denied', 'You can\'t access this app', { app_id: body.appId })
  }
  return { body, startDate, endDate }
}

function createStatsReadParams(
  body: StatsBody | ExportBody,
  startDate: string | undefined,
  endDate: string | undefined,
  limit = body.limit,
) {
  const order: Order[] | undefined = body.order?.map(item => ({ key: item.key, sortable: item.sortable }))

  return {
    app_id: body.appId,
    start_date: startDate,
    end_date: endDate,
    deviceIds: body.devicesId,
    search: body.search,
    order,
    limit,
    actions: body.actions,
  }
}

app.post('/', middlewareV2(['read', 'write', 'all', 'upload']), async (c) => {
  const { body, startDate, endDate } = await getValidatedStatsRequestBody(c, statsBodySchema, 'post private/stats body')
  return c.json(await readStats(c, createStatsReadParams(body, startDate, endDate)))
})

app.post('/export', middlewareV2(['read', 'write', 'all', 'upload']), async (c) => {
  const { body, startDate, endDate } = await getValidatedStatsRequestBody(c, exportSchema, 'post private/stats/export body')
  const format = body.format ?? 'csv'
  const limit = Math.min(Math.max(body.limit ?? 10_000, 1), MAX_QUERY_LIMIT)
  const data = await readStats(c, createStatsReadParams(body, startDate, endDate, limit))

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
