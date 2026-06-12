/*
 * Backfill usage credit ledger PostHog events from public.usage_credit_transactions.
 *
 * Dry-run the past 90 days:
 *   bun run admin:backfill-credit-usage-posthog
 *
 * Send events for the past 90 days:
 *   bun run admin:backfill-credit-usage-posthog --apply
 *
 * Send a specific range:
 *   bun run admin:backfill-credit-usage-posthog --apply --from=2026-03-01 --to=2026-06-01
 *
 * Reuse a run marker across retries:
 *   bun run admin:backfill-credit-usage-posthog --apply --backfill-run-id=credits-2026-q2
 */
import process from 'node:process'
import type { UsageOverageEventRow } from '../supabase/functions/_backend/utils/credit_usage_posthog.ts'
import { buildCreditUsagePosthogEventInput, getCreditUsageSourceRefOverageEventId } from '../supabase/functions/_backend/utils/credit_usage_posthog.ts'
import { DEFAULT_ENV_FILE, createSupabaseServiceClient, getArgValue, getRequiredEnv, loadEnv, parsePositiveInteger } from './admin_stripe_backfill_utils.ts'

const DEFAULT_DAYS = 90
const DEFAULT_BATCH_SIZE = 500
const DEFAULT_POSTHOG_CAPTURE_URL = 'https://eu.i.posthog.com/capture/'

function printHelp() {
  console.log(`Backfill usage credit ledger events into PostHog.

Usage:
  bun run admin:backfill-credit-usage-posthog [options]

Options:
  --apply              Send events to PostHog. Without this, dry-run only.
  --days=N             Look back N days when --from is not supplied. Default: ${DEFAULT_DAYS}.
  --from=YYYY-MM-DD    Start occurred_at date, inclusive.
  --to=YYYY-MM-DD      End occurred_at date, exclusive. Default: now.
  --org-id=UUID        Limit to one organization.
  --limit=N            Stop after N transactions.
  --batch-size=N       Supabase page size. Default: ${DEFAULT_BATCH_SIZE}.
  --backfill-run-id=ID Mark all emitted events with this run id. Defaults to a generated id.
  --env-file=PATH      Env file to load. Default: ${DEFAULT_ENV_FILE}.
  --help               Show this help.

Required env:
  SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SERVICE_KEY

Required for --apply:
  POSTHOG_API_KEY

Optional env:
  POSTHOG_API_HOST     Defaults to ${DEFAULT_POSTHOG_CAPTURE_URL}
`)
}

function parseDate(value: string, label: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime()))
    throw new Error(`${label} must be a valid date`)
  return date
}

function normalizePosthogCaptureUrl(host: string | undefined) {
  const resolvedHost = host?.trim() || DEFAULT_POSTHOG_CAPTURE_URL
  return resolvedHost.endsWith('/capture/')
    ? resolvedHost
    : new URL('capture/', resolvedHost.endsWith('/') ? resolvedHost : `${resolvedHost}/`).toString()
}

async function sendPosthogEvent(posthogUrl: string, apiKey: string, input: ReturnType<typeof buildCreditUsagePosthogEventInput>) {
  const response = await fetch(posthogUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      distinct_id: input.distinctId,
      event: input.event,
      properties: {
        ...input.tags,
        $groups: input.groups,
        channel: input.channel,
        description: input.description,
      },
      timestamp: input.timestamp,
    }),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`PostHog capture failed: ${response.status} ${body}`)
  }
}

async function main() {
  const args = process.argv.slice(2)
  if (args.includes('--help')) {
    printHelp()
    return
  }

  const envFile = getArgValue(args, '--env-file') ?? DEFAULT_ENV_FILE
  const fileEnv = await loadEnv(envFile)
  const env: Record<string, string | undefined> = { ...fileEnv, ...process.env }
  const apply = args.includes('--apply')
  const days = parsePositiveInteger(getArgValue(args, '--days'), '--days', DEFAULT_DAYS)
  const batchSize = parsePositiveInteger(getArgValue(args, '--batch-size'), '--batch-size', DEFAULT_BATCH_SIZE)
  const limit = getArgValue(args, '--limit') ? parsePositiveInteger(getArgValue(args, '--limit'), '--limit', 0) : null
  const orgId = getArgValue(args, '--org-id')
  const backfillStartedAt = new Date().toISOString()
  const backfillRunId = getArgValue(args, '--backfill-run-id')?.trim()
    || `credit-usage-posthog-${backfillStartedAt.replace(/[:.]/g, '-')}`
  const to = getArgValue(args, '--to') ? parseDate(getArgValue(args, '--to')!, '--to') : new Date()
  const from = getArgValue(args, '--from')
    ? parseDate(getArgValue(args, '--from')!, '--from')
    : new Date(to.getTime() - days * 24 * 60 * 60 * 1000)

  if (from >= to)
    throw new Error('--from must be before --to')

  const supabase = createSupabaseServiceClient(env)
  const posthogApiKey = apply ? getRequiredEnv(env, 'POSTHOG_API_KEY') : ''
  const posthogUrl = normalizePosthogCaptureUrl(env.POSTHOG_API_HOST)
  const fromIso = from.toISOString()
  const toIso = to.toISOString()

  console.log(`${apply ? 'Applying' : 'Dry-running'} usage credit PostHog backfill`)
  console.log(`Backfill run id: ${backfillRunId}`)
  console.log(`Range: ${fromIso} <= occurred_at < ${toIso}`)
  if (orgId)
    console.log(`Org: ${orgId}`)
  console.log(`Batch size: ${batchSize}`)

  let offset = 0
  let seen = 0
  let sent = 0
  let skipped = 0
  const byType = new Map<string, number>()
  const byMetric = new Map<string, number>()

  while (limit === null || seen < limit) {
    const remaining = limit === null ? batchSize : Math.min(batchSize, limit - seen)
    let query = supabase
      .from('usage_credit_transactions')
      .select('*')
      .gte('occurred_at', fromIso)
      .lt('occurred_at', toIso)
      .order('occurred_at', { ascending: true })
      .order('id', { ascending: true })
      .range(offset, offset + remaining - 1)

    if (orgId)
      query = query.eq('org_id', orgId)

    const { data: transactions, error } = await query
    if (error)
      throw new Error(`Failed to fetch usage credit transactions: ${error.message}`)

    if (!transactions || transactions.length === 0)
      break

    const overageIds = Array.from(new Set(
      transactions
        .map(transaction => getCreditUsageSourceRefOverageEventId(transaction.source_ref))
        .filter((id): id is string => !!id),
    ))

    const overageById = new Map<string, UsageOverageEventRow>()
    for (let index = 0; index < overageIds.length; index += batchSize) {
      const ids = overageIds.slice(index, index + batchSize)
      const { data: overageEvents, error: overageError } = await supabase
        .from('usage_overage_events')
        .select('*')
        .in('id', ids)

      if (overageError)
        throw new Error(`Failed to fetch usage overage events: ${overageError.message}`)

      for (const overageEvent of overageEvents ?? [])
        overageById.set(overageEvent.id, overageEvent)
    }

    for (const transaction of transactions) {
      const overageId = getCreditUsageSourceRefOverageEventId(transaction.source_ref)
      const input = buildCreditUsagePosthogEventInput(transaction, overageId ? overageById.get(overageId) ?? null : null, 'backfill')
      input.tags.backfill_range_from = fromIso
      input.tags.backfill_range_to = toIso
      input.tags.backfill_run_id = backfillRunId
      input.tags.backfill_started_at = backfillStartedAt
      seen += 1
      byType.set(String(input.tags.transaction_type), (byType.get(String(input.tags.transaction_type)) ?? 0) + 1)
      byMetric.set(String(input.tags.metric ?? 'none'), (byMetric.get(String(input.tags.metric ?? 'none')) ?? 0) + 1)

      if (!apply) {
        if (seen <= 5)
          console.log('dry-run sample', JSON.stringify({ distinctId: input.distinctId, event: input.event, tags: input.tags, timestamp: input.timestamp }))
        skipped += 1
        continue
      }

      await sendPosthogEvent(posthogUrl, posthogApiKey, input)
      sent += 1
    }

    if (transactions.length < remaining)
      break

    offset += transactions.length
  }

  console.log(JSON.stringify({
    apply,
    by_metric: Object.fromEntries(byMetric.entries()),
    by_type: Object.fromEntries(byType.entries()),
    seen,
    sent,
    skipped,
  }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
