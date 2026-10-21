import type { Context } from 'hono'
import type { AppOnboardingPatch, AppOnboardingState, AppOnboardingStepId } from '../utils/appOnboarding.ts'
import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import type { Permission } from '../utils/rbac.ts'
import { Hono } from 'hono/tiny'
import { z } from 'zod'
import { emitCommittedAppOnboardingHistory } from '../utils/app_onboarding_posthog.ts'
import { getAppOnboardingStepIds, hasSupportedOtaTodoList, parseAppOnboarding, pickAppOnboardingSource } from '../utils/appOnboarding.ts'
import { tryCompletePendingAppOnboarding } from '../utils/appOnboardingCompletion.ts'
import { persistAuthorizedOnboardingMutation } from '../utils/appOnboardingMutation.ts'
import { parseBody, quickError, useCors } from '../utils/hono.ts'
import { middlewareAuth } from '../utils/hono_middleware.ts'
import { cloudlogErr, serializeError } from '../utils/logging.ts'
import { BUILDER_STEP_IDS, getMissedStepIds } from '../utils/onboardingMissedSteps.ts'
import { appIdSchema } from '../utils/privateAnalyticsValidation.ts'
import { checkPermission } from '../utils/rbac.ts'
import { readDevices, readStats } from '../utils/stats.ts'
import { supabaseWithAuth } from '../utils/supabase.ts'

const bodySchema = z.object({ appId: appIdSchema, N: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER), initial: z.boolean().optional(), includeBilling: z.boolean().optional() })
const skipStepBodySchema = z.object({ appId: appIdSchema, step: z.string().regex(/^(?:ota\.[a-z_]+|builder\.(?:ios|android)\.[a-z_]+)$/) })
type Observations = Partial<Record<'login_cli_mcp' | 'add_channel' | 'run_device' | 'upload_bundle' | 'test_update', boolean>>
type AuthenticatedClient = ReturnType<typeof supabaseWithAuth>
type BillingSummary = { status: 'available', orgId: string, trialEndsAt: string | null, isPaying: boolean, hasCredits: boolean } | { status: 'unavailable' }

async function readBilling(c: Context<MiddlewareKeyVariables>, client: AuthenticatedClient, orgId: string): Promise<BillingSummary> {
  try {
    if (!(await checkPermission(c, 'org.read_billing', { orgId })))
      return { status: 'unavailable' }
    // Use the caller's RLS context and the existing org/customer foreign key.
    // No Stripe call or credit-ledger aggregation is needed for CLI notices.
    const { data, error } = await client.from('orgs').select('has_usage_credits, stripe_info(status, trial_at)').eq('id', orgId).maybeSingle()
    if (error)
      throw error
    if (!data?.stripe_info)
      return { status: 'unavailable' }
    return {
      status: 'available',
      orgId,
      trialEndsAt: data.stripe_info.trial_at,
      // Match is_paying_org and has_usage_credits_org without extra RPCs.
      isPaying: data.stripe_info.status === 'succeeded',
      hasCredits: data.has_usage_credits ?? false,
    }
  }
  catch (error) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'onboarding billing check failed', error: serializeError(error) })
    return { status: 'unavailable' }
  }
}

async function hasPublishedBundle(client: AuthenticatedClient, appId: string) {
  // A version/r2_path can exist before its upload. Require final manifest,
  // a registered external bundle, or positive archive metadata instead.
  const delta = await client.from('app_versions').select('id').eq('app_id', appId).eq('deleted', false).not('name', 'in', '(builtin,unknown)').neq('storage_provider', 'revert_to_builtin').or('manifest_count.gt.0,external_url.neq.').limit(1)
  if (delta.error)
    throw delta.error
  if (delta.data?.length)
    return true
  const archive = await client.from('app_versions').select('id,app_versions_meta!inner(size)').eq('app_id', appId).eq('deleted', false).not('name', 'in', '(builtin,unknown)').neq('storage_provider', 'revert_to_builtin').gt('app_versions_meta.size', 0).limit(1)
  if (archive.error)
    throw archive.error
  return !!archive.data?.length
}

async function hasAppliedBundle(c: Context<MiddlewareKeyVariables>, client: AuthenticatedClient, appId: string, createdAt: string | null) {
  const logs = await readStats(c, { app_id: appId, actions: ['set'], start_date: createdAt ?? undefined, limit: 10 }, false)
  const names = [...new Set(logs.filter(log => log.action === 'set' && log.device_id && log.version_name && !['builtin', 'unknown'].includes(log.version_name)).map(log => log.version_name!))]
  if (!names.length)
    return false
  const versions = await client.from('app_versions').select('id').eq('app_id', appId).in('name', names).neq('storage_provider', 'revert_to_builtin').limit(1)
  if (versions.error)
    throw versions.error
  return !!versions.data?.length
}

// Evidence is gathered outside the lock; merge only the observed milestones into
// the current row, so a concurrent CLI report cannot be overwritten.
function observedProgressPatch(current: AppOnboardingState, observations: Observations, allowedSteps: ReadonlySet<string>, at?: string): AppOnboardingPatch | null {
  if (!hasSupportedOtaTodoList(current) || current.outcome === 'skipped')
    return null
  const canMarkCliStart = observations.login_cli_mcp === true && allowedSteps.has('ota.login_cli_mcp')
  const patch: AppOnboardingPatch = { steps: {}, ...(canMarkCliStart ? { source: 'cli' } : {}) }
  for (const [id, present] of Object.entries(observations) as Array<[keyof Observations, boolean]>) {
    if (allowedSteps.has(`ota.${id}`) && present && current.steps[id]?.status !== 'done')
      patch.steps![id] = { status: 'done', at }
  }
  if (allowedSteps.has('ota.add_channel') && observations.add_channel === false && current.steps.add_channel?.status === 'done')
    patch.steps!.add_channel = { status: 'pending' }
  const sourceChanged = canMarkCliStart && pickAppOnboardingSource(current.source, 'cli') !== current.source
  return Object.keys(patch.steps!).length || sourceChanged ? patch : null
}

export async function persistObservedProgress(c: Context<MiddlewareKeyVariables>, appId: string, observations: Observations) {
  const result = await persistAuthorizedOnboardingMutation(c, appId, {
    requestedSteps: (Object.keys(observations) as Array<keyof Observations>).map(id => `ota.${id}` as const),
    stepOverrides: { 'ota.login_cli_mcp': { permission: 'app.read', authType: 'apikey' } },
    buildPatch: ({ current, allowedSteps, at }) => observedProgressPatch(current, observations, allowedSteps, at),
    afterPersist: tryCompletePendingAppOnboarding,
  })
  if (result)
    await emitCommittedAppOnboardingHistory(c, [result])
  return result?.onboarding
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readBuilderStatuses(currentValue: unknown, platform: keyof typeof BUILDER_STEP_IDS) {
  const setup = isRecord(currentValue) && isRecord(currentValue.setup) ? currentValue.setup : {}
  if (setup.todo_list_version !== 4 || setup.builder_todo_list_version !== '1' || !Array.isArray(setup.paths) || !setup.paths.includes('builder'))
    return null
  const builder = isRecord(setup.steps) && isRecord(setup.steps.builder) ? setup.steps.builder : null
  const steps = builder && isRecord(builder[platform]) ? builder[platform] : null
  if (!steps)
    return null
  return BUILDER_STEP_IDS[platform].map(id => ({ id: id as string, status: isRecord(steps[id]) ? String(steps[id].status) : 'pending' }))
}

// Only a missed step (open while a later one is done) can be skipped, so the
// final proof-of-setup step always has to really happen.
function skipStepPatch(currentValue: unknown, current: AppOnboardingState, step: string, at: string): AppOnboardingPatch | null {
  if (current.outcome === 'skipped')
    return null
  const [path, first, second] = step.split('.')
  if (path === 'ota') {
    if (!hasSupportedOtaTodoList(current))
      return null
    const ids = getAppOnboardingStepIds(current.todo_list_version, current.ota_todo_list_version)
    const missed = getMissedStepIds(ids.map(id => ({ id, status: current.steps[id]?.status })))
    return missed.includes(first as AppOnboardingStepId) ? { steps: { [first!]: { status: 'skipped', at } } } : null
  }
  const platform = first as keyof typeof BUILDER_STEP_IDS
  const statuses = readBuilderStatuses(currentValue, platform)
  if (!statuses || !getMissedStepIds(statuses).includes(second!))
    return null
  const builderSteps: NonNullable<AppOnboardingPatch['builderSteps']> = {}
  builderSteps[`builder.${platform}.${second}`] = { status: 'skipped', at }
  return { builderSteps }
}

export const app = new Hono<MiddlewareKeyVariables>()
app.use('*', useCors)
app.post('/', middlewareAuth({ preferApiKey: true }), async (c) => {
  const parsed = bodySchema.safeParse(await parseBody(c))
  if (!parsed.success)
    throw quickError(400, 'invalid_body', 'Invalid body')
  const { appId, N, initial, includeBilling } = parsed.data
  if (!(await checkPermission(c, 'app.read', { appId })))
    throw quickError(403, 'app_access_denied', 'You cannot access this app')
  const client = supabaseWithAuth(c, c.get('auth')!)
  // Always load this exact app, on every N, even when no extra check is due.
  const { data: row, error } = await client.from('apps').select('onboarding, created_at, owner_org').eq('app_id', appId).single()
  if (error || !row)
    throw quickError(404, 'app_not_found', 'App not found')
  // Start optional billing immediately; it shares neither the observations nor
  // the onboarding write transaction and must not delay progress persistence.
  const billing = includeBilling ? readBilling(c, client, row.owner_org) : undefined
  const current = parseAppOnboarding(row.onboarding)
  const observations: Observations = {}
  const checkErrors: string[] = []
  if (hasSupportedOtaTodoList(current) && c.get('auth')?.authType === 'apikey')
    observations.login_cli_mcp = true
  const due = (slot: number) => initial || N % 5 === slot
  async function check(id: keyof Observations, permission: Permission, action: () => Promise<boolean>) {
    try {
      if (!(await checkPermission(c, permission, { appId })))
        return
      observations[id] = await action()
    }
    catch (error) {
      checkErrors.push(id)
      cloudlogErr({ requestId: c.get('requestId'), message: 'onboarding progress check failed', app_id: appId, step: id, error: serializeError(error) })
    }
  }
  if (due(0)) {
    await check('add_channel', 'app.read', async () => {
      const result = await client.from('channels').select('id').eq('app_id', appId).limit(1)
      if (result.error)
        throw result.error
      return !!result.data?.length
    })
  }
  const observeMilestones = hasSupportedOtaTodoList(current) && current.outcome !== 'skipped'
  if (observeMilestones && due(1) && current.steps.run_device?.status !== 'done') {
    await check('run_device', 'app.read_devices', async () => {
      return (await readDevices(c, { app_id: appId, limit: 1 }, false)).data.some(device => !!device.device_id)
    })
  }
  if (observeMilestones && due(2) && current.steps.upload_bundle?.status !== 'done')
    await check('upload_bundle', 'app.read', () => hasPublishedBundle(client, appId))
  if (observeMilestones && due(3) && current.steps.test_update?.status !== 'done')
    await check('test_update', 'app.read_logs', () => hasAppliedBundle(c, client, appId, row.created_at))
  // Conservatively assume all observed steps are writable for this no-op test.
  // Real changes still recheck permissions and rebuild against the locked row.
  const observedSteps = new Set(Object.keys(observations).map(id => `ota.${id}`))
  const onboarding = observedProgressPatch(current, observations, observedSteps)
    ? await persistObservedProgress(c, appId, observations) ?? row.onboarding
    : row.onboarding
  c.header('Cache-Control', 'no-store')
  return c.json({ onboarding, ...(observations.add_channel !== undefined ? { hasChannel: observations.add_channel } : {}), checkErrors, ...(billing ? { billing: await billing } : {}) })
})

app.post('/skip_step', middlewareAuth({ preferApiKey: true }), async (c) => {
  const parsed = skipStepBodySchema.safeParse(await parseBody(c))
  if (!parsed.success)
    throw quickError(400, 'invalid_body', 'Invalid body')
  const { appId, step } = parsed.data
  if (!(await checkPermission(c, 'app.read', { appId })))
    throw quickError(403, 'app_access_denied', 'You cannot access this app')
  const result = await persistAuthorizedOnboardingMutation(c, appId, {
    requestedSteps: [step as `${string}.${string}`],
    buildPatch: ({ current, currentValue, allowedSteps, at }) => allowedSteps.has(step as `${string}.${string}`)
      ? skipStepPatch(currentValue, current, step, at)
      : null,
    afterPersist: tryCompletePendingAppOnboarding,
  })
  if (!result)
    throw quickError(409, 'step_not_skippable', 'This onboarding step cannot be skipped')
  await emitCommittedAppOnboardingHistory(c, [result])
  c.header('Cache-Control', 'no-store')
  return c.json({ onboarding: result.onboarding })
})
