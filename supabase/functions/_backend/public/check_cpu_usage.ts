import { honoFactory, middlewareAPISecret, useCors } from '../utils/hono.ts'
import { cloudlogErr } from '../utils/logging.ts'
import { getEnv } from '../utils/utils.ts'

const CPU_THRESHOLD_PERCENT = 50

export const app = honoFactory.createApp()

app.use('*', useCors)

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
        'Authorization': `Basic ${btoa(grafanaToken)}`,
      },
    })

    if (!response.ok) {
      cloudlogErr({ requestId: c.get('requestId'), message: 'check_cpu_usage_grafana_error', status: response.status, detail: await response.text() })
      return c.json({ status: 'error', error: 'grafana_request_failed', message: `Grafana returned ${response.status}` }, 502)
    }

    const data = await response.json() as { status: string, data?: { result?: Array<{ value?: [number, string] }> } }

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
