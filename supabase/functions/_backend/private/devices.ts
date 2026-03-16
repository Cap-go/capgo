import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import type { Order } from '../utils/types.ts'
import { Hono } from 'hono/tiny'
import { z } from 'zod/mini'
import { parseBody, simpleError, useCors } from '../utils/hono.ts'
import { middlewareV2 } from '../utils/hono_middleware.ts'
import { cloudlog } from '../utils/logging.ts'
import { checkPermission } from '../utils/rbac.ts'
import { countDevices, readDevices } from '../utils/stats.ts'
import { deviceIdRegex, INVALID_STRING_APP_ID, INVALID_STRING_DEVICE_ID, MISSING_STRING_APP_ID, NON_STRING_APP_ID, reverseDomainRegex } from '../utils/utils.ts'

interface DataDevice {
  appId: string
  count?: boolean
  versionName?: string
  devicesId?: string[]
  deviceIds?: string[] // TODO: remove when migration is done
  search?: string
  customIdMode?: boolean
  order?: Order[]
  /** Cursor for pagination - pass nextCursor from previous response */
  cursor?: string
  /** Limit for results (default 1000) */
  limit?: number
}

const MAX_QUERY_TEXT_LENGTH = 512
const MAX_QUERY_LIMIT = 50_000

const appIdSchema = z.string({
  error: issue => issue.input === undefined ? MISSING_STRING_APP_ID : NON_STRING_APP_ID,
}).check(z.regex(reverseDomainRegex, { message: INVALID_STRING_APP_ID }))

const deviceIdSchema = z.string().check(
  z.maxLength(36),
  z.regex(deviceIdRegex, { message: INVALID_STRING_DEVICE_ID }),
)

const safeQueryTextSchema = z.string().check(z.maxLength(MAX_QUERY_TEXT_LENGTH))

const cursorSchema = z.string().check(z.maxLength(128))

const devicesBodySchema = z.object({
  appId: appIdSchema,
  count: z.optional(z.boolean()),
  versionName: z.optional(safeQueryTextSchema),
  devicesId: z.optional(z.array(deviceIdSchema)),
  deviceIds: z.optional(z.array(deviceIdSchema)),
  search: z.optional(safeQueryTextSchema),
  customIdMode: z.optional(z.boolean()),
  order: z.optional(z.array(z.object({
    key: z.string().check(z.maxLength(64)),
    sortable: z.optional(z.enum(['asc', 'desc'])),
  }))),
  cursor: z.optional(cursorSchema),
  limit: z.optional(z.coerce.number().check(z.minimum(1), z.maximum(MAX_QUERY_LIMIT))),
})

function hasControlChars(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i)
    if ((code >= 0 && code <= 31) || code === 127)
      return true
  }
  return false
}

function hasUnsafeQueryText(value: string | undefined, maxLength = MAX_QUERY_TEXT_LENGTH): boolean {
  if (value === undefined)
    return false
  return value.length > maxLength || hasControlChars(value)
}

export const app = new Hono<MiddlewareKeyVariables>()

app.use('/', useCors)

app.post('/', middlewareV2(['read', 'write', 'all', 'upload']), async (c) => {
  const bodyRaw = await parseBody<DataDevice>(c)
  const parsed = devicesBodySchema.safeParse(bodyRaw)
  if (!parsed.success) {
    throw simpleError('invalid_body', 'Invalid body', { error: parsed.error })
  }
  const body = parsed.data
  if (
    hasUnsafeQueryText(body.versionName)
    || hasUnsafeQueryText(body.search)
    || hasUnsafeQueryText(body.cursor, 128)
    || body.order?.some(item => hasUnsafeQueryText(item.key, 64))
  ) {
    throw simpleError('invalid_body', 'Invalid body')
  }
  cloudlog({ requestId: c.get('requestId'), message: 'post devices body', body })
  if (!(await checkPermission(c, 'app.read_devices', { appId: body.appId }))) {
    throw simpleError('app_access_denied', 'You can\'t access this app', { app_id: body.appId })
  }
  const devicesIds = body.devicesId ?? body.deviceIds ?? []
  if (body.count)
    return c.json({ count: await countDevices(c, body.appId, body.customIdMode ?? false, devicesIds, body.versionName, body.search?.trim()) })
  return c.json(await readDevices(c, {
    app_id: body.appId,
    version_name: body.versionName,
    deviceIds: devicesIds,
    search: body.search,
    order: body.order,
    cursor: body.cursor,
    limit: body.limit,
  }, body.customIdMode ?? false))
})
