import type { Context } from '@hono/hono'
import * as d3 from 'd3'
import dayjs from 'dayjs'
import { Hono } from 'hono/tiny'
import { JSDOM } from 'jsdom'
import { svgPathProperties } from 'svg-path-properties'
import { z } from 'zod'
import { middlewareKey, useCors } from '../../utils/hono.ts'
import { hasAppRight, hasOrgRight, supabaseAdmin, supabaseClient as useSupabaseClient } from '../../utils/supabase.ts'
import { checkKey } from '../../utils/utils.ts'

export const app = new Hono()
app.use('*', useCors)

const bundleUsageSchema = z.object({
  from: z.coerce.date(),
  to: z.coerce.date(),
  graph: z.string().optional().superRefine((val, ctx) => {
    if (val && val !== 'true' && val !== 'false')
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid graph value. Must be true or false.' })
  }).transform(val => val === 'true'),
})

const normalStatsSchema = z.object({
  from: z.coerce.date(),
  to: z.coerce.date(),
  graph: z.enum(['mau', 'storage', 'bandwidth']).optional(),
})

interface VersionName {
  id: number
  name: string
  created_at: string | null
}

interface appUsageByVersion {
  date: string
  app_id: string
  version_id: number
  install: number | null
  uninstall: number | null
}

app.get('/app/:app_id', middlewareKey(['all', 'write', 'read', 'upload']), async (c: Context) => {
  try {
    const apikey = c.get('apikey')
    const appId = c.req.param('app_id')
    const query = c.req.query()

    if (!await hasAppRight(c, appId, apikey.user_id, 'read'))
      return c.json({ status: 'You can\'t access this app', app_id: apikey.app_id }, 400)

    const bodyParsed = normalStatsSchema.safeParse(query)
    if (!bodyParsed.success)
      return c.json({ status: 'Invalid body', error: bodyParsed.error.message }, 400)
    const body = bodyParsed.data

    const supabase = supabaseAdmin(c)
    const { data: finalStats, error } = (body.graph === undefined) ? await getNormalStats(appId, null, body.from, body.to, supabase) : await drawGraphForNormalStats(appId, null, body.from, body.to, body.graph, supabase)
    if (error)
      return c.json({ status: 'Cannot get app statistics', error: JSON.stringify(error) }, 500)

    if (body.graph === undefined) {
      return c.json({ status: 'ok', statistics: finalStats })
    }
    else {
      c.header('Content-Type', 'image/svg+xml')
      return c.body(finalStats as string)
    }
  }
  catch (e) {
    console.error(e)
    return c.json({ status: 'Cannot get app statistics', error: JSON.stringify(e) }, 500)
  }
})

app.get('/org/:org_id', middlewareKey(['all', 'write', 'read', 'upload']), async (c: Context) => {
  try {
    const apikey = c.get('apikey')
    const orgId = c.req.param('org_id')
    const query = c.req.query()

    // Check if user has access to this organization
    const supabase = supabaseAdmin(c)

    if (!(await hasOrgRight(c, orgId, apikey.user_id, 'read')))
      return c.json({ status: 'You can\'t access this organization', orgId }, 400)

    const bodyParsed = normalStatsSchema.safeParse(query)
    if (!bodyParsed.success)
      return c.json({ status: 'Invalid body', error: bodyParsed.error.message }, 400)
    const body = bodyParsed.data

    const { data: finalStats, error } = (body.graph === undefined)
      ? await getNormalStats(null, orgId, body.from, body.to, supabase)
      : await drawGraphForNormalStats(null, orgId, body.from, body.to, body.graph, supabase)

    if (error)
      return c.json({ status: 'Cannot get organization statistics', error: JSON.stringify(error) }, 500)

    if (body.graph === undefined) {
      return c.json({ status: 'ok', statistics: finalStats })
    }
    else {
      c.header('Content-Type', 'image/svg+xml')
      return c.body(finalStats as string)
    }
  }
  catch (e) {
    console.error(e)
    return c.json({ status: 'Cannot get organization statistics', error: JSON.stringify(e) }, 500)
  }
})

app.get('/app/:app_id/bundle_usage', async (c: Context) => {
  try {
    const appId = c.req.param('app_id')
    const query = c.req.query()
    let useDashbord = false

    const bodyParsed = bundleUsageSchema.safeParse(query)
    if (!bodyParsed.success)
      return c.json({ status: 'Invalid body', error: bodyParsed.error.message }, 400)
    const body = bodyParsed.data

    // deno-lint-ignore no-inner-declarations
    async function checkApikeyAuth() {
      const capgkey_string = c.req.header('capgkey')
      if (!capgkey_string)
        return c.json({ message: 'Invalid apikey' }, 400)

      const apikey = await checkKey(c, capgkey_string, supabaseAdmin(c), ['all'])
      if (!apikey)
        return c.json({ message: 'Invalid apikey' }, 400)
      c.set('apikey', apikey)
      c.set('capgkey', capgkey_string)

      return null
    }

    if (!body.graph) {
      const authToken = c.req.header('authorization')
      if (!authToken) {
        const res = await checkApikeyAuth()
        if (res)
          return res
      }
      else {
        const supabaseClient = useSupabaseClient(c, authToken)
        const t = await supabaseClient.from('apps').select('*')
        console.log({ t })
        const { data: _, error: appError } = await supabaseClient.from('apps').select('*').eq('app_id', appId).single()
        if (appError)
          return c.json({ status: 'Cannot get app statistics. You probably don\'t have access to this app', error: JSON.stringify(appError) }, 400)
        const { data: user, error: userError } = await supabaseClient.auth.getUser()
        if (userError)
          return c.json({ status: 'Cannot get app statistics. You probably don\'t have access to this app', error: JSON.stringify(userError) }, 400)
        c.set('userId', user.user?.id)
        useDashbord = true
      }
    }
    else {
      const res = await checkApikeyAuth()
      if (res)
        return res
    }

    const apikey = c.get('apikey')
    const userId = apikey ? apikey.user_id : c.get('userId')
    if (!await hasAppRight(c, appId, userId, 'read'))
      return c.json({ status: 'You can\'t access this app', app_id: apikey.app_id }, 400)

    const supabase = supabaseAdmin(c)
    const { data, error } = ((body.graph === true) ? await getBundleUsageGraph(appId, body.from, body.to, supabase) : await getBundleUsage(appId, body.from, body.to, useDashbord, supabase))
    if (error)
      return c.json({ status: 'Cannot get app statistics. Cannot get bundle usage', error: JSON.stringify(error) }, 500)

    if (body.graph === false && typeof data !== 'string') {
      return c.json({ status: 'ok', data })
    }
    else {
      c.header('Content-Type', 'image/svg+xml')
      return c.body(data as string)
    }
  }
  catch (e) {
    console.error(e)
    return c.json({ status: 'Cannot get app statistics. Cannot get bundle usage', error: JSON.stringify(e) }, 500)
  }
})

async function getNormalStats(appId: string | null, ownerOrg: string | null, from: Date, to: Date, supabase: ReturnType<typeof supabaseAdmin>) {
  if (!appId && !ownerOrg)
    return { data: null, error: 'Invalid appId or ownerOrg' }

  let ownerOrgId = ownerOrg
  if (appId) {
    const { data, error } = await supabase.from('apps').select('*').eq('app_id', appId).single()
    if (error)
      return { data: null, error }
    ownerOrgId = data.owner_org
  }

  const { data: metrics, error: metricsError } = await supabase.rpc('get_app_metrics', { org_id: ownerOrgId, start_date: from.toISOString(), end_date: to.toISOString() })
  if (metricsError)
    return { data: null, error: metricsError }
  const graphDays = getDaysBetweenDates(from, to)

  const createUndefinedArray = (length: number) => {
    const arr: any[] = [] as any[]
    for (let i = 0; i < length; i++)
      arr.push(undefined)
    return arr
  }

  let mau = createUndefinedArray(graphDays) as number[]
  let storage = createUndefinedArray(graphDays) as number[]
  let bandwidth = createUndefinedArray(graphDays) as number[]

  metrics
    .filter((m) => {
      if (!appId)
        return true
      return m.app_id === appId
    })
    .forEach((item, i) => {
      if (item.date) {
        const dayNumber = i
        if (mau[dayNumber])
          mau[dayNumber] += item.mau
        else
          mau[dayNumber] = item.mau

        const storageVal = item.storage
        if (storage[dayNumber])
          storage[dayNumber] += storageVal
        else
          storage[dayNumber] = storageVal

        const bandwidthVal = item.bandwidth ?? 0
        if (bandwidth[dayNumber])
          bandwidth[dayNumber] += bandwidthVal
        else
          bandwidth[dayNumber] = bandwidthVal
      }
    })

  if (storage.length !== 0) {
    // some magic, copied from the frontend without much understanding
    const { data: currentStorageBytes, error: storageError } = await supabase.rpc(appId ? 'get_total_app_storage_size_orgs' : 'get_total_storage_size_org', appId ? { org_id: ownerOrgId, app_id: appId } : { org_id: ownerOrgId })
      .single()
    if (storageError)
      return { data: null, error: storageError }

    const storageVariance = storage.reduce((p, c) => (p + (c || 0)), 0)
    const currentStorage = currentStorageBytes
    console.log({ a: (currentStorage - storageVariance + (storage[0] ?? 0)) })
    const initValue = Math.max(0, (currentStorage - storageVariance + (storage[0] ?? 0)))
    storage[0] = initValue
  }

  // eslint-disable-next-line style/max-statements-per-line
  storage = (storage as number[]).reduce((p, c) => { if (p.length > 0) { c += p[p.length - 1] } p.push(c); return p }, [] as number[])
  // eslint-disable-next-line style/max-statements-per-line
  mau = (mau as number[]).reduce((p, c) => { if (p.length > 0) { c += p[p.length - 1] } p.push(c); return p }, [] as number[])
  // eslint-disable-next-line style/max-statements-per-line
  bandwidth = (bandwidth as number[]).reduce((p, c) => { if (p.length > 0) { c += p[p.length - 1] } p.push(c); return p }, [] as number[])
  const baseDay = dayjs(from)

  const finalStats = createUndefinedArray(graphDays)
  for (let i = 0; i < graphDays; i++) {
    const day = baseDay.add(i, 'day')
    finalStats[i] = {
      mau: mau[i],
      storage: storage[i],
      bandwidth: bandwidth[i],
      date: day.toISOString(),
    }
  }
  return { data: finalStats, error: null }
}

async function getBundleUsage(appId: string, from: Date, to: Date, shouldGetLatestVersion: boolean, supabase: ReturnType<typeof supabaseAdmin>) {
  const { data: dailyVersion, error: dailyVersionError } = await supabase
    .from('daily_version')
    .select('date, app_id, version_id, install, uninstall')
    .eq('app_id', appId)
    .gte('date', from.toISOString())
    .lte('date', to.toISOString())
    .order('date', { ascending: true })
  if (dailyVersionError)
    return { data: null, error: dailyVersionError }

  const { data: versionNames, error: versionNamesError } = await supabase
    .from('app_versions')
    .select('id, name, created_at')
    .eq('app_id', appId)
    .in('id', dailyVersion.map(d => d.version_id))

  if (versionNamesError)
    return { data: null, error: versionNamesError }

  // stolen from MobileStats.vue
  const versions = [...new Set(dailyVersion.map(d => d.version_id))]
  const dates = [...new Set(dailyVersion.map(d => d.date))].sort((a, b) => new Date(a).getTime() - new Date(b).getTime())

  // Step 1: Calculate accumulated data
  const accumulatedData = calculateAccumulatedData(dailyVersion, dates, versions)
  // Step 2: Convert to percentages, ensuring total <= 100% per day
  const percentageData = convertToPercentages(accumulatedData)
  // Step 3: Get active versions (versions with non-zero usage)
  const activeVersions = getActiveVersions(versions, percentageData)
  // Step 4: Create datasets for the chart
  const datasets = createDatasets(activeVersions, dates, percentageData, versionNames)

  if (shouldGetLatestVersion) {
    const latestVersion = getLatestVersion(versionNames)
    const latestVersionPercentage = getLatestVersionPercentage(datasets, latestVersion)

    return {
      data: {
        labels: dates,
        datasets,
        latestVersion: {
          name: latestVersion?.name,
          percentage: latestVersionPercentage.toFixed(2),
        },
      },
      error: null,
    }
  }

  return {
    data: {
      labels: dates,
      datasets,
    },
    error: null,
  }
}

// Calculate cumulative installs for each version over time
function calculateAccumulatedData(usage: appUsageByVersion[], dates: string[], versions: number[]) {
  const accumulated: { [date: string]: { [version: number]: number } } = {}

  // Initialize with zeros
  dates.forEach((date) => {
    accumulated[date] = {}
    versions.forEach(version => accumulated[date][version] = 0)
  })

  // Process data day by day
  dates.forEach((date, index) => {
    const dailyUsage = usage.filter(u => u.date === date)
    const totalNewInstalls = dailyUsage.reduce((sum, u) => sum + (u.install || 0), 0)

    if (index === 0) {
      // First day: just add installs
      dailyUsage.forEach(({ version_id, install }) => {
        accumulated[date][version_id] = install || 0
      })
    }
    else {
      const prevDate = dates[index - 1]
      const prevTotal = Object.values(accumulated[prevDate]).reduce((sum, val) => sum + val, 0)

      versions.forEach((version) => {
        const change = dailyUsage.find(u => u.version_id === version)
        const prevValue = accumulated[prevDate][version]

        if (change && change.install) {
          // Version has new installs: add them
          accumulated[date][version] = prevValue + change.install
        }
        else {
          // Version has no new installs: decrease proportionally
          const decreaseFactor = Math.max(0, 1 - (totalNewInstalls / prevTotal))
          accumulated[date][version] = Math.max(0, prevValue * decreaseFactor)
        }

        // Subtract uninstalls if any
        if (change && change.uninstall) {
          accumulated[date][version] = Math.max(0, accumulated[date][version] - change.uninstall)
        }
      })
    }
  })

  return accumulated
}

// Convert accumulated data to percentages, ensuring total <= 100% per day
function convertToPercentages(accumulated: { [date: string]: { [version: number]: number } }) {
  const percentages: { [date: string]: { [version: number]: number } } = {}

  Object.keys(accumulated).forEach((date) => {
    const dayData = accumulated[date]
    const total = Object.values(dayData).reduce((sum, value) => sum + value, 0)

    percentages[date] = {}
    if (total > 0) {
      Object.keys(dayData).forEach((version) => {
        percentages[date][version as any] = (dayData[version as any] / total) * 100
      })
    }
  })

  return percentages
}

// Filter out versions with no usage
function getActiveVersions(versions: number[], percentages: { [date: string]: { [version: number]: number } }) {
  return versions.filter(version =>
    Object.values(percentages).some(dayData => (dayData[version] || 0) > 0),
  )
}

// Create datasets for Chart.js
function createDatasets(versions: number[], dates: string[], percentages: { [date: string]: { [version: number]: number } }, versionNames: VersionName[]) {
  return versions.map((version) => {
    const percentageData = dates.map(date => percentages[date][version] || 0)
    // const color = colorKeys[(i + SKIP_COLOR) % colorKeys.length]
    const versionName = versionNames.find(v => v.id === version)?.name || version

    return {
      label: versionName,
      data: percentageData,
    }
  })
}

// Find the latest version based on creation date
function getLatestVersion(versions: VersionName[]) {
  return versions.reduce((latest, current) =>
    new Date(current.created_at ?? '') > new Date(latest.created_at ?? '') ? current : latest, versions[0])
}

// Get the percentage of the latest version on the last day
function getLatestVersionPercentage(datasets: any[], latestVersion: { name: string }) {
  const latestVersionDataset = datasets.find(dataset => dataset.label === latestVersion?.name)
  return latestVersionDataset ? latestVersionDataset.data[latestVersionDataset.data.length - 1] : 0
}

async function drawGraphForNormalStats(appId: string | null, ownerOrg: string | null, from: Date, to: Date, key: 'mau' | 'storage' | 'bandwidth', supabase: ReturnType<typeof supabaseAdmin>) {
  const { data, error } = await getNormalStats(appId, ownerOrg, from, to, supabase)
  if (error)
    return { data: null, error }

  const virtualDOM = new JSDOM('<html><body></body></html>', { pretendToBeVisual: true });
  (globalThis as any).document = virtualDOM.window.document

  const svgWidth = 700
  const svgHeight = 700

  const colors = {
    mau: '#34d399',
    storage: '#60a5fa',
    bandwidth: '#fb923c',
  }

  const margin = { top: 20, right: 20, bottom: 70, left: 120 }
  const graphWidth = svgWidth - margin.left - margin.right
  const graphHeight = svgHeight - margin.top - margin.bottom

  const svg = d3.select(document.body).append('svg').attr('width', svgWidth).attr('height', svgHeight)
  const graph = svg.append('g')
    .attr('width', graphWidth)
    .attr('height', graphHeight)
    .attr('transform', `translate(${margin.left}, ${margin.top})`)

  const x = d3.scaleTime()
    .range([0, graphWidth])

  const y = d3.scaleLinear().range([graphHeight, 0])

  // Debug the parsed dates and scale domains
  const parseDate = d3.isoParse
  const parsedDates = data.map(d => parseDate(d.date))
  x.domain(d3.extent(parsedDates as any) as any)
  y.domain([0, d3.max(data, d => d[key]) || 0])

  const line = d3.line<typeof data[0]>()
    .x((d) => {
      const date = parseDate(d.date)!
      return x(date!)
    })
    .y((d) => {
      return y(d[key])
    })
    .curve(d3.curveBasis)

  const stroke = colors[key]

  graph.append('path')
    .datum(data)
    .attr('d', line)
    .attr('stroke', stroke)
    .attr('stroke-width', 2)
    .attr('fill', 'none')

  // X axis
  graph.append('g')
    .attr('transform', `translate(0, ${graphHeight})`)
    .call(d3.axisBottom(x)
      .tickFormat(d => d3.timeFormat('%Y-%m-%d')(d as any) as any),
    )
  // Rotate x-axis labels
  graph.selectAll('.tick text')
    .attr('transform', 'rotate(-75)')
    .style('text-anchor', 'end')
    .attr('dx', '-.8em')
    .attr('dy', '.15em')

  // Y axis
  graph.append('g')
    .call(d3.axisLeft(y))

  // Convert HTML SVG to proper SVG string with XML declaration and namespace
  const svgElement = virtualDOM.window.document.querySelector('svg')
  if (!svgElement) {
    return { data: null, error: 'No SVG element found' }
  }

  // Add required SVG namespace
  svgElement.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  svgElement.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink')

  // Create XML declaration and SVG string
  const xmlDeclaration = '<?xml version="1.0" encoding="UTF-8" standalone="no"?>'
  const svgString = `${xmlDeclaration}\n${svgElement.outerHTML}`
  // const svgString = virtualDOM.window.document.body.innerHTML;

  return { data: svgString, error: null } // Added missing return statement
}

async function getBundleUsageGraph(appId: string, from: Date, to: Date, supabase: ReturnType<typeof supabaseAdmin>) {
  const { data, error } = await getBundleUsage(appId, from, to, false, supabase)
  if (error)
    return { data: null, error }

  // const window = svgdom.createSVGWindow();
  const virtualDOM = new JSDOM('<html><body></body></html>', { pretendToBeVisual: true });
  (globalThis as any).document = virtualDOM.window.document

  const svgWidth = 700
  const svgHeight = 700

  const margin = { top: 20, right: 20, bottom: 70, left: 120 }
  const graphWidth = svgWidth - margin.left - margin.right
  const graphHeight = svgHeight - margin.top - margin.bottom

  const svg = d3.select(document.body).append('svg').attr('width', svgWidth).attr('height', svgHeight)
  const graph = svg.append('g')
    .attr('width', graphWidth)
    .attr('height', graphHeight)
    .attr('transform', `translate(${margin.left}, ${margin.top})`)

  const x = d3.scaleTime()
    .range([0, graphWidth])

  const y = d3.scaleLinear().range([graphHeight, 0])
  // X scale domain
  // Parse dates from strings using d3's timeParse
  const parseDate = d3.timeParse('%Y-%m-%d')
  const parsedDates = data.labels.map(dateStr => parseDate(dateStr))
  x.domain(d3.extent(parsedDates as any) as any)
  // x.domain(d3.extent(data.versionStats.labels, d => d) as [Date, Date]);

  // Y scale domain
  y.domain([0, 100])
  y.ticks(10)

  const datasets = data.datasets.map((d) => {
    return d.data.map((x, i) => {
      return {
        date: parseDate(data.labels[i])!,
        value: x,
      }
    })
  })

  const line = d3.line<typeof datasets[0][0]>()
    .x(d => x(d.date))
    .y(d => y(d.value))
    .curve(d3.curveBasis)

  const linesHashSet = new Set<string>()

  // First pass: create texts and find max width
  const legendItems = datasets.map((dataset, i) => {
    function RNG(seed: number) {
      const m = 2 ** 35 - 31
      const a = 185852
      let s = seed % m
      return function () {
        return (s = s * a % m) / m
      }
    }
    function crc32(str: string) {
      let crc = -1
      for (let i = 0; i < str.length; i++) {
        const byte = str.charCodeAt(i)
        crc = crc ^ byte
        for (let j = 0; j < 8; j++) {
          const mask = -(crc & 1)
          crc = (crc >>> 1) ^ (0xEDB88320 & mask)
        }
      }
      return ~crc >>> 0
    }
    const seed = crc32(data.datasets[i].label.toString())

    const random = RNG(seed)()
    const stroke = `hsl(${random * 360}, 70%, 50%)`

    const legendGroup = svg.append('g')
      .attr('transform', `translate(${margin.left - 40}, ${margin.top})`)

    const legendText = legendGroup.append('text')
      .attr('x', 0)
      .attr('y', i * 20)
      .attr('dy', '0.35em')
      .attr('text-anchor', 'end')
      .style('font-size', '12px')
      .style('fill', stroke)
      .text(data.datasets[i].label)

    // Polyfill getComputedTextLength for JSDOM environment
    if (!legendText.node()!.getComputedTextLength) {
      const textContent = legendText.text()
      legendText.node()!.getComputedTextLength = () => {
        return textContent.split('').reduce((width, char) => {
          // Reduced all widths by ~25%
          if (/[mw]/i.test(char))
            return width + 7.5 // Was 10
          if (/[A-LN-VXYZ0-9]/.test(char))
            return width + 6.75 // Was 8
          if (/[il1.]/.test(char))
            return width + 3 // Was 4
          return width + 4.5 // Was 6
        }, 0)
      }
    }

    return {
      group: legendGroup,
      text: legendText,
      stroke,
      width: legendText.node()!.getComputedTextLength(),
    }
  })

  // Find maximum text width
  const maxTextWidth = Math.max(...legendItems.map(item => item.width))

  // Second pass: add circles using consistent positioning
  legendItems.forEach((item) => {
    item.group.append('circle')
      .attr('cx', -maxTextWidth - 10)
      .attr('cy', legendItems.indexOf(item) * 20)
      .attr('r', 4)
      .style('fill', item.stroke)
  })

  // Now continue with the rest of your dataset forEach loop
  datasets.forEach((dataset, i) => {
    const stroke = legendItems[i].stroke // Use the same color as legend
    const key = dataset.map(d => `${d.date.toISOString()}=${d.value}`).join('$')
    const hasKey = linesHashSet.has(key)

    // const yOffset = hasKey ? 10 : 0;
    // graph.append("g")
    //   .attr("transform", `translate(0, ${yOffset})`)
    //   .append("path")
    //   .datum(dataset)
    //   .attr("d", line)
    //   .attr("stroke", stroke)
    //   .attr("stroke-width", 2)
    //   .attr("fill", "none");
    // // Skip the original graph.append("path") after this insert
    // continue;
    if (hasKey) {
      // If line exists, create offset version
      // Get points along the line path
      // Create a line generator with curveBasis for getting smooth points
      const smoothLine = d3.line<typeof dataset[0]>()
        .x(d => x(d.date))
        .y(d => y(d.value))
        .curve(d3.curveBasis)

      // Create a temporary SVG path to get the points along the curved line
      const tempPath = d3.create('svg')
        .append('path')
        .attr('d', smoothLine(dataset))

      // Replace the polyfill section with:
      if (!tempPath.node()?.getTotalLength) {
        const pathNode = tempPath.node()!
        // eslint-disable-next-line new-cap
        const properties = new svgPathProperties(pathNode.getAttribute('d')!)
        pathNode.getTotalLength = () => properties.getTotalLength()
        pathNode.getPointAtLength = (distance: number): DOMPoint => {
          const point = properties.getPointAtLength(distance)
          return Object.assign(point, {
            x: point.x,
            y: point.y,
            w: 0,
            z: 0,
            matrixTransform: () => null as any,
            toJSON: () => ({ x: point.x, y: point.y }),
          })
        }
      }

      const pathLength = tempPath.node()!.getTotalLength()
      const numPoints = dataset.length * 20 // More points for smoother curve
      const smoothPathPoints = Array.from({ length: numPoints }, (_, i) => {
        const point = tempPath.node()!.getPointAtLength(pathLength * i / (numPoints - 1))
        return {
          x: point.x,
          y: point.y,
        }
      })

      const finalSmoothPathPoints = smoothPathPoints.reduceRight((acc, p) => {
        if (acc.length === 0) {
          acc.push({
            x: p.x,
            y: p.y,
            mX: p.x,
            mY: p.y,
          })
        }
        else {
          const lastPoint = acc[acc.length - 1]

          if (lastPoint.y === p.y) {
            return acc
          }
          const sX = (p.x + lastPoint.x) / 2
          const sY = (p.y + lastPoint.y) / 2

          // Calculate points 5 units away from S(sX, sY)
          const angle = Math.atan2(lastPoint.y - p.y, lastPoint.x - p.x)
          const perpendicular = angle + Math.PI / 2

          const point2 = {
            x: sX - 5 * Math.cos(perpendicular),
            y: sY - 5 * Math.sin(perpendicular),
          }

          acc.push({
            x: p.x,
            y: p.y,
            mX: point2.x,
            mY: point2.y,
          })
        }

        return acc
      }, [] as { x: number, y: number, mX: number, mY: number }[]).map(p => ({
        x: p.mX,
        y: p.mY,
      }))

      // Create a line generator for offset points
      const offsetLine = d3.line<{ x: number, y: number }>()
        .x(d => d.x)
        .y(d => d.y)
        // .curve(d3.curveBasis);

      // Draw the offset path
      graph.append('path')
        .datum(finalSmoothPathPoints)
        .attr('d', offsetLine) // Type assertion needed due to d3 typing limitations
        .attr('stroke', stroke)
        .attr('stroke-width', 5)
        .attr('fill', 'none')

      // graph.append("path")
      //   .datum(dataset)
      //   .attr("d", line)
      //   .attr("stroke", stroke)
      //   .attr("stroke-width", 5)
      //   .attr("fill", "none");
    }
    else {
      graph.append('path')
        .datum(dataset)
        .attr('d', line)
        .attr('stroke', stroke)
        .attr('stroke-width', 5)
        .attr('fill', 'none')
    }

    linesHashSet.add(key)
  })

  // graph.append("path")
  //   .datum(data)
  //   .attr("d", line)
  //   .attr("stroke", "#0099ff")
  //   .attr("stroke-width", 2)
  //   .attr("fill", "none");

  // X axis
  graph.append('g')
    .attr('transform', `translate(0, ${graphHeight})`)
    .call(d3.axisBottom(x)
      .tickFormat(d => d3.timeFormat('%Y-%m-%d')(d as any) as any),
    )
  // Rotate x-axis labels
  graph.selectAll('.tick text')
    .attr('transform', 'rotate(-75)')
    .style('text-anchor', 'end')
    .attr('dx', '-.8em')
    .attr('dy', '.15em')

  // Y axis
  graph.append('g')
    .call(d3.axisLeft(y))

  // Convert HTML SVG to proper SVG string with XML declaration and namespace
  const svgElement = virtualDOM.window.document.querySelector('svg')
  if (!svgElement) {
    return { data: null, error: 'No SVG element found' }
  }

  // Add required SVG namespace
  svgElement.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  svgElement.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink')

  // Create XML declaration and SVG string
  const xmlDeclaration = '<?xml version="1.0" encoding="UTF-8" standalone="no"?>'
  const svgString = `${xmlDeclaration}\n${svgElement.outerHTML}`
  // const svgString = virtualDOM.window.document.body.innerHTML;

  return { data: svgString, error: null } // Added missing return statement
}

function getDaysBetweenDates(firstDate: Date, secondDate: Date) {
  const oneDay = 24 * 60 * 60 * 1000
  const res = Math.round(Math.abs((firstDate.valueOf() - secondDate.valueOf()) / oneDay))
  return res
}
