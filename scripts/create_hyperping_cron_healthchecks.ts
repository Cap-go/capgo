/*
 * Create Hyperping healthchecks for public.cron_tasks and backfill healthcheck_url.
 *
 * Dry run:
 *   bun scripts/create_hyperping_cron_healthchecks.ts --hyperping-api-key=...
 *
 * Apply:
 *   bun scripts/create_hyperping_cron_healthchecks.ts --apply --hyperping-api-key=...
 *
 * Useful filters:
 *   --name=cron_task_name
 *   --limit=10
 *   --include-disabled
 *   --missing-only
 *
 * Grace period:
 *   --grace-period-value and --grace-period-type set the maximum grace period.
 *   Each healthcheck is capped as tightly as Hyperping's minute-level grace
 *   selector allows.
 */
import type { Database } from '../supabase/functions/_backend/utils/supabase.types.ts'
import { mkdir, writeFile } from 'node:fs/promises'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { asyncPool, createSupabaseServiceClient, DEFAULT_ENV_FILE, getArgValue, loadEnv, parsePositiveInteger } from './admin_stripe_backfill_utils.ts'

const DEFAULT_API_BASE_URL = 'https://api.hyperping.io'
const DEFAULT_CONCURRENCY = 3
const DEFAULT_GRACE_PERIOD_TYPE = 'minutes'
const DEFAULT_GRACE_PERIOD_VALUE = 10
const DEFAULT_TIMEZONE = 'UTC'
const FAILURE_OUTPUT = './tmp/hyperping_cron_healthcheck_failures.json'
const PAGE_SIZE = 1000

type PeriodType = 'seconds' | 'minutes' | 'hours' | 'days'

type CronTaskRow = Pick<
  Database['public']['Tables']['cron_tasks']['Row'],
  | 'id'
  | 'name'
  | 'description'
  | 'task_type'
  | 'target'
  | 'batch_size'
  | 'second_interval'
  | 'minute_interval'
  | 'hour_interval'
  | 'run_at_hour'
  | 'run_at_minute'
  | 'run_at_second'
  | 'run_on_dow'
  | 'run_on_day'
  | 'enabled'
  | 'healthcheck_url'
>
type CronTaskUpdate = Database['public']['Tables']['cron_tasks']['Update']

interface HyperpingHealthcheckPayload {
  name: string
  description?: string
  period_value?: number
  period_type?: PeriodType
  grace_period_value: number
  grace_period_type: PeriodType
  cron?: string
  timezone?: string
}

interface HyperpingHealthcheck {
  uuid?: string
  name?: string
  pingUrl?: string
  ping_url?: string
}

interface HyperpingListResponse {
  data?: HyperpingHealthcheck[]
  healthchecks?: HyperpingHealthcheck[]
}

interface HyperpingMutationResponse {
  data?: HyperpingHealthcheck
  healthcheck?: HyperpingHealthcheck
}

interface Candidate {
  grace: string
  row: CronTaskRow
  payload: HyperpingHealthcheckPayload
  schedule: string
}

interface BackfillFailure {
  cronTaskId: number | null
  cronTaskName: string | null
  error: string
  stage: 'build' | 'hyperping' | 'supabase'
}

function parsePeriodType(value: string | null, label: string, fallback: PeriodType) {
  if (value === null)
    return fallback

  if (value === 'seconds' || value === 'minutes' || value === 'hours' || value === 'days')
    return value

  throw new Error(`${label} must be one of: seconds, minutes, hours, days`)
}

function getRequiredArg(value: string | null, label: string) {
  const trimmed = value?.trim()
  if (!trimmed)
    throw new Error(`Missing ${label}`)
  return trimmed
}

function requirePositiveNumber(value: number | null | undefined, label: string): number {
  if (!Number.isInteger(value) || (value as number) < 1)
    throw new Error(`${label} must be a positive integer`)
  return value as number
}

function requireInteger(value: number | null | undefined, label: string): number {
  if (!Number.isInteger(value))
    throw new Error(`${label} must be an integer`)
  return value as number
}

function getPeriodSeconds(value: number, type: PeriodType) {
  switch (type) {
    case 'seconds':
      return value
    case 'minutes':
      return value * 60
    case 'hours':
      return value * 60 * 60
    case 'days':
      return value * 24 * 60 * 60
  }
}

function getPeriodParts(seconds: number): { value: number, type: PeriodType } {
  if (seconds >= 24 * 60 * 60 && seconds % (24 * 60 * 60) === 0) {
    return {
      value: seconds / (24 * 60 * 60),
      type: 'days',
    }
  }
  if (seconds >= 60 * 60 && seconds % (60 * 60) === 0) {
    return {
      value: seconds / (60 * 60),
      type: 'hours',
    }
  }
  if (seconds >= 60 && seconds % 60 === 0) {
    return {
      value: seconds / 60,
      type: 'minutes',
    }
  }
  return {
    value: seconds,
    type: 'seconds',
  }
}

function getGracePeriodParts(cadenceSeconds: number, maxGracePeriodSeconds: number) {
  const cappedGraceSeconds = Math.min(maxGracePeriodSeconds, cadenceSeconds - 1)
  return getPeriodParts(Math.max(60, Math.floor(cappedGraceSeconds / 60) * 60))
}

function getScheduledCadenceSeconds(row: CronTaskRow) {
  if (row.second_interval !== null)
    return requirePositiveNumber(row.second_interval, 'second_interval')
  if (row.minute_interval !== null)
    return requirePositiveNumber(row.minute_interval, 'minute_interval') * 60
  if (row.hour_interval !== null)
    return requirePositiveNumber(row.hour_interval, 'hour_interval') * 60 * 60
  if (row.run_at_minute !== null && row.run_at_hour === null)
    return 60 * 60
  if (row.run_on_day !== null)
    return 28 * 24 * 60 * 60
  if (row.run_on_dow !== null)
    return 7 * 24 * 60 * 60
  if (row.run_at_hour !== null)
    return 24 * 60 * 60

  throw new Error('No supported cron schedule fields found')
}

function formatPeriod(value: number, type: PeriodType) {
  return `${value} ${type}`
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, '')
}

function getHealthcheckName(row: CronTaskRow) {
  return `Capgo cron: ${row.name}`
}

function getHealthcheckDescription(row: CronTaskRow) {
  const description = row.description?.trim()
  return description || undefined
}

function getCronExpression(row: CronTaskRow) {
  const minute = row.run_at_minute ?? 0
  const hour = requireInteger(row.run_at_hour, 'run_at_hour')
  const dayOfMonth = row.run_on_day ?? '*'
  const dayOfWeek = row.run_on_dow ?? '*'

  if (hour < 0 || hour > 23)
    throw new Error(`run_at_hour must be between 0 and 23, got ${hour}`)
  if (minute < 0 || minute > 59)
    throw new Error(`run_at_minute must be between 0 and 59, got ${minute}`)

  return `${minute} ${hour} ${dayOfMonth} * ${dayOfWeek}`
}

function getHourlyCronExpression(row: CronTaskRow) {
  const minute = requireInteger(row.run_at_minute, 'run_at_minute')

  if (minute < 0 || minute > 59)
    throw new Error(`run_at_minute must be between 0 and 59, got ${minute}`)

  return `${minute} * * * *`
}

export function buildHealthcheckPayload(row: CronTaskRow, maxGracePeriodSeconds: number, timezone: string): Candidate {
  const cadenceSeconds = getScheduledCadenceSeconds(row)
  const gracePeriod = getGracePeriodParts(cadenceSeconds, maxGracePeriodSeconds)
  const payload: HyperpingHealthcheckPayload = {
    name: getHealthcheckName(row),
    description: getHealthcheckDescription(row),
    grace_period_value: gracePeriod.value,
    grace_period_type: gracePeriod.type,
  }
  const grace = formatPeriod(gracePeriod.value, gracePeriod.type)

  if (row.second_interval !== null) {
    const periodValue = requirePositiveNumber(row.second_interval, 'second_interval')
    return {
      grace,
      row,
      payload: {
        ...payload,
        period_value: periodValue,
        period_type: 'seconds',
      },
      schedule: `every ${periodValue} seconds`,
    }
  }

  if (row.minute_interval !== null) {
    const periodValue = requirePositiveNumber(row.minute_interval, 'minute_interval')
    return {
      grace,
      row,
      payload: {
        ...payload,
        period_value: periodValue,
        period_type: 'minutes',
      },
      schedule: `every ${periodValue} minutes`,
    }
  }

  if (row.hour_interval !== null) {
    const periodValue = requirePositiveNumber(row.hour_interval, 'hour_interval')
    return {
      grace,
      row,
      payload: {
        ...payload,
        period_value: periodValue,
        period_type: 'hours',
      },
      schedule: `every ${periodValue} hours`,
    }
  }

  if (row.run_at_hour !== null) {
    const cron = getCronExpression(row)
    return {
      grace,
      row,
      payload: {
        ...payload,
        cron,
        timezone,
      },
      schedule: `${cron} ${timezone}`,
    }
  }

  if (row.run_at_minute !== null) {
    const cron = getHourlyCronExpression(row)
    return {
      grace,
      row,
      payload: {
        ...payload,
        cron,
        timezone,
      },
      schedule: `${cron} ${timezone}`,
    }
  }

  throw new Error('No supported cron schedule fields found')
}

async function fetchCronTasks(
  supabase: ReturnType<typeof createSupabaseServiceClient>,
  options: {
    enabledOnly: boolean
    missingOnly: boolean
    name: string | null
  },
) {
  const rows: CronTaskRow[] = []
  let lastSeenId = 0

  while (true) {
    let query = supabase
      .from('cron_tasks')
      .select('id,name,description,task_type,target,batch_size,second_interval,minute_interval,hour_interval,run_at_hour,run_at_minute,run_at_second,run_on_dow,run_on_day,enabled,healthcheck_url')
      .gt('id', lastSeenId)
      .order('id', { ascending: true })
      .limit(PAGE_SIZE)

    if (options.enabledOnly)
      query = query.eq('enabled', true)
    if (options.missingOnly)
      query = query.is('healthcheck_url', null)
    if (options.name)
      query = query.eq('name', options.name)

    const { data, error } = await query
    if (error)
      throw error
    if (!data?.length)
      break

    rows.push(...data)

    if (options.name || data.length < PAGE_SIZE)
      break
    lastSeenId = data.at(-1)?.id ?? lastSeenId
  }

  return rows
}

function getPingUrl(healthcheck: HyperpingHealthcheck) {
  return healthcheck.pingUrl ?? healthcheck.ping_url ?? null
}

function getHealthcheckUuid(healthcheck: HyperpingHealthcheck) {
  if (healthcheck.uuid)
    return healthcheck.uuid

  const pingUrl = getPingUrl(healthcheck)
  if (!pingUrl)
    return null

  return getUuidFromPingUrl(pingUrl)
}

function getUuidFromPingUrl(pingUrl: string) {
  const parsed = new URL(pingUrl)
  return parsed.pathname.split('/').filter(Boolean).at(0) ?? null
}

async function hyperpingRequest<T>(
  apiBaseUrl: string,
  apiKey: string,
  path: string,
  init: Omit<RequestInit, 'headers'> & { headers?: Record<string, string> } = {},
) {
  const response = await fetch(`${trimTrailingSlash(apiBaseUrl)}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      ...init.headers,
    },
  })
  const text = await response.text()

  if (!response.ok) {
    const preview = text.length > 500 ? `${text.slice(0, 500)}...` : text
    throw new Error(`Hyperping ${init.method ?? 'GET'} ${path} failed with ${response.status}: ${preview}`)
  }

  return text ? JSON.parse(text) as T : null as T
}

function parseHealthchecks(response: HyperpingListResponse | HyperpingHealthcheck[]) {
  if (Array.isArray(response))
    return response
  if (Array.isArray(response.healthchecks))
    return response.healthchecks
  if (Array.isArray(response.data))
    return response.data
  return []
}

function parseMutationHealthcheck(response: HyperpingMutationResponse | HyperpingHealthcheck) {
  if ('healthcheck' in response && response.healthcheck)
    return response.healthcheck
  if ('data' in response && response.data)
    return response.data
  return response as HyperpingHealthcheck
}

async function listHealthchecks(apiBaseUrl: string, apiKey: string) {
  const response = await hyperpingRequest<HyperpingListResponse | HyperpingHealthcheck[]>(
    apiBaseUrl,
    apiKey,
    '/v2/healthchecks',
  )
  return parseHealthchecks(response)
}

async function createHealthcheck(apiBaseUrl: string, apiKey: string, payload: HyperpingHealthcheckPayload) {
  const response = await hyperpingRequest<HyperpingMutationResponse | HyperpingHealthcheck>(
    apiBaseUrl,
    apiKey,
    '/v2/healthchecks',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
  )
  return parseMutationHealthcheck(response)
}

async function updateHealthcheck(apiBaseUrl: string, apiKey: string, uuid: string, payload: HyperpingHealthcheckPayload) {
  const response = await hyperpingRequest<HyperpingMutationResponse | HyperpingHealthcheck>(
    apiBaseUrl,
    apiKey,
    `/v2/healthchecks/${uuid}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
  )
  return parseMutationHealthcheck(response)
}

async function updateCronTaskHealthcheckUrl(
  supabase: ReturnType<typeof createSupabaseServiceClient>,
  cronTaskId: number,
  healthcheckUrl: string,
) {
  const update: CronTaskUpdate = {
    healthcheck_url: healthcheckUrl,
    updated_at: new Date().toISOString(),
  }
  const { error } = await supabase
    .from('cron_tasks')
    .update(update)
    .eq('id', cronTaskId)

  if (error)
    throw error
}

async function writeFailures(failures: BackfillFailure[]) {
  if (failures.length === 0)
    return

  await mkdir('./tmp', { recursive: true })
  await writeFile(FAILURE_OUTPUT, `${JSON.stringify(failures, null, 2)}\n`)
  console.log(`Failure details written to ${FAILURE_OUTPUT}`)
}

export async function main(args = process.argv.slice(2), runtimeEnv: Record<string, string | undefined> = process.env) {
  const apply = args.includes('--apply')
  const enabledOnly = !args.includes('--include-disabled')
  const missingOnly = args.includes('--missing-only')
  const envFile = getArgValue(args, '--env-file') ?? DEFAULT_ENV_FILE
  const name = getArgValue(args, '--name')
  const limitArg = getArgValue(args, '--limit')
  const limit = limitArg ? parsePositiveInteger(limitArg, '--limit', 0) : null
  const concurrency = parsePositiveInteger(getArgValue(args, '--concurrency'), '--concurrency', DEFAULT_CONCURRENCY)

  const fileEnv = await loadEnv(envFile)
  const env = {
    ...fileEnv,
    ...runtimeEnv,
  }

  const gracePeriodValue = parsePositiveInteger(getArgValue(args, '--grace-period-value') ?? env.HYPERPING_GRACE_PERIOD_VALUE ?? null, '--grace-period-value', DEFAULT_GRACE_PERIOD_VALUE)
  const gracePeriodType = parsePeriodType(getArgValue(args, '--grace-period-type') ?? env.HYPERPING_GRACE_PERIOD_TYPE ?? null, '--grace-period-type', DEFAULT_GRACE_PERIOD_TYPE)
  const maxGracePeriodSeconds = getPeriodSeconds(gracePeriodValue, gracePeriodType)
  const timezone = getArgValue(args, '--timezone') ?? env.HYPERPING_TIMEZONE?.trim() ?? DEFAULT_TIMEZONE

  const supabase = createSupabaseServiceClient(env)
  const rows = await fetchCronTasks(supabase, {
    enabledOnly,
    missingOnly,
    name,
  })
  const limitedRows = limit ? rows.slice(0, limit) : rows

  const failures: BackfillFailure[] = []
  const candidates: Candidate[] = []
  for (const row of limitedRows) {
    try {
      candidates.push(buildHealthcheckPayload(row, maxGracePeriodSeconds, timezone))
    }
    catch (error) {
      failures.push({
        cronTaskId: row.id,
        cronTaskName: row.name,
        error: error instanceof Error ? error.message : String(error),
        stage: 'build',
      })
    }
  }

  console.log(`Loaded ${rows.length} cron task rows (${candidates.length} ready)`)
  console.log(`Env file: ${envFile}`)
  console.log(`Mode: ${apply ? 'apply' : 'dry run'}`)
  console.log(`Rows: ${enabledOnly ? 'enabled only' : 'enabled and disabled'}, ${missingOnly ? 'missing healthcheck_url only' : 'including existing healthcheck_url values'}`)
  if (name)
    console.log(`Scoped to cron task: ${name}`)
  if (!apply)
    console.log('Dry run only. Pass --apply to create Hyperping healthchecks and update cron_tasks.')

  for (const candidate of candidates)
    console.log(`${candidate.row.id} ${candidate.row.name}: ${candidate.schedule}, grace ${candidate.grace}`)

  const apiKey = getRequiredArg(getArgValue(args, '--hyperping-api-key'), '--hyperping-api-key')
  const apiBaseUrl = env.HYPERPING_API_BASE_URL?.trim() || DEFAULT_API_BASE_URL
  const existingHealthchecks = await listHealthchecks(apiBaseUrl, apiKey)
  const existingByName = new Map(
    existingHealthchecks
      .filter(healthcheck => healthcheck.name)
      .map(healthcheck => [healthcheck.name!, healthcheck]),
  )
  const existingByUuid = new Map(
    existingHealthchecks
      .map(healthcheck => [getHealthcheckUuid(healthcheck), healthcheck] as const)
      .filter((entry): entry is [string, HyperpingHealthcheck] => !!entry[0]),
  )

  console.log(`Loaded ${existingHealthchecks.length} existing Hyperping healthchecks`)

  if (!apply) {
    for (const candidate of candidates) {
      const currentUuid = candidate.row.healthcheck_url ? getUuidFromPingUrl(candidate.row.healthcheck_url) : null
      const existingHealthcheck = (currentUuid ? existingByUuid.get(currentUuid) : undefined) ?? existingByName.get(candidate.payload.name)
      console.log(`${existingHealthcheck ? 'Would update' : 'Would create'} Hyperping healthcheck: ${candidate.row.name}`)
    }

    await writeFailures(failures)
    if (failures.length > 0)
      process.exitCode = 1
    return
  }

  await asyncPool(concurrency, candidates, async (candidate) => {
    try {
      const currentUuid = candidate.row.healthcheck_url ? getUuidFromPingUrl(candidate.row.healthcheck_url) : null
      const existingHealthcheck = (currentUuid ? existingByUuid.get(currentUuid) : undefined) ?? existingByName.get(candidate.payload.name)
      let healthcheck: HyperpingHealthcheck

      if (existingHealthcheck) {
        const uuid = getHealthcheckUuid(existingHealthcheck)
        if (!uuid)
          throw new Error(`Existing Hyperping healthcheck has no uuid or pingUrl: ${candidate.payload.name}`)
        healthcheck = await updateHealthcheck(apiBaseUrl, apiKey, uuid, candidate.payload)
        console.log(`Updated Hyperping healthcheck: ${candidate.row.name}`)
      }
      else {
        healthcheck = await createHealthcheck(apiBaseUrl, apiKey, candidate.payload)
        console.log(`Created Hyperping healthcheck: ${candidate.row.name}`)
      }

      const pingUrl = getPingUrl(healthcheck)
      if (!pingUrl)
        throw new Error(`Hyperping response did not include pingUrl for ${candidate.row.name}`)

      await updateCronTaskHealthcheckUrl(supabase, candidate.row.id, pingUrl)
      console.log(`Updated cron_tasks.healthcheck_url: ${candidate.row.name}`)
    }
    catch (error) {
      failures.push({
        cronTaskId: candidate.row.id,
        cronTaskName: candidate.row.name,
        error: error instanceof Error ? error.message : String(error),
        stage: error instanceof Error && error.message.includes('Hyperping') ? 'hyperping' : 'supabase',
      })
    }
  })

  await writeFailures(failures)
  if (failures.length > 0) {
    process.exitCode = 1
    console.error(`${failures.length} cron task healthcheck backfills failed`)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
