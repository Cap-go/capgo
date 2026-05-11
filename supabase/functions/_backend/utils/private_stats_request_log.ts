export interface PrivateStatsRequestLogBody {
  appId?: string
  devicesId?: unknown[]
  search?: unknown
  order?: unknown[]
  rangeStart?: string | number
  rangeEnd?: string | number
  limit?: number
  actions?: unknown[]
  format?: string
  filename?: unknown
}

export function summarizePrivateStatsRequestForLog(body: PrivateStatsRequestLogBody | undefined) {
  const devicesId = Array.isArray(body?.devicesId) ? body.devicesId : []
  const order = Array.isArray(body?.order) ? body.order : []
  const actions = Array.isArray(body?.actions) ? body.actions : []

  return {
    app_id: body?.appId,
    range_start: body?.rangeStart,
    range_end: body?.rangeEnd,
    limit: body?.limit,
    format: body?.format,
    device_filter_count: devicesId.length,
    order_count: order.length,
    action_count: actions.length,
    has_search: typeof body?.search === 'string' && body.search.length > 0,
    has_filename: typeof body?.filename === 'string' && body.filename.trim().length > 0,
  }
}
