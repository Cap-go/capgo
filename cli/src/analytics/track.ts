import { platform } from 'node:os'
import { arch, env, version as nodeVersion } from 'node:process'
import { isCI, name as ciName } from 'ci-info'
import pack from '../../package.json'
import { isTruthyEnvValue } from '../posthog'
import { findSavedKeySilent, getAppId, getConfig, sendEvent } from '../utils'
import { resolveOwnerOrgId } from './org-resolver'

type InvocationSource = 'cli' | 'mcp'

let invocationSource: InvocationSource = 'cli'

export function setInvocationSource(source: InvocationSource): void {
  invocationSource = source
}

export function getInvocationSource(): InvocationSource {
  return invocationSource
}

export function isTelemetryDisabled(): boolean {
  return isTruthyEnvValue(env.CAPGO_DISABLE_TELEMETRY) || isTruthyEnvValue(env.CAPGO_DISABLE_POSTHOG)
}

export interface GlobalAnalyticsProps {
  cli_version: string
  node_version: string
  os_platform: string
  os_arch: string
  is_ci: boolean
  is_tty: boolean
  invocation_source: InvocationSource
  ci_provider?: string
}

export function getGlobalAnalyticsProps(): GlobalAnalyticsProps {
  const props: GlobalAnalyticsProps = {
    cli_version: pack.version,
    node_version: nodeVersion,
    os_platform: platform(),
    os_arch: arch,
    is_ci: isCI,
    is_tty: Boolean(process.stdout.isTTY),
    invocation_source: invocationSource,
  }
  if (ciName)
    props.ci_provider = ciName
  return props
}

// --- flush registry: keep in-flight telemetry alive until the process drains ---
const pending = new Set<Promise<unknown>>()
const pendingControllers = new Set<AbortController>()

function registerPending(promise: Promise<unknown>): void {
  pending.add(promise)
  void promise.finally(() => pending.delete(promise))
}

export async function flushAnalytics(timeoutMs = 2000): Promise<void> {
  if (pending.size === 0)
    return
  let timer: ReturnType<typeof setTimeout> | undefined
  await Promise.race([
    Promise.allSettled([...pending]),
    new Promise<void>((resolve) => {
      timer = setTimeout(resolve, timeoutMs)
      // Don't let the flush timer itself keep the process alive.
      timer.unref?.()
    }),
  ])
  if (timer)
    clearTimeout(timer)
  // Abort any still-in-flight telemetry so its sockets/timers can't keep the
  // CLI process alive past the flush window (offline / firewalled users).
  for (const controller of pendingControllers)
    controller.abort()
  pendingControllers.clear()
}

// --- best-effort app + owner-org context from the local Capacitor config ---
let cachedContext: Promise<{ appId?: string, orgId?: string }> | undefined

export function resolveTrackingContext(apikey: string, signal?: AbortSignal): Promise<{ appId?: string, orgId?: string }> {
  if (cachedContext)
    return cachedContext
  cachedContext = (async () => {
    try {
      const extConfig = await getConfig(true).catch(() => undefined)
      const appId = getAppId('', extConfig?.config) || undefined
      if (!appId)
        return {}
      const orgId = await resolveOwnerOrgId(apikey, appId, {}, signal)
      return { appId, orgId }
    }
    catch {
      return {}
    }
  })()
  return cachedContext
}

export interface TrackEventInput {
  channel: string
  event: string
  icon?: string
  /** Org id for actor-scoped attribution. Omitted => resolved best-effort. */
  orgId?: string
  /** App id (also lets the backend verify org ownership). */
  appId?: string
  /** Explicit key; falls back to the saved key. No key => no event. */
  apikey?: string
  tags?: Record<string, string | number | boolean>
}

/**
 * Generic v2 actor-scoped event. Never throws. Does nothing when telemetry is
 * disabled or no API key is resolvable (the accepted unauthenticated gap).
 * When the caller omits appId/orgId, both are resolved best-effort from the
 * local Capacitor config (app_id → owner_org) so local commands still get
 * user + org attribution when the user is logged in.
 */
export function trackEvent(input: TrackEventInput): Promise<void> {
  // Sync guards run before we register, so a `void trackEvent()` followed by an
  // immediate flushAnalytics() still observes the in-flight work.
  if (isTelemetryDisabled())
    return Promise.resolve()
  const apikey = input.apikey ?? findSavedKeySilent()
  if (!apikey)
    return Promise.resolve()

  const controller = new AbortController()
  pendingControllers.add(controller)

  const work = (async () => {
    try {
      let appId = input.appId
      let orgId = input.orgId
      if (appId === undefined && orgId === undefined) {
        const ctx = await resolveTrackingContext(apikey, controller.signal)
        appId = ctx.appId
        orgId = ctx.orgId
      }

      const tags: Record<string, string | number | boolean> = {
        ...getGlobalAnalyticsProps(),
        ...(appId ? { app_id: appId } : {}),
        ...(input.tags ?? {}),
      }

      await sendEvent(apikey, {
        channel: input.channel,
        event: input.event,
        icon: input.icon ?? '📊',
        notify: false,
        tracking_version: 2,
        ...(orgId ? { org_id: orgId } : {}),
        tags,
      }, false, controller.signal).catch(() => {})
    }
    catch {
      // telemetry must never break a command
    }
    finally {
      pendingControllers.delete(controller)
    }
  })()

  registerPending(work)
  return work
}

// --- universal command lifecycle ---
const CLI_USAGE_CHANNEL = 'cli-usage'

let commandStartedAt = 0

export interface CommandContext {
  flags: string[]
  positional_arg_count: number
}

interface CommanderLike {
  args: readonly string[]
  opts: () => Record<string, unknown>
  getOptionValueSource: (key: string) => string | undefined
}

/**
 * Pulls only privacy-safe context from a Commander command: the NAMES of
 * user-provided flags (never their values) and the positional arg count.
 */
export function extractCommandContext(command: CommanderLike): CommandContext {
  const flags = Object.keys(command.opts())
    .filter(key => command.getOptionValueSource(key) === 'cli')
    .sort()
  return {
    flags,
    positional_arg_count: command.args.length,
  }
}

export function trackCommandInvoked(commandPath: string, ctx: CommandContext): void {
  commandStartedAt = Date.now()
  void trackEvent({
    channel: CLI_USAGE_CHANNEL,
    event: 'CLI Command Invoked',
    icon: '⚡',
    tags: {
      command_path: commandPath,
      flags: ctx.flags.join(','),
      flags_count: ctx.flags.length,
      positional_arg_count: ctx.positional_arg_count,
    },
  })
}

export function trackCommandSucceeded(commandPath: string): void {
  void trackEvent({
    channel: CLI_USAGE_CHANNEL,
    event: 'CLI Command Succeeded',
    icon: '✅',
    tags: {
      command_path: commandPath,
      ...(commandStartedAt ? { duration_ms: Date.now() - commandStartedAt } : {}),
    },
  })
}

export function trackCommandFailed(commandPath: string, opts: { errorCategory: string, exitCode: number }): void {
  void trackEvent({
    channel: CLI_USAGE_CHANNEL,
    event: 'CLI Command Failed',
    icon: '❌',
    tags: {
      command_path: commandPath,
      error_category: opts.errorCategory,
      exit_code: opts.exitCode,
      ...(commandStartedAt ? { duration_ms: Date.now() - commandStartedAt } : {}),
    },
  })
}

// --- MCP ---
const MCP_CHANNEL = 'mcp'

type AnyAsyncFn = (...args: any[]) => Promise<any>

/**
 * Wraps an MCP tool handler to emit a `MCP Tool Invoked` event with the tool
 * name, success flag, and duration. Re-throws so behavior is unchanged.
 */
export function withMcpToolTracking<H extends AnyAsyncFn>(toolName: string, handler: H): H {
  const wrapped = async (...args: Parameters<H>) => {
    const start = Date.now()
    let success = true
    try {
      const result = await handler(...args)
      if (result && typeof result === 'object' && 'isError' in result && (result as { isError?: unknown }).isError)
        success = false
      return result
    }
    catch (error) {
      success = false
      throw error
    }
    finally {
      void trackEvent({
        channel: MCP_CHANNEL,
        event: 'MCP Tool Invoked',
        icon: '🤖',
        tags: {
          tool_name: toolName,
          success,
          duration_ms: Date.now() - start,
        },
      })
    }
  }
  return wrapped as H
}

export function trackMcpServerStarted(hasApikey: boolean): void {
  void trackEvent({
    channel: MCP_CHANNEL,
    event: 'MCP Server Started',
    icon: '🤖',
    tags: {
      has_apikey: hasApikey,
      mcp_sdk_version: pack.version,
    },
  })
}
