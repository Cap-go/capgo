// src/build/onboarding/mcp/credentials-manage.ts
//
// MCP tool `capgo_builder_credentials_manage`: manage credentials that ALREADY exist for an app —
// export them to a local .env file, or add / edit / remove a single credential field. It deliberately
// does NOT create credentials or run onboarding:
//   - if the app has NO credentials at all, it refuses and points at start_capgo_builder_onboarding;
//   - if the TARGET PLATFORM has no credentials yet (e.g. iOS when only Android is set up), it refuses
//     too — bootstrapping a new platform's signing is onboarding's job, not an ad-hoc field edit.
// Secret VALUES never leave through tool output (export writes them to a 0600 .env file; list shows
// field names only; set takes a value — or a file to base64-encode — without echoing it back).
import type { BuildCredentials } from '../../../schemas/build.js'
import { readFile } from 'node:fs/promises'
import { z } from 'zod'
import {
  loadSavedCredentials,
  removeSavedCredentialKeys,
  updateSavedCredentials,
} from '../../credentials.js'
import { exportCredentialsToEnv } from '../env-export.js'

/** The canonical Capgo credential field names (buildCredentialsSchema). Used only for a gentle typo nudge. */
export const KNOWN_CREDENTIAL_KEYS: ReadonlySet<string> = new Set([
  'BUILD_CERTIFICATE_BASE64',
  'BUILD_PROVISION_PROFILE_BASE64',
  'P12_PASSWORD',
  'APPLE_KEY_ID',
  'APPLE_ISSUER_ID',
  'APPLE_KEY_CONTENT',
  'APP_STORE_CONNECT_TEAM_ID',
  'CAPGO_IOS_PROVISIONING_MAP',
  'ANDROID_KEYSTORE_FILE',
  'KEYSTORE_KEY_ALIAS',
  'KEYSTORE_KEY_PASSWORD',
  'KEYSTORE_STORE_PASSWORD',
  'PLAY_CONFIG_JSON',
  'PLAY_STORE_IN_APP_UPDATE_PRIORITY',
])

export interface CredentialsManageInput {
  action: 'list' | 'export' | 'set' | 'remove'
  platform?: 'ios' | 'android'
  key?: string
  value?: string
  /** For set: a path to a file whose base64 becomes the value (keystores, .p12, service-account JSON). */
  valueFile?: string
  path?: string
  overwrite?: boolean
  appId?: string
}

/** Injectable seam — the registration wires the real credential store + env export; tests pass fakes. */
export interface CredentialsManageDeps {
  getAppId: () => Promise<string | undefined>
  loadSavedCredentials: (appId: string) => Promise<Awaited<ReturnType<typeof loadSavedCredentials>>>
  updateSavedCredentials: typeof updateSavedCredentials
  removeSavedCredentialKeys: typeof removeSavedCredentialKeys
  exportCredentialsToEnv: typeof exportCredentialsToEnv
  /** Read a file and return its base64 — used by set + valueFile. */
  readFileBase64: (path: string) => Promise<string>
}

/** Build the real deps (global credential store) bound to a getAppId resolver. */
export function buildCredentialsManageDeps(getAppId: () => Promise<string | undefined>): CredentialsManageDeps {
  return {
    getAppId,
    loadSavedCredentials: appId => loadSavedCredentials(appId),
    updateSavedCredentials,
    removeSavedCredentialKeys,
    exportCredentialsToEnv,
    readFileBase64: async path => (await readFile(path)).toString('base64'),
  }
}

const PLATFORMS = ['ios', 'android'] as const

/** App has no credentials at all → onboarding is what creates them. */
function appOnboardingRefusal(appId: string): string {
  return [
    `No saved Capgo Builder credentials exist for "${appId}".`,
    `capgo_builder_credentials_manage only manages credentials that ALREADY exist — it never creates them or runs setup.`,
    `To set up credentials for the first time, call start_capgo_builder_onboarding instead.`,
  ].join('\n')
}

/** The target platform has no credentials yet → setting one up is onboarding, not a field edit. */
function platformOnboardingRefusal(appId: string, platform: 'ios' | 'android'): string {
  return [
    `No ${platform} credentials exist for "${appId}" — only manage credentials for a platform that is already set up.`,
    `Adding a brand-new platform's signing credentials is onboarding's job, not an ad-hoc edit.`,
    `To set up ${platform}, call start_capgo_builder_onboarding({ platform: "${platform}" }) instead.`,
  ].join('\n')
}

/**
 * Run one credentials-manage action and return human-facing text (the MCP tool wraps it as a text block).
 * Returns guidance instead of throwing for every expected "can't do that" case so the assistant can recover.
 */
export async function runCredentialsManage(input: CredentialsManageInput, deps: CredentialsManageDeps): Promise<string> {
  const appId = input.appId ?? await deps.getAppId()
  if (!appId)
    return 'Could not determine the app id. Run this from a Capacitor project, or pass appId. Nothing was changed.'

  // App-level gate: this tool only manages credentials that already exist. Creating them is onboarding's job.
  const saved = await deps.loadSavedCredentials(appId)
  if (!saved || (!saved.ios && !saved.android))
    return appOnboardingRefusal(appId)

  // Platform-level gate: export/set/remove only operate on a platform that is ALREADY set up.
  if (input.action === 'export' || input.action === 'set' || input.action === 'remove') {
    if (!input.platform)
      return `action:"${input.action}" needs a platform ("ios" or "android"). Use action:"list" to see which platforms have credentials.`
    const platCreds = saved[input.platform]
    if (!platCreds || Object.keys(platCreds).length === 0)
      return platformOnboardingRefusal(appId, input.platform)
  }

  switch (input.action) {
    case 'list': {
      const present = PLATFORMS.filter(p => saved[p] && Object.keys(saved[p] ?? {}).length > 0)
      const lines = present.map((p) => {
        const keys = Object.keys(saved[p] ?? {}).sort()
        return `  ${p}: ${keys.join(', ')}`
      })
      return [
        `Saved Capgo Builder credentials for "${appId}" (field NAMES only — values are never shown):`,
        ...lines,
        ``,
        `Next: action:"export" writes a platform's credentials to a local .env file; action:"set"/"remove" edits one field.`,
      ].join('\n')
    }

    case 'export': {
      const creds = saved[input.platform!]!
      const result = deps.exportCredentialsToEnv({ appId, platform: input.platform!, credentials: creds, targetPath: input.path, overwrite: input.overwrite })
      if (result.kind === 'empty')
        return `The ${input.platform} credentials for "${appId}" have no exportable values. Nothing was written.`
      if (result.kind === 'exists')
        return `A file already exists at ${result.path}. Re-run with overwrite:true to replace it. Nothing was written.`
      return `Exported ${result.fieldCount} ${input.platform} credential field(s) for "${appId}" to ${result.path} (mode 0600 — it holds secrets, so keep it out of git / add it to .gitignore).`
    }

    case 'set': {
      if (!input.key)
        return 'action:"set" needs a key (the credential field name, e.g. "KEYSTORE_STORE_PASSWORD" or "ANDROID_KEYSTORE_FILE").'
      let value = input.value
      if (input.valueFile) {
        try {
          value = await deps.readFileBase64(input.valueFile)
        }
        catch (e) {
          return `Could not read the file at "${input.valueFile}" (${e instanceof Error ? e.message : String(e)}). Nothing was changed.`
        }
      }
      if (value === undefined)
        return 'action:"set" needs a value, or a valueFile (a path to base64-encode — for keystores, .p12, or service-account JSON).'
      await deps.updateSavedCredentials(appId, input.platform!, { [input.key]: value } as Partial<BuildCredentials>)
      const src = input.valueFile ? ` from ${input.valueFile}` : ''
      const note = KNOWN_CREDENTIAL_KEYS.has(input.key) ? '' : ` (heads-up: "${input.key}" is not a standard Capgo credential field — double-check the name)`
      return `Set ${input.key} for ${input.platform} on "${appId}"${src}${note}. The value was saved but not echoed back.`
    }

    case 'remove': {
      if (!input.key)
        return 'action:"remove" needs a key (the credential field name to remove).'
      const platCreds = saved[input.platform!] ?? {}
      if (!(input.key in platCreds))
        return `"${input.key}" is not set for ${input.platform} on "${appId}". Nothing to remove. Use action:"list" to see the saved fields.`
      await deps.removeSavedCredentialKeys(appId, input.platform!, [input.key])
      return `Removed ${input.key} from ${input.platform} on "${appId}".`
    }

    default:
      return `Unknown action "${String((input as { action?: unknown }).action)}". Use one of: list, export, set, remove.`
  }
}

/** zod shape for the tool's arguments. */
export const credentialsManageSchema = {
  action: z.enum(['list', 'export', 'set', 'remove']).describe('list = show which fields are saved (names only); export = write a platform\'s credentials to a local .env; set = add or edit one field; remove = delete one field.'),
  platform: z.enum(['ios', 'android']).optional().describe('Required for export/set/remove. The platform whose credentials to act on (must already be set up).'),
  key: z.string().optional().describe('For set/remove: the credential field name (e.g. KEYSTORE_STORE_PASSWORD, ANDROID_KEYSTORE_FILE, PLAY_CONFIG_JSON, P12_PASSWORD).'),
  value: z.string().optional().describe('For set: the new value to save (never echoed back).'),
  valueFile: z.string().optional().describe('For set: a path to a file whose contents are base64-encoded into the value — use for FILE fields like ANDROID_KEYSTORE_FILE, PLAY_CONFIG_JSON, or BUILD_CERTIFICATE_BASE64.'),
  path: z.string().optional().describe('For export: the target .env path. Defaults to .env.capgo.<appId>.<platform> in the project dir.'),
  overwrite: z.boolean().optional().describe('For export: overwrite the target file if it already exists.'),
  appId: z.string().optional().describe('App id to target. Defaults to the current Capacitor project.'),
}

const CREDENTIALS_MANAGE_DESCRIPTION
  = 'Manage Capgo Builder credentials that ALREADY exist for the app: export them to a local .env file, or add / edit / remove a single credential field (list / export / set / remove). '
    + 'Use this ONLY when the platform already has credentials saved — for example to fix a wrong keystore/password after a build fails, rotate a key, or export the credentials. '
    + 'Do NOT use it to set up, connect, configure, or troubleshoot native builds for the FIRST time, and do NOT use it when no credentials exist yet (or for a platform that is not set up): that is what start_capgo_builder_onboarding is for; call that instead. '
    + 'This tool never creates credentials or runs onboarding — if none exist it refuses and tells you to onboard. '
    + 'To replace a keystore / .p12 / service-account FILE, pass valueFile (a path); the tool base64-encodes it. '
    + 'Secret values never leave through tool output: export writes them to a 0600 .env file, list shows field NAMES only, and set takes a value (or file) you provide without echoing it back.'

/** Minimal MCP server surface this registers against (mirrors onboarding-tools' McpLike.tool). */
interface ToolRegistrar {
  tool: (
    name: string,
    description: string,
    schema: Record<string, unknown>,
    handler: (args: CredentialsManageInput) => Promise<{ content: Array<{ type: 'text', text: string }> }>,
  ) => unknown
}

/** Register `capgo_builder_credentials_manage` on the given MCP server, bound to a getAppId resolver. */
export function registerCredentialsManageTool(
  server: ToolRegistrar,
  getAppId: () => Promise<string | undefined>,
  depsOverride?: CredentialsManageDeps,
): void {
  const deps = depsOverride ?? buildCredentialsManageDeps(getAppId)
  server.tool(
    'capgo_builder_credentials_manage',
    CREDENTIALS_MANAGE_DESCRIPTION,
    credentialsManageSchema,
    async (args: CredentialsManageInput) => {
      const text = await runCredentialsManage(args, deps)
      return { content: [{ type: 'text' as const, text }] }
    },
  )
}
