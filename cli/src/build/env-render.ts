import type { BuildCredentials } from '../schemas/build'
import { Buffer } from 'node:buffer'

export function renderEnvFile(args: { appId: string, local: boolean, platform: 'ios' | 'android', creds: Partial<BuildCredentials> }): string {
  const { appId, local, platform, creds } = args
  const lines: string[] = []
  const generated = new Date().toISOString()
  lines.push('# Capgo build credentials — CI/CD environment file')
  lines.push(`# App: ${appId}`)
  lines.push(`# Platform: ${platform}`)
  lines.push(`# Source: ${local ? 'local' : 'global'} credentials store`)
  lines.push(`# Generated: ${generated}`)
  lines.push('#')
  lines.push('# Paste these into your CI/CD provider as secrets, or source the file locally:')
  lines.push('#   set -a; . ./this-file; set +a')
  lines.push('#')
  lines.push('# DO NOT commit this file. Add to .gitignore: .env.capgo.*')
  lines.push('')

  const provisioningMapRaw = creds.CAPGO_IOS_PROVISIONING_MAP
  for (const [key, value] of Object.entries(creds)) {
    if (typeof value !== 'string' || value.length === 0)
      continue
    if (key === 'CAPGO_IOS_PROVISIONING_MAP')
      continue
    lines.push(`${key}=${escapeDotenvValue(value)}`)
  }

  if (provisioningMapRaw) {
    const base64 = Buffer.from(provisioningMapRaw, 'utf-8').toString('base64')
    lines.push('')
    lines.push('# Provisioning map — base64 form is preferred to avoid newline/quoting issues in CI.')
    lines.push(`CAPGO_IOS_PROVISIONING_MAP_BASE64=${base64}`)
    lines.push(`# CAPGO_IOS_PROVISIONING_MAP=${escapeDotenvValue(provisioningMapRaw)}`)
  }

  lines.push('')
  return lines.join('\n')
}

export function escapeDotenvValue(value: string): string {
  if (/^[\w./+=:-]+$/.test(value))
    return value
  const escaped = value
    .replaceAll('\\', '\\\\')
    .replaceAll('"', '\\"')
    .replaceAll('$', '\\$')
    .replaceAll('`', '\\`')
    .replaceAll('\n', '\\n')
  return `"${escaped}"`
}
