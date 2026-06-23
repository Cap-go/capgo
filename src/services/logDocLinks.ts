export const LOG_DEBUGGING_DOC_BASE = 'https://capgo.app/docs/plugins/updater/debugging/'

// Doc headings use snake_case labels with camelCase aliases in parentheses.
// Only keep overrides where the published heading does not follow that pattern.
const DOC_HEADING_PRIMARY_OVERRIDES: Record<string, string> = {
  disablePlatformIos: 'disabled_platform_ios',
  disablePlatformAndroid: 'disabled_platform_android',
  channelMisconfigured: 'misconfigured_channel',
  NoChannelOrOverride: 'no_channel',
  keyMismatch: 'key_id_mismatch',
  noNew: 'no_new_version_available',
  InvalidIp: 'invalid_ip',
  disableAutoUpdateMetadata: 'disable_auto_update_to_metadata',
}

const DOC_HEADING_LEGACY_ALIASES: Record<string, string[]> = {
  needPlanUpgrade: ['needUpgrade'],
}

function camelToSnake(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1_$2')
    .toLowerCase()
}

function slugifyDocHeading(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/[(),]/g, '')
    .trim()
    .replace(/ +/g, '-')
}

function actionToDocHeading(action: string): string {
  if (/^download_\d+$/.test(action))
    return 'download_0 to download_90'

  if (!/[A-Z]/.test(action) && action === action.toLowerCase())
    return action

  if (action === 'customIdBlocked')
    return action

  const primary = DOC_HEADING_PRIMARY_OVERRIDES[action] ?? camelToSnake(action)
  const aliases = [action, ...(DOC_HEADING_LEGACY_ALIASES[action] ?? [])]
  return `${primary} (${aliases.join(', ')})`
}

export function getLogDocAnchor(action: string): string {
  return slugifyDocHeading(actionToDocHeading(action))
}

export function getLogDocUrl(action: string): string {
  return `${LOG_DEBUGGING_DOC_BASE}#${getLogDocAnchor(action)}`
}
