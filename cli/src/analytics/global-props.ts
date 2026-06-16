import { platform, release } from 'node:os'
import { arch, version as nodeVersion } from 'node:process'
import { isCI, name as ciName } from 'ci-info'
import pack from '../../package.json'

export type InvocationSource = 'cli' | 'mcp'

let invocationSource: InvocationSource = 'cli'

export function setInvocationSource(source: InvocationSource): void {
  invocationSource = source
}

export function getInvocationSource(): InvocationSource {
  return invocationSource
}

export interface GlobalAnalyticsProps {
  cli_version: string
  node_version: string
  os_platform: string
  os_arch: string
  os_release: string
  timezone: string
  is_ci: boolean
  is_tty: boolean
  invocation_source: InvocationSource
  ci_provider?: string
}

/**
 * Properties attached to every CLI telemetry event. Injected at the shared
 * sendEvent() send path (see cli/src/utils.ts) so both trackEvent() and the
 * many direct sendEvent() callers are tagged with the runtime OS, arch, OS
 * release, timezone, CLI/Node versions and CI context.
 */
export function getGlobalAnalyticsProps(): GlobalAnalyticsProps {
  const props: GlobalAnalyticsProps = {
    cli_version: pack.version,
    node_version: nodeVersion,
    os_platform: platform(),
    os_arch: arch,
    os_release: release(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    is_ci: isCI,
    is_tty: Boolean(process.stdout.isTTY),
    invocation_source: invocationSource,
  }
  if (ciName)
    props.ci_provider = ciName
  return props
}
