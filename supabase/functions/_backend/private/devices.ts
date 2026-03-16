import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import type { Order } from '../utils/types.ts'
import { Hono } from 'hono/tiny'
import { z } from 'zod/mini'
import { parseBody, simpleError, useCors } from '../utils/hono.ts'
import { middlewareV2 } from '../utils/hono_middleware.ts'
import { cloudlog } from '../utils/logging.ts'
import { appIdSchema, cursorSchema, deviceIdSchema, hasUnsafeDevicesQueryText, queryLimitSchema, safeQueryTextSchema } from '../utils/privateAnalyticsValidation.ts'
import { checkPermission } from '../utils/rbac.ts'
import { countDevices, readDevices } from '../utils/stats.ts'

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
  limit: z.optional(queryLimitSchema),
})

export const app = new Hono<MiddlewareKeyVariables>()

app.use('/', useCors)

app.post('/', middlewareV2(['read', 'write', 'all', 'upload']), async (c) => {
  const bodyRaw = await parseBody<DataDevice>(c)
  const parsed = devicesBodySchema.safeParse(bodyRaw)
  if (!parsed.success) {
    throw simpleError('invalid_body', 'Invalid body', { error: parsed.error })
  }
  const body = parsed.data
  if (hasUnsafeDevicesQueryText(body)) {
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
