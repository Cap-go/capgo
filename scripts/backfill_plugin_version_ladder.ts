/*
 * Backfill admin plugin version ladder snapshots stored in public.global_stats.
 *
 * Existing rows created before plugin_version_ladder existed contain the column
 * default [] and need a one-time refresh from Cloudflare Analytics Engine.
 * Analytics Engine raw retention limits how far back this can reconstruct data.
 *
 * Dry run, defaulting to the last 30 UTC calendar days:
 *   bun run admin:backfill-plugin-version-ladder
 *
 * Apply a date range:
 *   bun run admin:backfill-plugin-version-ladder --apply --from=2026-04-01 --to=2026-04-30
 *
 * Apply every stored global_stats row with retained Analytics Engine data:
 *   bun run admin:backfill-plugin-version-ladder --apply --all
 */
import type { Database, Json } from '../supabase/functions/_backend/utils/supabase.types.ts'
import process from 'node:process'
import { asyncPool, createSupabaseServiceClient, DEFAULT_ENV_FILE, getArgValue, getRequiredEnv, loadEnv, parsePositiveInteger } from './admin_stripe_backfill_utils.ts'

const DEFAULT_LOOKBACK_DAYS = 30
const DEFAULT_CONCURRENCY = 2
const DEFAULT_PAGE_SIZE = 1000
const DATE_ID_REGEX = /^\d{4}-\d{2}-\d{2}$/
const CLOUDFLARE_SQL_ENDPOINT = 'https://api.cloudflare.com/client/v4'

interface PluginVersionBreakdown {
  [version: string]: number
}

interface PluginVersionTopApp {
  app_id: string
  device_count: number
  share: number
}

interface PluginVersionLadderEntry {
  version: string
  device_count: number
  percent: number
  top_apps: PluginVersionTopApp[]
}

interface PluginBreakdownRow {
  plugin_version: string
  app_id: string
  device_count: number | string
}

interface PluginBreakdownResult {
  version_breakdown: PluginVersionBreakdown
  major_breakdown: PluginVersionBreakdown
  version_ladder: PluginVersionLadderEntry[]
}

type SupabaseClient = ReturnType<typeof createSupabaseServiceClient>
type GlobalStatsRow = Pick<
  Database['public']['Tables']['global_stats']['Row'],
  'date_id' | 'plugin_version_breakdown' | 'plugin_version_ladder'
>

interface BackfillRow {
  changed: boolean
  current_ladder_count: number
  date_id: string
  next_ladder: PluginVersionLadderEntry[]
}

function printHelp() {
  console.log(`Backfill admin plugin version ladder snapshots.

Usage:
  bun run admin:backfill-plugin-version-ladder [options]

Options:
  --apply              Write updates to global_stats. Without this, dry-run only.
  --from=YYYY-MM-DD    First date_id to inspect. Defaults to last 30 days.
  --to=YYYY-MM-DD      Last date_id to inspect. Defaults to today UTC.
  --all                Inspect every global_stats row.
  --refresh-existing   Recompute rows that already have ladder data.
  --concurrency=N      Cloudflare query/update concurrency. Default: ${DEFAULT_CONCURRENCY}.
  --env-file=PATH      Env file to load. Default: ${DEFAULT_ENV_FILE}.
  --help               Show this help.

Required env:
  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CF_ANALYTICS_TOKEN, CF_ACCOUNT_ANALYTICS_ID
`)
}

function getDateId(targetDate = new Date()) {
  return new Date(Date.UTC(targetDate.getUTCFullYear(), targetDate.getUTCMonth(), targetDate.getUTCDate())).toISOString().slice(0, 10)
}

function assertDateId(value: string, label: string) {
  if (!DATE_ID_REGEX.test(value))
    throw new Error(`${label} must use YYYY-MM-DD`)

  const parsed = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value)
    throw new Error(`${label} must be a valid UTC date`)

  return value
}

function getDefaultFromDateId(referenceDate = new Date()) {
  const date = new Date(Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth(), referenceDate.getUTCDate()))
  date.setUTCDate(date.getUTCDate() - DEFAULT_LOOKBACK_DAYS + 1)
  return getDateId(date)
}

function getNextDateId(dateId: string) {
  const date = new Date(`${dateId}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + 1)
  return getDateId(date)
}

function getBackfillWindow(dateId: string) {
  const end = new Date(`${getNextDateId(dateId)}T00:00:00.000Z`)
  const start = new Date(end)
  start.setUTCDate(start.getUTCDate() - 30)

  return { start, end }
}

function formatDateCF(date: string | Date | undefined) {
  const normalizedDate = date instanceof Date ? date : new Date(date ?? '')
  if (Number.isNaN(normalizedDate.getTime()))
    throw new Error('Invalid Cloudflare Analytics date')

  const year = normalizedDate.getUTCFullYear()
  const month = String(normalizedDate.getUTCMonth() + 1).padStart(2, '0')
  const day = String(normalizedDate.getUTCDate()).padStart(2, '0')
  const hours = String(normalizedDate.getUTCHours()).padStart(2, '0')
  const minutes = String(normalizedDate.getUTCMinutes()).padStart(2, '0')
  const seconds = String(normalizedDate.getUTCSeconds()).padStart(2, '0')

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
}

function parseJsonString(value: string) {
  try {
    return JSON.parse(value) as unknown
  }
  catch {
    return null
  }
}

export function parseBreakdown(value: Json | null): Record<string, number> {
  if (!value)
    return {}

  const rawValue = typeof value === 'string' ? parseJsonString(value) : value
  if (!(rawValue && typeof rawValue === 'object') || Array.isArray(rawValue))
    return {}

  return Object.entries(rawValue as Record<string, unknown>).reduce<Record<string, number>>((acc, [version, percent]) => {
    const normalizedPercent = Number(percent) || 0
    if (version && normalizedPercent > 0)
      acc[version] = normalizedPercent
    return acc
  }, {})
}

export function parseLadder(value: Json | null): PluginVersionLadderEntry[] {
  if (!value)
    return []

  const rawValue = typeof value === 'string' ? parseJsonString(value) : value
  if (!Array.isArray(rawValue))
    return []

  return rawValue
    .map((item) => {
      if (!(item && typeof item === 'object'))
        return null

      const entry = item as Record<string, unknown>
      const version = typeof entry.version === 'string' ? entry.version : ''
      const deviceCount = Number(entry.device_count) || 0
      const percent = Number(entry.percent) || 0
      const topApps = Array.isArray(entry.top_apps)
        ? entry.top_apps
            .map((app) => {
              if (!(app && typeof app === 'object'))
                return null

              const appEntry = app as Record<string, unknown>
              const appId = typeof appEntry.app_id === 'string' ? appEntry.app_id : ''
              const appDeviceCount = Number(appEntry.device_count) || 0
              const share = Number(appEntry.share) || 0

              return {
                app_id: appId,
                device_count: appDeviceCount,
                share,
              }
            })
            .filter((app): app is PluginVersionTopApp => !!app && app.app_id.length > 0 && app.device_count > 0)
        : []

      return {
        version,
        device_count: deviceCount,
        percent,
        top_apps: topApps,
      }
    })
    .filter((entry): entry is PluginVersionLadderEntry => !!entry && entry.version.length > 0 && entry.device_count > 0)
}

function normalizeLadderForCompare(ladder: PluginVersionLadderEntry[]) {
  return JSON.stringify(ladder.map(entry => ({
    version: entry.version,
    device_count: entry.device_count,
    percent: Number(entry.percent.toFixed(2)),
    top_apps: entry.top_apps.map(app => ({
      app_id: app.app_id,
      device_count: app.device_count,
      share: Number(app.share.toFixed(2)),
    })),
  })))
}

export function applyStoredPercents(ladder: PluginVersionLadderEntry[], storedBreakdown: Record<string, number>) {
  return ladder.map(entry => ({
    ...entry,
    percent: Number(storedBreakdown[entry.version]) || entry.percent,
  }))
}

export function buildPluginBreakdownResult(result: PluginBreakdownRow[]): PluginBreakdownResult {
  const emptyResult: PluginBreakdownResult = { version_breakdown: {}, major_breakdown: {}, version_ladder: [] }
  if (result.length === 0)
    return emptyResult

  const versionCounts = new Map<string, number>()
  const versionAppCounts = new Map<string, Map<string, number>>()
  for (const row of result) {
    const version = row.plugin_version
    const appId = row.app_id
    const deviceCount = Number(row.device_count) || 0
    if (!(version && appId && deviceCount > 0))
      continue

    versionCounts.set(version, (versionCounts.get(version) || 0) + deviceCount)
    const appCounts = versionAppCounts.get(version) ?? new Map<string, number>()
    appCounts.set(appId, (appCounts.get(appId) || 0) + deviceCount)
    versionAppCounts.set(version, appCounts)
  }

  const total = Array.from(versionCounts.values()).reduce((sum, count) => sum + count, 0)

  if (total === 0)
    return emptyResult

  const version_breakdown: PluginVersionBreakdown = {}
  const majorCounts = new Map<string, number>()

  for (const [version, count] of versionCounts) {
    const percentage = Number(((count / total) * 100).toFixed(2))
    if (percentage > 0)
      version_breakdown[version] = percentage

    const major = version.split('.')[0]
    if (major)
      majorCounts.set(major, (majorCounts.get(major) || 0) + count)
  }

  const major_breakdown: PluginVersionBreakdown = {}
  for (const [major, count] of majorCounts) {
    const percentage = Number(((count / total) * 100).toFixed(2))
    if (percentage > 0)
      major_breakdown[major] = percentage
  }

  const version_ladder = Array.from(versionCounts.entries())
    .sort(([versionA, countA], [versionB, countB]) => countB - countA || versionA.localeCompare(versionB))
    .slice(0, 20)
    .map(([version, count]) => {
      const appCounts = versionAppCounts.get(version) ?? new Map<string, number>()
      const top_apps = Array.from(appCounts.entries())
        .sort(([appA, countA], [appB, countB]) => countB - countA || appA.localeCompare(appB))
        .slice(0, 3)
        .map(([app_id, device_count]) => ({
          app_id,
          device_count,
          share: Number(((device_count / count) * 100).toFixed(2)),
        }))

      return {
        version,
        device_count: count,
        percent: Number(version_breakdown[version]) || 0,
        top_apps,
      }
    })

  return { version_breakdown, major_breakdown, version_ladder }
}

function buildPluginVersionLadderQuery(dateId: string) {
  const { start, end } = getBackfillWindow(dateId)

  return `SELECT
    plugin_version,
    app_id,
    count() AS device_count
  FROM (
    SELECT
      argMax(index1, timestamp) AS app_id,
      argMax(blob3, timestamp) AS plugin_version,
      blob1 AS device_id
    FROM device_info
    WHERE timestamp >= toDateTime('${formatDateCF(start)}')
      AND timestamp < toDateTime('${formatDateCF(end)}')
      AND blob3 != ''
    GROUP BY index1, blob1
  )
  WHERE plugin_version != ''
    AND app_id != ''
  GROUP BY plugin_version, app_id`
}

async function runAnalyticsQuery<T>(env: Record<string, string | undefined>, query: string) {
  const accountId = getRequiredEnv(env, 'CF_ACCOUNT_ANALYTICS_ID')
  const token = getRequiredEnv(env, 'CF_ANALYTICS_TOKEN')
  const response = await fetch(`${CLOUDFLARE_SQL_ENDPOINT}/accounts/${accountId}/analytics_engine/sql`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'text/plain; charset=utf-8',
      'User-Agent': 'Capgo/1.0',
    },
    body: query,
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Cloudflare Analytics query failed (${response.status}): ${body}`)
  }

  const payload = await response.json() as { data?: T[] }
  return payload.data ?? []
}

async function fetchGlobalStatsRows(supabase: SupabaseClient, fromDateId: string | null, toDateId: string | null) {
  const rows: GlobalStatsRow[] = []
  let offset = 0

  while (true) {
    let query = supabase
      .from('global_stats')
      .select('date_id, plugin_version_breakdown, plugin_version_ladder')
      .order('date_id', { ascending: true })
      .range(offset, offset + DEFAULT_PAGE_SIZE - 1)

    if (fromDateId)
      query = query.gte('date_id', fromDateId)
    if (toDateId)
      query = query.lte('date_id', toDateId)

    const { data, error } = await query
    if (error)
      throw error
    if (!data?.length)
      break

    rows.push(...data)
    if (data.length < DEFAULT_PAGE_SIZE)
      break
    offset += DEFAULT_PAGE_SIZE
  }

  return rows
}

async function buildBackfillRow(env: Record<string, string | undefined>, row: GlobalStatsRow, refreshExisting: boolean): Promise<BackfillRow> {
  const currentLadder = parseLadder(row.plugin_version_ladder)
  if (!refreshExisting && currentLadder.length > 0) {
    return {
      changed: false,
      current_ladder_count: currentLadder.length,
      date_id: row.date_id,
      next_ladder: currentLadder,
    }
  }

  const result = await runAnalyticsQuery<PluginBreakdownRow>(env, buildPluginVersionLadderQuery(row.date_id))
  const computedBreakdown = buildPluginBreakdownResult(result)
  const nextLadder = applyStoredPercents(computedBreakdown.version_ladder, parseBreakdown(row.plugin_version_breakdown))
  const changed = nextLadder.length > 0 && normalizeLadderForCompare(currentLadder) !== normalizeLadderForCompare(nextLadder)

  return {
    changed,
    current_ladder_count: currentLadder.length,
    date_id: row.date_id,
    next_ladder: nextLadder,
  }
}

async function updatePluginVersionLadder(supabase: SupabaseClient, row: BackfillRow) {
  const { error } = await supabase
    .from('global_stats')
    .update({ plugin_version_ladder: row.next_ladder as unknown as Json })
    .eq('date_id', row.date_id)

  if (error)
    throw error
}

async function main(args = process.argv.slice(2), runtimeEnv: Record<string, string | undefined> = process.env) {
  if (args.includes('--help')) {
    printHelp()
    return
  }

  const apply = args.includes('--apply')
  const all = args.includes('--all')
  const refreshExisting = args.includes('--refresh-existing')
  const envFile = getArgValue(args, '--env-file') ?? DEFAULT_ENV_FILE
  const concurrency = parsePositiveInteger(getArgValue(args, '--concurrency'), '--concurrency', DEFAULT_CONCURRENCY)
  const fromDateId = all
    ? null
    : assertDateId(getArgValue(args, '--from') ?? getDefaultFromDateId(), '--from')
  const toDateId = all
    ? null
    : assertDateId(getArgValue(args, '--to') ?? getDateId(), '--to')

  if (fromDateId && toDateId && fromDateId > toDateId)
    throw new Error('--from must be before or equal to --to')

  const fileEnv = await loadEnv(envFile)
  const env = {
    ...fileEnv,
    ...runtimeEnv,
  }
  const supabase = createSupabaseServiceClient(env)
  getRequiredEnv(env, 'CF_ANALYTICS_TOKEN')
  getRequiredEnv(env, 'CF_ACCOUNT_ANALYTICS_ID')

  const rows = await fetchGlobalStatsRows(supabase, fromDateId, toDateId)
  const candidateRows = refreshExisting ? rows : rows.filter(row => parseLadder(row.plugin_version_ladder).length === 0)
  const backfillRows: BackfillRow[] = []
  let analyzed = 0

  await asyncPool(concurrency, candidateRows, async (row) => {
    const backfillRow = await buildBackfillRow(env, row, refreshExisting)
    backfillRows.push(backfillRow)
    analyzed++
    if (analyzed % 10 === 0 || analyzed === candidateRows.length)
      console.log(`Analyzed ${analyzed}/${candidateRows.length}`)
  })

  backfillRows.sort((left, right) => left.date_id.localeCompare(right.date_id))
  const changedRows = backfillRows.filter(row => row.changed)
  const emptyAfterAnalyticsRows = backfillRows.filter(row => row.next_ladder.length === 0)

  console.log(`Loaded ${rows.length} global_stats rows`)
  console.log(`Rows analyzed: ${candidateRows.length}`)
  console.log(`Rows needing update: ${changedRows.length}`)
  console.log(`Rows with no retained Analytics Engine ladder data: ${emptyAfterAnalyticsRows.length}`)
  console.log(`Env file: ${envFile}`)
  if (all)
    console.log('Scope: all global_stats rows')
  else
    console.log(`Scope: ${fromDateId} to ${toDateId}`)

  const sampleRows = changedRows.slice(0, 10)
  if (sampleRows.length > 0) {
    console.log('Sample updates:')
    for (const row of sampleRows)
      console.log(`${row.date_id}: ${row.current_ladder_count} -> ${row.next_ladder.length} ladder rows; top=${row.next_ladder[0]?.version ?? 'none'}`)
  }

  if (!apply) {
    console.log('Dry run only. Pass --apply to update global_stats.')
    return
  }

  if (changedRows.length === 0) {
    console.log('Nothing to update.')
    return
  }

  let updated = 0
  await asyncPool(concurrency, changedRows, async (row) => {
    await updatePluginVersionLadder(supabase, row)
    updated++
    if (updated % 10 === 0 || updated === changedRows.length)
      console.log(`Updated ${updated}/${changedRows.length}`)
  })

  console.log(`Done. Updated ${updated}/${changedRows.length} plugin version ladder rows.`)
}

if (import.meta.main)
  await main()
