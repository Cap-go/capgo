import type { Context } from 'hono'
import { cloudlog, cloudlogErr } from './logging.ts'
import { closeClient, getPgClient } from './pg.ts'
import { getEnv } from './utils.ts'

// Builder analytics for the admin dashboard. Live (no cache):
//  - Onboarding funnel / AI usage / per-org journeys come from PostHog (HogQL).
//  - Build outcomes / failures / durations come from Postgres (build_requests/build_logs).
// PostHog is read via a personal API key in POSTHOG_READ_KEY; if unset, the PostHog-derived
// sections come back empty and the Postgres build sections still populate.

// ----------------------------------------------------------------- onboarding model

interface Milestone { key: string, label: string, steps: string[] }

const MILESTONES: Milestone[] = [
  { key: 'start', label: 'Started', steps: ['welcome', 'resume-prompt'] },
  { key: 'method', label: 'Setup method chosen', steps: ['setup-method-select', 'p8-method-select', 'keystore-method-select', 'service-account-method-select', 'android-package-select'] },
  { key: 'credentials', label: 'Credentials provided', steps: ['input-issuer-id', 'input-key-id', 'api-key-instructions', 'verifying-key', 'credentials-exist', 'saving-credentials', 'creating-certificate', 'creating-profile', 'import-scanning', 'detecting-ci-secrets', 'backing-up'] },
  { key: 'build-requested', label: 'Build requested', steps: ['ask-build', 'requesting-build'] },
  { key: 'build-complete', label: 'Build complete', steps: ['build-complete', 'verify-app'] },
]
const TERMINAL_STEP = 'build-complete'
const AI_STEPS = new Set(['ai-analysis-prompt', 'ai-analysis-result', 'ai-analysis-running', 'ai-analysis-result-scroll'])
const FIRST_STEPS = new Set(['welcome', 'resume-prompt', 'setup-method-select'])
const GAP_MS = 30 * 60 * 1000

const STEP_TO_MILESTONE = new Map<string, number>()
MILESTONES.forEach((m, i) => m.steps.forEach(s => STEP_TO_MILESTONE.set(s, i)))

interface OnbEvent { ts: number, appId: string, orgId: string, platform: string, step: string, journeyId: string, errorCategory: string }
interface Journey { appId: string, orgId: string, platform: string, startedAt: number, endedAt: number, steps: string[], milestone: number, completed: boolean, lastStep: string, usedAi: boolean }

function sessionize(events: OnbEvent[]): Journey[] {
  const byKey = new Map<string, OnbEvent[]>()
  for (const e of events) {
    const key = e.journeyId ? `j:${e.journeyId}` : `a:${e.appId}`
    if (!byKey.has(key))
      byKey.set(key, [])
    byKey.get(key)!.push(e)
  }
  const out: Journey[] = []
  for (const [key, evs] of byKey) {
    evs.sort((a, b) => a.ts - b.ts)
    const synthetic = key.startsWith('a:')
    let bucket: OnbEvent[] = []
    let prevTs = 0
    let advanced = false
    const flush = () => {
      if (bucket.length)
        out.push(buildJourney(bucket))
      bucket = []
    }
    for (const e of evs) {
      const isFirst = e.step && FIRST_STEPS.has(e.step)
      const gap = prevTs && e.ts - prevTs > GAP_MS
      if (synthetic && bucket.length && (gap || (isFirst && advanced))) {
        flush()
        advanced = false
      }
      bucket.push(e)
      if (e.step && !FIRST_STEPS.has(e.step))
        advanced = true
      prevTs = e.ts
    }
    flush()
  }
  return out
}

function buildJourney(evs: OnbEvent[]): Journey {
  const first = evs[0]
  const steps = [...new Set(evs.map(e => e.step).filter(Boolean))]
  let milestone = -1
  for (const s of steps) {
    const idx = STEP_TO_MILESTONE.get(s)
    if (idx !== undefined && idx > milestone)
      milestone = idx
  }
  const stepEvents = evs.filter(e => e.step)
  return {
    appId: first.appId,
    orgId: first.orgId,
    platform: first.platform || 'unknown',
    startedAt: first.ts,
    endedAt: evs[evs.length - 1].ts,
    steps,
    milestone,
    completed: steps.includes(TERMINAL_STEP),
    lastStep: stepEvents[stepEvents.length - 1]?.step || first.step || '',
    usedAi: steps.some(s => AI_STEPS.has(s)),
  }
}

// ----------------------------------------------------------------- PostHog (HogQL)

function sqlStr(v: string): string {
  return `'${v.replace(/'/g, '\'\'')}'`
}

async function hogql(c: Context, query: string): Promise<Record<string, unknown>[]> {
  const key = getEnv(c, 'POSTHOG_READ_KEY')
  if (!key)
    return []
  const host = (getEnv(c, 'POSTHOG_READ_HOST') || 'https://eu.posthog.com').replace(/\/$/, '')
  const project = getEnv(c, 'POSTHOG_READ_PROJECT_ID') || '22029'
  try {
    const res = await fetch(`${host}/api/projects/${project}/query/`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: { kind: 'HogQLQuery', query } }),
    })
    if (!res.ok) {
      cloudlogErr({ requestId: c.get('requestId'), message: 'posthog_query_failed', status: res.status })
      return []
    }
    const json = await res.json() as { columns?: string[], results?: unknown[][] }
    const cols = json.columns ?? []
    return (json.results ?? []).map((row) => {
      const obj: Record<string, unknown> = {}
      cols.forEach((col, i) => { obj[col] = row[i] })
      return obj
    })
  }
  catch (e) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'posthog_query_error', error: (e as Error).message })
    return []
  }
}

const num = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}
const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v))

async function loadOnboardingEvents(c: Context, start: string, end: string): Promise<OnbEvent[]> {
  const q = `
    SELECT
      toUnixTimestamp(timestamp) AS ts,
      properties.app_id AS app_id,
      properties.org_id AS org_id,
      properties.platform AS platform,
      JSONExtractString(toString(properties), 'step') AS step,
      JSONExtractString(toString(properties), 'journey_id') AS journey_id,
      properties.error_category AS error_category
    FROM events
    WHERE event IN ('Builder Onboarding Step', 'Builder Onboarding Action')
      AND timestamp >= parseDateTimeBestEffort(${sqlStr(start)})
      AND timestamp <= parseDateTimeBestEffort(${sqlStr(end)})
    ORDER BY timestamp ASC
    LIMIT 200000`
  const rows = await hogql(c, q)
  return rows.map(r => ({
    ts: num(r.ts) * 1000,
    appId: str(r.app_id),
    orgId: str(r.org_id),
    platform: str(r.platform),
    step: str(r.step),
    journeyId: str(r.journey_id),
    errorCategory: str(r.error_category),
  }))
}

async function loadAiChoiceCount(c: Context, start: string, end: string): Promise<number> {
  const q = `
    SELECT count(DISTINCT properties.org_id) AS orgs
    FROM events
    WHERE event = 'CLI AI Build Analysis Choice'
      AND JSONExtractString(toString(properties), 'choice') IN ('capgo_ai', 'local_ai')
      AND timestamp >= parseDateTimeBestEffort(${sqlStr(start)})
      AND timestamp <= parseDateTimeBestEffort(${sqlStr(end)})`
  const rows = await hogql(c, q)
  return rows.length ? num(rows[0].orgs) : 0
}

// ----------------------------------------------------------------- error fingerprint

function fingerprint(raw: string): { fp: string, title: string } {
  const firstLine = (raw || '').split('\n')[0].trim()
  let norm = firstLine.toLowerCase()
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<uuid>')
    .replace(/\/[^\s'"]+/g, '<path>')
    .replace(/0x[0-9a-f]+/gi, '<hex>')
    .replace(/\b\d+(\.\d+)?\b/g, '<n>')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160)
  let h = 5381
  for (let i = 0; i < norm.length; i++) h = (h * 33) ^ norm.charCodeAt(i)
  return { fp: (h >>> 0).toString(16), title: firstLine.slice(0, 140) }
}

// ----------------------------------------------------------------- main

const DAY = 86_400_000

function dayKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

interface BuildRow { appId: string, ownerOrg: string, platform: string, status: string, lastError: string | null, aiAnalyzed: boolean, createdMs: number }

export async function getAdminBuilderAnalytics(c: Context, startDate: string, endDate: string) {
  const nowMs = Date.now()
  const startMs = Date.parse(startDate)

  // --- PostHog onboarding ---
  const events = await loadOnboardingEvents(c, startDate, endDate)
  const journeys = sessionize(events).filter(j => j.startedAt >= startMs)
  const aiOrgs = await loadAiChoiceCount(c, startDate, endDate)

  const starts = journeys.length
  const completions = journeys.filter(j => j.completed).length

  // Funnel (furthest milestone reached).
  const reached = MILESTONES.map(() => 0)
  for (const j of journeys) {
    for (let i = 0; i <= j.milestone; i++) reached[i]++
  }
  const funnel = MILESTONES.map((m, i) => {
    const prev = i === 0 ? reached[0] : reached[i - 1]
    return {
      key: m.key,
      label: m.label,
      reached: reached[i],
      drop_pct: prev > 0 ? ((prev - reached[i]) / prev) * 100 : 0,
      of_start_pct: reached[0] > 0 ? (reached[i] / reached[0]) * 100 : 0,
    }
  })

  // Quit-by-last-step (abandoned journeys).
  const quitMap = new Map<string, number>()
  for (const j of journeys) {
    if (!j.completed)
      quitMap.set(j.lastStep || '(unknown)', (quitMap.get(j.lastStep || '(unknown)') || 0) + 1)
  }
  const quit_steps = [...quitMap.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count).slice(0, 15)

  // Onboarding error categories.
  const onbErrMap = new Map<string, number>()
  for (const e of events) {
    if (e.errorCategory)
      onbErrMap.set(e.errorCategory, (onbErrMap.get(e.errorCategory) || 0) + 1)
  }
  const onboarding_error_categories = [...onbErrMap.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count)

  // --- Postgres builds ---
  let builds: BuildRow[] = []
  const pgClient = getPgClient(c, true)
  try {
    const res = await pgClient.query(
      `SELECT app_id, owner_org, platform, status, last_error, ai_analyzed,
         (extract(epoch from created_at) * 1000)::bigint AS created_ms
       FROM build_requests WHERE created_at >= $1 AND created_at <= $2 ORDER BY created_at ASC`,
      [startDate, endDate],
    )
    builds = res.rows.map((r: Record<string, unknown>) => ({
      appId: str(r.app_id),
      ownerOrg: str(r.owner_org),
      platform: str(r.platform),
      status: str(r.status),
      lastError: r.last_error == null ? null : String(r.last_error),
      aiAnalyzed: r.ai_analyzed === true,
      createdMs: num(r.created_ms),
    }))

    // Org names for the orgs that onboarded or built.
    const orgIds = [...new Set([...journeys.map(j => j.orgId), ...builds.map(b => b.ownerOrg)].filter(Boolean))]
    const names: Record<string, string> = {}
    if (orgIds.length) {
      const nameRes = await pgClient.query('SELECT id::text AS id, name FROM orgs WHERE id::text = ANY($1::text[])', [orgIds])
      for (const r of nameRes.rows as Record<string, unknown>[]) names[str(r.id)] = str(r.name) || str(r.id)
    }

    // Build outcomes.
    const ok = builds.filter(b => b.status === 'succeeded').length
    const failed = builds.filter(b => b.status === 'failed').length
    const STATUSES = ['succeeded', 'failed', 'expired', 'cancelled', 'starting']
    const status_breakdown = STATUSES.map(s => ({ key: s, count: builds.filter(b => b.status === s).length }))

    // Daily outcomes.
    const dayMap = new Map<string, { succeeded: number, failed: number }>()
    for (let t = startMs; t <= nowMs; t += DAY) dayMap.set(dayKey(t), { succeeded: 0, failed: 0 })
    for (const b of builds) {
      const d = dayMap.get(dayKey(b.createdMs))
      if (!d)
        continue
      if (b.status === 'succeeded')
        d.succeeded++
      else if (b.status === 'failed')
        d.failed++
    }
    const builds_daily = [...dayMap.entries()].map(([date, v]) => ({ date, succeeded: v.succeeded, failed: v.failed }))

    // Failure groups + new-in-3-days (from last_error; novelty derived within window).
    const groups = new Map<string, { title: string, count: number, firstMs: number }>()
    for (const b of builds) {
      if (b.status !== 'failed' || !b.lastError)
        continue
      const { fp, title } = fingerprint(b.lastError)
      const g = groups.get(fp)
      if (g) {
        g.count++
        g.firstMs = Math.min(g.firstMs, b.createdMs)
      }
      else {
        groups.set(fp, { title, count: 1, firstMs: b.createdMs })
      }
    }
    const error_groups = [...groups.values()]
      .map(g => ({ title: g.title, count: g.count, is_new: g.firstMs >= nowMs - 3 * DAY }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 40)

    // Per-org rollup.
    const orgAgg = new Map<string, { attempts: number, completed: number, usedAi: boolean, builds: number, buildsFailed: number, lastSeen: number }>()
    for (const j of journeys) {
      const id = j.orgId || `app:${j.appId}`
      const a = orgAgg.get(id) || { attempts: 0, completed: 0, usedAi: false, builds: 0, buildsFailed: 0, lastSeen: 0 }
      a.attempts++
      if (j.completed)
        a.completed++
      if (j.usedAi)
        a.usedAi = true
      a.lastSeen = Math.max(a.lastSeen, j.endedAt)
      orgAgg.set(id, a)
    }
    for (const b of builds) {
      const a = orgAgg.get(b.ownerOrg)
      if (!a)
        continue
      a.builds++
      if (b.status === 'failed')
        a.buildsFailed++
    }
    const orgs = [...orgAgg.entries()].map(([id, a]) => ({
      org_id: id,
      org_name: names[id] || (id.startsWith('app:') ? id.slice(4) : id),
      attempts: a.attempts,
      completed: a.completed,
      succeeded: a.completed > 0,
      used_ai: a.usedAi,
      builds: a.builds,
      builds_failed: a.buildsFailed,
      last_seen: a.lastSeen,
    })).sort((x, y) => y.last_seen - x.last_seen).slice(0, 200)

    cloudlog({ requestId: c.get('requestId'), message: 'builder_analytics computed', journeys: starts, builds: builds.length })

    return {
      kpis: {
        onboarding_starts: starts,
        completions,
        completion_rate: starts > 0 ? (completions / starts) * 100 : 0,
        builds_total: builds.length,
        builds_succeeded: ok,
        builds_failed: failed,
        build_success_rate: builds.length > 0 ? (ok / builds.length) * 100 : 0,
        ai_orgs: aiOrgs,
        journeys_used_ai: journeys.filter(j => j.usedAi).length,
      },
      funnel,
      quit_steps,
      builds_daily,
      status_breakdown,
      errors: {
        failed_builds: failed,
        groups: error_groups,
        new_count: error_groups.filter(g => g.is_new).length,
        onboarding_error_categories,
      },
      orgs,
      posthog_connected: events.length > 0 || starts > 0,
    }
  }
  finally {
    if (pgClient)
      await closeClient(c, pgClient)
  }
}
