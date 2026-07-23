import { type } from 'arktype'

const deviceIdRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const reverseDomainRegex = /^[a-z0-9]+(\.[\w-]+)+$/i
const commonSemverRegex = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/

export const updateRequestSchemaArk = type({
  app_id: 'string',
  device_id: 'string <= 36',
  version_name: 'string > 0',
  version_build: 'string > 0',
  is_emulator: 'boolean',
  is_prod: 'boolean',
  platform: "'ios' | 'android' | 'electron'",
  plugin_version: 'string',
  'defaultChannel?': 'string',
  'install_source?': 'string <= 64',
  'key_id?': 'string <= 20',
}).narrow((data, ctx) => {
  if (!reverseDomainRegex.test(data.app_id))
    return ctx.mustBe('a reverse domain app_id')
  if (!deviceIdRegex.test(data.device_id))
    return ctx.mustBe('a uuid device_id')
  if (!commonSemverRegex.test(data.plugin_version))
    return ctx.mustBe('a semver plugin_version')
  return true
})
