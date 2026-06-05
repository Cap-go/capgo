import type { Context } from 'hono'
import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import type { Database, Json } from '../utils/supabase.types.ts'
import type { CompatibilitySummary, NativePackage, PackageComparison } from '../utils/bundle_compatibility.ts'
import { Hono } from 'hono/tiny'
import { safeParseSchema } from '../utils/ark_validation.ts'
import { compareNativePackages, selectCurrentDeploymentPair, summarizeBundleCompatibility } from '../utils/bundle_compatibility.ts'
import { middlewareAuth, parseBody, simpleError, useCors } from '../utils/hono.ts'
import { middlewareV2 } from '../utils/hono_middleware.ts'
import { cloudlog } from '../utils/logging.ts'
import { appIdSchema, hasControlChars } from '../utils/privateAnalyticsValidation.ts'
import { checkPermission } from '../utils/rbac.ts'
import { supabaseWithAuth } from '../utils/supabase.ts'

type AppVersionRow = Pick<Database['public']['Tables']['app_versions']['Row'], 'id' | 'name' | 'created_at' | 'native_packages'>
type ChannelRow = Pick<Database['public']['Tables']['channels']['Row'], 'id' | 'name' | 'version'>

type BundleCompatibilityReason
  = | 'compatible'
    | 'incompatible'
    | 'no_default_channel'
    | 'default_channel_has_no_bundle'
    | 'current_deployment_not_found'
    | 'previous_deployment_not_found'
    | 'missing_bundle'
    | 'missing_native_packages'

interface BundleSourceDescriptor {
  kind: 'bundle' | 'native_packages'
  id?: number
  name?: string
  nativePackageCount: number
}

interface ResolvedBundleSource {
  source: BundleSourceDescriptor
  nativePackages: NativePackage[] | null
}

interface CompareResponse {
  candidate: BundleSourceDescriptor
  baseline: BundleSourceDescriptor
  comparisons: PackageComparison[]
  summary: CompatibilitySummary
  reason: BundleCompatibilityReason
}

interface CompareBody {
  appId?: unknown
  candidate?: unknown
  baseline?: unknown
}

interface DefaultChannelBody {
  appId?: unknown
}

const MAX_NATIVE_PACKAGES = 1000
const MAX_NATIVE_PACKAGE_FIELD_LENGTH = 512
const MAX_BUNDLE_NAME_LENGTH = 255
const DEPLOYMENT_LOOKBACK_LIMIT = 10

export const app = new Hono<MiddlewareKeyVariables>()

app.use('*', useCors)

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function validateAppId(value: unknown): string {
  const parsed = safeParseSchema(appIdSchema, value)
  if (!parsed.success)
    throw simpleError('invalid_body', 'Invalid body', { error: parsed.error })
  return parsed.data
}

function validateString(value: unknown, label: string, maxLength = MAX_NATIVE_PACKAGE_FIELD_LENGTH): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > maxLength || hasControlChars(value))
    throw simpleError('invalid_body', `Invalid ${label}`)
  return value
}

function validateOptionalString(value: unknown, label: string): string | undefined {
  if (value === undefined || value === null)
    return undefined
  return validateString(value, label)
}

function validateBundleId(value: unknown, label: string): number {
  const numberValue = typeof value === 'string' && /^[1-9]\d*$/.test(value) ? Number(value) : value
  if (typeof numberValue !== 'number' || !Number.isSafeInteger(numberValue) || numberValue <= 0)
    throw simpleError('invalid_body', `Invalid ${label}`)
  return numberValue
}

function normalizeNativePackageArray(value: unknown): unknown {
  if (Array.isArray(value))
    return value
  if (isRecord(value) && Array.isArray(value.nativePackages))
    return value.nativePackages
  if (isRecord(value) && Array.isArray(value.native_packages))
    return value.native_packages
  return value
}

function parseNativePackages(value: unknown, label: string): NativePackage[] {
  const normalized = normalizeNativePackageArray(value)
  if (!Array.isArray(normalized) || normalized.length > MAX_NATIVE_PACKAGES)
    throw simpleError('invalid_body', `Invalid ${label}`)

  return normalized.map((entry, index) => {
    if (!isRecord(entry))
      throw simpleError('invalid_body', `Invalid ${label}`)

    return {
      name: validateString(entry.name, `${label}.${index}.name`),
      version: validateString(entry.version, `${label}.${index}.version`),
      ios_checksum: validateOptionalString(entry.ios_checksum, `${label}.${index}.ios_checksum`),
      android_checksum: validateOptionalString(entry.android_checksum, `${label}.${index}.android_checksum`),
    }
  })
}

function getSourceNativePackageInput(source: Record<string, unknown>): unknown {
  if (source.nativePackages !== undefined)
    return source.nativePackages
  if (source.native_packages !== undefined)
    return source.native_packages
  if (source.json !== undefined)
    return source.json
  return undefined
}

async function fetchBundleById(
  c: Context<MiddlewareKeyVariables>,
  appId: string,
  bundleId: number,
): Promise<AppVersionRow | null> {
  const supabase = supabaseWithAuth(c, c.get('auth')!)
  const { data, error } = await supabase
    .from('app_versions')
    .select('id, name, created_at, native_packages')
    .eq('app_id', appId)
    .eq('id', bundleId)
    .eq('deleted', false)
    .maybeSingle()

  if (error)
    throw simpleError('cannot_get_bundle', 'Cannot get bundle', { error })
  return data
}

async function fetchBundleByName(
  c: Context<MiddlewareKeyVariables>,
  appId: string,
  bundleName: string,
): Promise<AppVersionRow | null> {
  const supabase = supabaseWithAuth(c, c.get('auth')!)
  const { data, error } = await supabase
    .from('app_versions')
    .select('id, name, created_at, native_packages')
    .eq('app_id', appId)
    .eq('name', bundleName)
    .eq('deleted', false)
    .maybeSingle()

  if (error)
    throw simpleError('cannot_get_bundle', 'Cannot get bundle', { error })
  return data
}

function nativePackagesFromBundleRow(bundle: AppVersionRow): NativePackage[] | null {
  if (bundle.native_packages === null)
    return null
  return parseNativePackages(bundle.native_packages as unknown as Json[], 'native_packages')
}

function resolvedFromBundle(bundle: AppVersionRow): ResolvedBundleSource {
  const nativePackages = nativePackagesFromBundleRow(bundle)
  return {
    source: {
      kind: 'bundle',
      id: bundle.id,
      name: bundle.name,
      nativePackageCount: nativePackages?.length ?? 0,
    },
    nativePackages,
  }
}

async function resolveBundleOrThrow(bundle: Promise<AppVersionRow | null>, label: string): Promise<ResolvedBundleSource> {
  const resolvedBundle = await bundle
  if (!resolvedBundle)
    throw simpleError('bundle_not_found', 'Bundle not found', { source: label })
  return resolvedFromBundle(resolvedBundle)
}

async function resolveScalarSource(
  c: Context<MiddlewareKeyVariables>,
  appId: string,
  sourceInput: number | string,
  label: string,
): Promise<ResolvedBundleSource> {
  const bundleId = typeof sourceInput === 'number' || /^[1-9]\d*$/.test(sourceInput)
    ? validateBundleId(sourceInput, label)
    : undefined

  return resolveBundleOrThrow(
    bundleId
      ? fetchBundleById(c, appId, bundleId)
      : fetchBundleByName(c, appId, validateString(sourceInput, label, MAX_BUNDLE_NAME_LENGTH)),
    label,
  )
}

async function resolveRecordSource(
  c: Context<MiddlewareKeyVariables>,
  appId: string,
  sourceInput: Record<string, unknown>,
  label: string,
): Promise<ResolvedBundleSource> {
  const nativePackageInput = getSourceNativePackageInput(sourceInput)
  if (nativePackageInput !== undefined) {
    const nativePackages = parseNativePackages(nativePackageInput, `${label}.nativePackages`)
    return {
      source: {
        kind: 'native_packages',
        id: sourceInput.bundleId === undefined ? undefined : validateBundleId(sourceInput.bundleId, `${label}.bundleId`),
        name: sourceInput.bundleName === undefined ? undefined : validateString(sourceInput.bundleName, `${label}.bundleName`, MAX_BUNDLE_NAME_LENGTH),
        nativePackageCount: nativePackages.length,
      },
      nativePackages,
    }
  }

  const sourceType = typeof sourceInput.type === 'string' ? sourceInput.type : undefined
  const bundleIdValue = sourceInput.bundleId ?? sourceInput.id
  const bundleNameValue = sourceInput.bundleName ?? sourceInput.name
  if (sourceType === 'bundle_id' || bundleIdValue !== undefined) {
    return resolveBundleOrThrow(
      fetchBundleById(c, appId, validateBundleId(bundleIdValue, `${label}.bundleId`)),
      label,
    )
  }

  if (sourceType === 'bundle_name' || bundleNameValue !== undefined) {
    return resolveBundleOrThrow(
      fetchBundleByName(c, appId, validateString(bundleNameValue, `${label}.bundleName`, MAX_BUNDLE_NAME_LENGTH)),
      label,
    )
  }

  throw simpleError('invalid_body', `Invalid ${label}`)
}

async function resolveSource(
  c: Context<MiddlewareKeyVariables>,
  appId: string,
  sourceInput: unknown,
  label: string,
): Promise<ResolvedBundleSource> {
  if (typeof sourceInput === 'number' || typeof sourceInput === 'string')
    return resolveScalarSource(c, appId, sourceInput, label)

  if (!isRecord(sourceInput))
    throw simpleError('invalid_body', `Invalid ${label}`)

  return resolveRecordSource(c, appId, sourceInput, label)
}

function buildCompareResponse(candidate: ResolvedBundleSource, baseline: ResolvedBundleSource): CompareResponse {
  if (!candidate.nativePackages || !baseline.nativePackages) {
    return {
      candidate: candidate.source,
      baseline: baseline.source,
      comparisons: [],
      summary: { compatible: true, incompatibleCount: 0, offenders: [] },
      reason: 'missing_native_packages',
    }
  }

  const comparisons = compareNativePackages(candidate.nativePackages, baseline.nativePackages)
  const summary = summarizeBundleCompatibility(comparisons)
  return {
    candidate: candidate.source,
    baseline: baseline.source,
    comparisons,
    summary,
    reason: summary.compatible ? 'compatible' : 'incompatible',
  }
}

function buildDefaultChannelResponse(
  appId: string,
  channel: ChannelRow | null,
  reason: BundleCompatibilityReason,
  compareResponse?: CompareResponse,
  deployments?: { currentId?: number, previousId?: number, currentDeployedAt?: string | null },
) {
  const summary = compareResponse?.summary ?? { compatible: true, incompatibleCount: 0, offenders: [] }
  return {
    appId,
    channel,
    alert: !summary.compatible,
    reason,
    deployments,
    candidate: compareResponse?.candidate ?? null,
    baseline: compareResponse?.baseline ?? null,
    comparisons: compareResponse?.comparisons ?? [],
    summary,
  }
}

async function assertCanReadBundles(c: Context<MiddlewareKeyVariables>, appId: string) {
  if (!(await checkPermission(c, 'app.read_bundles', { appId })))
    throw simpleError('app_access_denied', 'You can\'t access this app', { app_id: appId })
}

app.post('/compare', middlewareV2(['read', 'write', 'all', 'upload']), async (c) => {
  const body = await parseBody<CompareBody>(c)
  const appId = validateAppId(body.appId)
  await assertCanReadBundles(c, appId)

  if (body.candidate === undefined || body.baseline === undefined)
    throw simpleError('invalid_body', 'Invalid body')

  cloudlog({ requestId: c.get('requestId'), message: 'bundle compatibility compare', appId })

  const [candidate, baseline] = await Promise.all([
    resolveSource(c, appId, body.candidate, 'candidate'),
    resolveSource(c, appId, body.baseline, 'baseline'),
  ])

  return c.json(buildCompareResponse(candidate, baseline))
})

app.post('/default-channel/latest', middlewareAuth, async (c) => {
  const body = await parseBody<DefaultChannelBody>(c)
  const appId = validateAppId(body.appId)
  await assertCanReadBundles(c, appId)
  const supabase = supabaseWithAuth(c, c.get('auth')!)

  cloudlog({ requestId: c.get('requestId'), message: 'bundle compatibility default-channel latest', appId })

  const { data: appRow, error: appError } = await supabase
    .from('apps')
    .select('default_upload_channel')
    .eq('app_id', appId)
    .maybeSingle()

  if (appError)
    throw simpleError('cannot_get_app', 'Cannot get app', { error: appError })

  if (!appRow?.default_upload_channel)
    return c.json(buildDefaultChannelResponse(appId, null, 'no_default_channel'))

  const { data: channel, error: channelError } = await supabase
    .from('channels')
    .select('id, name, version')
    .eq('app_id', appId)
    .eq('name', appRow.default_upload_channel)
    .maybeSingle()

  if (channelError)
    throw simpleError('cannot_get_channel', 'Cannot get channel', { error: channelError })

  if (!channel)
    return c.json(buildDefaultChannelResponse(appId, null, 'no_default_channel'))

  if (channel.version == null)
    return c.json(buildDefaultChannelResponse(appId, channel, 'default_channel_has_no_bundle'))

  const { data: deploymentRows, error: deploymentsError } = await supabase
    .from('deploy_history')
    .select('id, version_id, deployed_at, created_at')
    .eq('app_id', appId)
    .eq('channel_id', channel.id)
    .order('deployed_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(DEPLOYMENT_LOOKBACK_LIMIT)

  if (deploymentsError)
    throw simpleError('cannot_get_deployments', 'Cannot get deployments', { error: deploymentsError })

  const deploymentPair = selectCurrentDeploymentPair(deploymentRows ?? [], channel.version)
  if (!deploymentPair) {
    const hasCurrentDeployment = (deploymentRows ?? []).some(row => row.version_id === channel.version)
    return c.json(buildDefaultChannelResponse(
      appId,
      channel,
      hasCurrentDeployment ? 'previous_deployment_not_found' : 'current_deployment_not_found',
    ))
  }

  const [candidateBundle, baselineBundle] = await Promise.all([
    fetchBundleById(c, appId, deploymentPair.current.version_id),
    fetchBundleById(c, appId, deploymentPair.previous.version_id),
  ])

  if (!candidateBundle || !baselineBundle)
    return c.json(buildDefaultChannelResponse(appId, channel, 'missing_bundle'))

  const compareResponse = buildCompareResponse(
    resolvedFromBundle(candidateBundle),
    resolvedFromBundle(baselineBundle),
  )

  return c.json(buildDefaultChannelResponse(
    appId,
    channel,
    compareResponse.reason,
    compareResponse,
    {
      currentId: deploymentPair.current.id,
      previousId: deploymentPair.previous.id,
      currentDeployedAt: deploymentPair.current.deployed_at,
    },
  ))
})
