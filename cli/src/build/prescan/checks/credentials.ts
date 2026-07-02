// src/build/prescan/checks/credentials.ts
import type { Finding, PrescanCheck, ScanContext } from '../types'

const REQUIRED: Record<'ios' | 'android', string[]> = {
  ios: ['BUILD_CERTIFICATE_BASE64', 'CAPGO_IOS_PROVISIONING_MAP', 'APP_STORE_CONNECT_TEAM_ID'],
  android: ['ANDROID_KEYSTORE_FILE', 'KEYSTORE_KEY_ALIAS'],
}

export const credentialsSaved: PrescanCheck = {
  id: 'shared/credentials-saved',
  platforms: ['ios', 'android'],
  async run(ctx: ScanContext): Promise<Finding[]> {
    const creds = ctx.credentials
    if (!creds || Object.keys(creds).length === 0) {
      return [{
        id: 'shared/credentials-saved',
        severity: 'error',
        title: `No ${ctx.platform} build credentials found`,
        fix: `Save them first: npx @capgo/cli build credentials save --appId ${ctx.appId} --platform ${ctx.platform}`,
      }]
    }
    const missing = REQUIRED[ctx.platform].filter(k => !creds[k])
    if (ctx.platform === 'android' && !creds.KEYSTORE_STORE_PASSWORD && !creds.KEYSTORE_KEY_PASSWORD)
      missing.push('KEYSTORE_STORE_PASSWORD (or KEYSTORE_KEY_PASSWORD)')
    if (missing.length > 0) {
      return [{
        id: 'shared/credentials-saved',
        severity: 'error',
        title: `Incomplete ${ctx.platform} credentials`,
        detail: `missing: ${missing.join(', ')}`,
        fix: 'Re-run `build credentials save` with the missing values',
      }]
    }
    return []
  },
}
