import { honoFactory, middlewareAPISecret, useCors } from '../utils/hono.ts'
import { cloudlogErr } from '../utils/logging.ts'
import { getEnv } from '../utils/utils.ts'

const CPU_THRESHOLD_PERCENT = 50
const GRAFANA_ERROR_BODY_LOG_BYTES = 4 * 1024
const GRAFANA_QUERY_RESPONSE_BYTES = 128 * 1024

export const app = honoFactory.createApp()

app.use('*', useCors)

async function readResponseTextWithLimit(response: Response, limit: number) {
  const contentLength = Number.parseInt(response.headers.get('content-length') ?? '', 10)
  if (Number.isFinite(contentLength) && contentLength > limit) {
    await response.body?.cancel().catch(() => undefined)
    return null
  }

  if (!response.body) {
    const text = await response.text()
    return new TextEncoder().encode(text).byteLength > limit ? null : text
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let total = 0
  let text = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) {
      text += decoder.decode()
      break
    }

    if (!value)
      continue

    total += value.byteLength
    if (total > limit) {
      await reader.cancel()
      return null
    }
    text += decoder.decode(value, { stream: true })
  }

  return text
}

app.get('/', middlewareAPISecret, async (c) => {
  const grafanaUrl = getEnv(c, 'GRAFANA_URL')
  const grafanaToken = getEnv(c, 'GRAFANA_TOKEN')

  if (!grafanaUrl || !grafanaToken) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'check_cpu_usage_missing_env', detail: 'GRAFANA_URL or GRAFANA_TOKEN not set' })
    return c.json({ status: 'error', error: 'missing_grafana_config', message: 'Grafana configuration is missing' }, 500)
  }

  const query = '100 * sum(rate(node_cpu_seconds_total{mode!="idle", supabase_project_ref="xvwzpoazmxkqosrdewyv"}[5m])) / sum(rate(node_cpu_seconds_total{supabase_project_ref="xvwzpoazmxkqosrdewyv"}[5m]))'

  const url = new URL(`${grafanaUrl}/api/prom/api/v1/query`)
  url.searchParams.set('query', query)

  try {
    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Basic ${btoa(grafanaToken)}`,
      },
    })

    if (!response.ok) {
      const detail = await readResponseTextWithLimit(response, GRAFANA_ERROR_BODY_LOG_BYTES)
      cloudlogErr({ requestId: c.get('requestId'), message: 'check_cpu_usage_grafana_error', status: response.status, detail: detail ?? 'response_body_too_large' })
      return c.json({ status: 'error', error: 'grafana_request_failed', message: `Grafana returned ${response.status}` }, 502)
    }

    const text = await readResponseTextWithLimit(response, GRAFANA_QUERY_RESPONSE_BYTES)
    if (text === null) {
      cloudlogErr({ requestId: c.get('requestId'), message: 'check_cpu_usage_grafana_response_too_large' })
      return c.json({ status: 'error', error: 'grafana_response_too_large', message: 'Grafana response is too large' }, 502)
    }

    const data = JSON.parse(text) as { status: string, data?: { result?: Array<{ value?: [number, string] }> } }

    if (data.status !== 'success' || !data.data?.result?.length) {
      cloudlogErr({ requestId: c.get('requestId'), message: 'check_cpu_usage_no_data', data })
      return c.json({ status: 'error', error: 'no_cpu_data', message: 'No CPU usage data returned from Grafana' }, 502)
    }

    const cpuUsage = Number.parseFloat(data.data.result[0].value?.[1] ?? '0')

    if (cpuUsage > CPU_THRESHOLD_PERCENT) {
      return c.json({
        status: 'overloaded',
        cpu_usage_percent: Math.round(cpuUsage * 100) / 100,
        threshold_percent: CPU_THRESHOLD_PERCENT,
        checked_at: new Date().toISOString(),
      }, 503)
    }

    return c.json({
      status: 'ok',
      cpu_usage_percent: Math.round(cpuUsage * 100) / 100,
      threshold_percent: CPU_THRESHOLD_PERCENT,
      checked_at: new Date().toISOString(),
    }, 200)
  }
  catch (error) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'check_cpu_usage_error', error })
    return c.json({ status: 'error', error: 'cpu_check_failed', message: 'Failed to check CPU usage' }, 502)
  }
})

export const checkCpuUsageTestUtils = {
  readResponseTextWithLimit,
}
